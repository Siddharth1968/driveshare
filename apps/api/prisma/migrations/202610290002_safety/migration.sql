CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (cardinality(role)>0 AND role <@ ARRAY['DRIVER','OWNER','ADMIN']::text[]);
ALTER TABLE users ADD CONSTRAINT users_account_status_check CHECK (account_status IN ('ACTIVE','SUSPENDED'));
ALTER TABLE users ADD CONSTRAINT users_email_lowercase CHECK (email = lower(email));
ALTER TABLE parking_spots ADD CONSTRAINT spot_price_positive CHECK (hourly_price > 0);
ALTER TABLE parking_spots ADD CONSTRAINT spot_coordinates CHECK (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180);
ALTER TABLE parking_spots ADD CONSTRAINT spot_approval CHECK (approval_status IN ('PENDING','APPROVED','REJECTED') AND (approval_status <> 'APPROVED' OR permission_confirmed));
ALTER TABLE parking_spots ADD CONSTRAINT spot_vehicle_types CHECK (cardinality(vehicle_type_supported)>0 AND vehicle_type_supported <@ ARRAY['CAR','TWO_WHEELER']::text[]);
ALTER TABLE parking_spots ADD CONSTRAINT spot_type CHECK (parking_type IN ('COVERED','OPEN','GATED'));
ALTER TABLE vehicles ADD CONSTRAINT vehicle_type CHECK (vehicle_type IN ('CAR','TWO_WHEELER'));
ALTER TABLE availability_slots ADD CONSTRAINT schedule_valid CHECK (day_of_week BETWEEN 0 AND 6 AND start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND end_time ~ '^(([01][0-9]|2[0-3]):[0-5][0-9]|24:00)$' AND start_time < end_time AND (effective_until IS NULL OR effective_until >= effective_from));
ALTER TABLE availability_slots ADD CONSTRAINT schedule_no_overlap EXCLUDE USING gist (
  parking_spot_id WITH =, day_of_week WITH =,
  daterange(effective_from,effective_until,'[]') WITH &&,
  int4range((split_part(start_time,':',1)::int*60+split_part(start_time,':',2)::int),(split_part(end_time,':',1)::int*60+split_part(end_time,':',2)::int),'[)') WITH &&
) WHERE (is_active);
ALTER TABLE bookings ADD CONSTRAINT booking_valid_interval CHECK (end_time>start_time);
ALTER TABLE bookings ADD CONSTRAINT booking_amounts CHECK (total_amount>=0 AND price_snapshot>0 AND fine_amount>=0 AND overstay_minutes>=0);
ALTER TABLE bookings ADD CONSTRAINT booking_status CHECK (booking_status IN ('PAYMENT_PENDING','CONFIRMED','CHECKED_IN','CHECKOUT_PENDING','COMPLETED','CANCELLED','EXPIRED','NO_SHOW','WAITLISTED'));
ALTER TABLE bookings ADD CONSTRAINT booking_payment_status CHECK (payment_status IN ('PENDING','SUCCESS','FAILED','REFUNDED'));
ALTER TABLE bookings ADD CONSTRAINT booking_paid_confirmation CHECK (booking_status NOT IN ('CONFIRMED','CHECKED_IN','CHECKOUT_PENDING','COMPLETED') OR payment_status='SUCCESS');
ALTER TABLE bookings ADD CONSTRAINT booking_hold_expiry CHECK (booking_status <> 'PAYMENT_PENDING' OR hold_expires_at IS NOT NULL);
ALTER TABLE bookings ADD CONSTRAINT booking_occupancy_state CHECK ((NOT occupied OR (booking_status IN ('CHECKED_IN','CHECKOUT_PENDING') AND checked_in_at IS NOT NULL AND actual_exit_time IS NULL)) AND (booking_status NOT IN ('CHECKED_IN','CHECKOUT_PENDING') OR occupied));
ALTER TABLE bookings ADD CONSTRAINT booking_fine_status CHECK (fine_status IN ('NONE','OUTSTANDING','PAID','DISPUTED','WAIVED'));
ALTER TABLE bookings ADD CONSTRAINT bookings_exit_confirmed_by_fkey FOREIGN KEY (exit_confirmed_by) REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE bookings ADD CONSTRAINT booking_no_overlap EXCLUDE USING gist (
  parking_spot_id WITH =, tstzrange(start_time,end_time,'[)') WITH &&
) WHERE (booking_status IN ('PAYMENT_PENDING','CONFIRMED','CHECKED_IN','CHECKOUT_PENDING'));
CREATE UNIQUE INDEX one_occupied_vehicle_per_spot ON bookings(parking_spot_id) WHERE occupied;
CREATE INDEX pending_hold_expiry ON bookings(hold_expires_at) WHERE booking_status='PAYMENT_PENDING';
ALTER TABLE blocked_slots ADD CONSTRAINT blocked_valid_interval CHECK(end_time>start_time);
ALTER TABLE blocked_slots ADD CONSTRAINT blocks_no_overlap EXCLUDE USING gist(parking_spot_id WITH =,tstzrange(start_time,end_time,'[)') WITH &&);
ALTER TABLE payments ADD CONSTRAINT payment_type CHECK (payment_type IN ('BOOKING','CANCELLATION_FEE','OVERSTAY_FINE','REFUND','ADJUSTMENT'));
ALTER TABLE payments ADD CONSTRAINT payment_status CHECK (payment_status IN ('PENDING','SUCCESS','FAILED','REFUNDED'));
ALTER TABLE payments ADD CONSTRAINT payment_direction CHECK ((payment_type='REFUND' AND amount<0) OR (payment_type<>'REFUND' AND amount>=0));
ALTER TABLE payments ADD CONSTRAINT demo_method CHECK (payment_method IN ('DEMO_UPI','DEMO_CARD','DEMO_CASH','DEMO_SYSTEM'));
CREATE UNIQUE INDEX one_successful_booking_payment ON payments(booking_id) WHERE payment_type='BOOKING' AND payment_status='SUCCESS';
CREATE UNIQUE INDEX one_successful_fine_payment ON payments(booking_id) WHERE payment_type='OVERSTAY_FINE' AND payment_status='SUCCESS';
ALTER TABLE reviews ADD CONSTRAINT review_rating CHECK(rating BETWEEN 1 AND 5);

-- Cross-table inventory writes use the same parking-row lock as the API.
-- Constraints are the final backstop; application transactions acquire this lock
-- BEFORE reading state so READ COMMITTED queries see the preceding committer.
CREATE FUNCTION inventory_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM id FROM parking_spots WHERE id=NEW.parking_spot_id FOR UPDATE;
  IF TG_TABLE_NAME='blocked_slots' THEN
    IF EXISTS(SELECT 1 FROM bookings WHERE parking_spot_id=NEW.parking_spot_id
      AND booking_status IN ('PAYMENT_PENDING','CONFIRMED','CHECKED_IN','CHECKOUT_PENDING')
      AND tstzrange(start_time,end_time,'[)') && tstzrange(NEW.start_time,NEW.end_time,'[)')) THEN
      RAISE EXCEPTION 'Block conflicts with active reservation' USING ERRCODE='23P01';
    END IF;
  ELSE
    IF NEW.booking_status IN ('PAYMENT_PENDING','CONFIRMED','CHECKED_IN','CHECKOUT_PENDING') AND EXISTS(
      SELECT 1 FROM blocked_slots WHERE parking_spot_id=NEW.parking_spot_id
      AND tstzrange(start_time,end_time,'[)') && tstzrange(NEW.start_time,NEW.end_time,'[)')) THEN
      RAISE EXCEPTION 'Reservation conflicts with blocked interval' USING ERRCODE='23P01';
    END IF;
    IF EXISTS(SELECT 1 FROM parking_spots WHERE id=NEW.parking_spot_id AND owner_id=NEW.driver_id) THEN
      RAISE EXCEPTION 'Owner cannot book own space' USING ERRCODE='23514';
    END IF;
    IF NOT EXISTS(SELECT 1 FROM vehicles WHERE id=NEW.vehicle_id AND user_id=NEW.driver_id) THEN
      RAISE EXCEPTION 'Vehicle must belong to booking driver' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER bookings_inventory_guard BEFORE INSERT OR UPDATE OF parking_spot_id,start_time,end_time,booking_status ON bookings FOR EACH ROW EXECUTE FUNCTION inventory_guard();
CREATE TRIGGER blocks_inventory_guard BEFORE INSERT OR UPDATE ON blocked_slots FOR EACH ROW EXECUTE FUNCTION inventory_guard();
CREATE FUNCTION completed_review_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM bookings b JOIN parking_spots s ON s.id=b.parking_spot_id
    WHERE b.id=NEW.booking_id AND b.booking_status='COMPLETED' AND b.driver_id=NEW.reviewer_id
    AND b.parking_spot_id=NEW.parking_spot_id AND s.owner_id<>NEW.reviewer_id) THEN
    RAISE EXCEPTION 'Review requires own completed booking' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER reviews_completed_guard BEFORE INSERT OR UPDATE ON reviews FOR EACH ROW EXECUTE FUNCTION completed_review_guard();
