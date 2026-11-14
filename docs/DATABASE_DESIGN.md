# Database design and correctness

The schema uses eight lower-case `snake_case` tables mapped to Prisma models. UUID primary keys identify records independently of presentation labels. Money is integer paise (`4000` = ₹40); timestamps use `timestamptz(3)`. Prisma's `_prisma_migrations` is operational metadata, not a ninth business table.

| Table                | Purpose and notable fields                                                                                                                                                                     |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `users`              | Identity, bcrypt hash, capabilities array in `role`, account status, verification flag, session version, JSON notification/audit arrays                                                        |
| `parking_spots`      | Host, coordinates, IANA time zone, hourly paise, supported vehicles, type, bay number, access instructions, images, permission, review/active state, audit                                     |
| `availability_slots` | Recurring weekday, `HH:mm` local start/end (`24:00` permitted at end), effective date range and active flag                                                                                    |
| `bookings`           | Driver, space, vehicle, scheduled interval, reservation/payment states, snapshotted policy/terms, expiring hold, separate physical occupancy, verified arrival/exit, fines, disputes and audit |
| `payments`           | Signed demo ledger, payment type/method/state, unique transaction reference and request key                                                                                                    |
| `reviews`            | One rating/comment per own completed booking, reviewer and space foreign keys                                                                                                                  |
| `blocked_slots`      | Host-created absolute interval, reason and creating user                                                                                                                                       |
| `vehicles`           | Driver, plate, type/model and soft-removal flag                                                                                                                                                |

All business relationships use foreign keys with restricted deletion. Vehicle removal sets `is_active=false`; listings are paused/rejected and accounts suspended. Payment/booking history cannot disappear when someone removes a vehicle. Mutable vehicle labels are not a legal vehicle identity archive; IDs and original booking relationships remain intact.

## Concurrency and temporary holds

1. Begin a PostgreSQL transaction at READ COMMITTED.
2. Lock the relevant parking-space row with `SELECT ... FOR UPDATE` **before** reading inventory state.
3. Retire `PAYMENT_PENDING` rows whose `hold_expires_at <= authoritative now` to `EXPIRED`.
4. Validate ownership, supported vehicle, approved/active host/listing, schedule coverage, blocks, overdue physical occupancy, interval and idempotency payload.
5. Create the hold, payment/state change, cancellation/refund or block.
6. Commit the state and related notices/ledger atomically.

The raw safety migration installs `btree_gist` and this exclusion rule:

```sql
EXCLUDE USING gist (
  parking_spot_id WITH =,
  tstzrange(start_time, end_time, '[)') WITH &&
) WHERE (booking_status IN (
  'PAYMENT_PENDING','CONFIRMED','CHECKED_IN','CHECKOUT_PENDING'
));
```

SQL index predicates cannot safely depend on the moving value of `now()`. Holds therefore remain in the predicate until explicitly expired. Every allocation retires stale holds while holding the same inventory lock; a 30-second worker is convenience cleanup, not a correctness dependency. A direct SQL writer that bypasses the API may see stale expired holds as unavailable, but cannot create overlapping reservations. Never remove the exclusion rule to clear a hold; update its status transactionally.

Cancelled, expired, no-show, completed and waitlisted rows do not reserve scheduled time. A unique partial index `WHERE occupied` separately guarantees at most one physically parked vehicle per space. Occupied sessions keep their active booking status even after scheduled end. New holds are rejected while a previous occupant is overdue. An existing next reservation cannot check in and gets an in-app warning and full-refund option.

The application locks the same parking row for bookings, payment, cancellation, recurring schedule changes, listing review and blocks. SQL triggers also check cross-table booking/block conflicts. GiST constraints protect against overlapping reservations even if an application precheck is missed. Bulk/manual SQL writers must follow the documented parking-row-lock protocol for cross-table writes; application authorization is not a substitute for trusted database credentials.

Idempotency keys are scoped to the acting user. Reservation replays return the same booking only if space, vehicle and times match. Payment replays also compare booking, method, type and requested outcome. Unique successful-booking/fine-payment indexes prevent a new key from charging twice. Payment success validates the unexpired hold and confirms atomically. Failure records a failed attempt but retains the hold until its original expiry. Retrying uses a new key; ambiguous network retries use the original key.

## Policies

- Reservations: 15 minutes–24 hours; `[start,end)` permits back-to-back bookings. Recurring windows are interpreted in the space's IANA zone, default Asia/Kolkata. Overlapping recurring definitions are rejected by another exclusion constraint over space, weekday, effective date range and local minute range.
- Cancel >60 minutes before start: free. From exactly 60 minutes until start: 10%. At/after start: 25% if unoccupied. Host/admin cancellation or unavailable-space protection: full refund. Occupied bookings cannot cancel. Cancellation after physical checkout is outside this workflow; completed bookings retain history.
- A paid cancellation records `REFUND=-original_total`, then `CANCELLATION_FEE=fee`. This yields net fee and never double counts the original booking.
- Overstay: 10 minutes grace, ₹20 per started 15 minutes afterward. At 35 minutes late: `ceil((35-10)/15)*20=₹40`. Rules are snapshotted per booking. A checkout request caps accumulation at request+15 minutes to protect against host confirmation delay, while occupancy persists. A dispute caps at the earlier existing cap or dispute time. Administrators review evidence; pressing either button does not release physical occupancy.
- No-show: only an owning host/admin can report after 30 minutes and explicitly verify absence. Remaining reservation is released; net 25% simulated fee applies. The driver gets an auditable notice and may dispute. Admin can reverse the fee with a negative refund. No automatic absence inference is made from button inactivity.
- Waitlist: nonblocking `WAITLISTED` bookings; no charge or guaranteed reservation. Eligible waiters are evaluated in creation order and all eligible drivers receive the same availability notice in the committing release transaction. Allocation is first successful locked reservation, not an exclusive invitation or a promised queue position. This is transparent best-effort fairness; no driver is auto-charged.
- Fine adjustments: zero-value `ADJUSTMENT` entries record review events; booking audit contains reason and target amount. Already paid fines reduced/waived produce only the outstanding negative refund difference. They cannot later be increased to claim uncollected revenue.

## Database concepts used in DriveShare

| Concept                    | Concrete use                                                                                                          |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Atomicity                  | Payment insertion and booking confirmation commit together; cancellation, refunds and wait notices roll back together |
| Consistency                | Foreign keys, valid intervals, rating range, signed accounting checks, exclusion/unique indexes                       |
| Isolation                  | Parking-row locks serialize competing inventory operations before decisions                                           |
| Durability                 | Committed PostgreSQL rows persist on the named Docker volume; backups are still required                              |
| Transactions               | `transaction()` wraps booking, payment, block, cancellation and occupancy operations                                  |
| Primary keys               | UUID `id` on every table                                                                                              |
| Foreign keys               | `bookings.driver_id`, `vehicle_id`, `parking_spot_id`, and `payments.booking_id` preserve references                  |
| Joins                      | Booking history includes space/vehicle/payments; host earnings join payment→booking→space                             |
| Indexes                    | Space/city review state, driver/status, interval lookups, hold expiry, GiST ranges and unique payment keys            |
| Normalization              | Drivers, vehicles, spaces, bookings and ledger entries have independent identities and 1:N relationships              |
| Deliberate denormalization | Immutable booking price/policy/access snapshots and JSON dispute/audit/notice data avoid extra operational tables     |
| Constraints                | No owner self-bookings; no duplicate review; completed own booking required; positive prices and valid coordinates    |
| Temporal queries           | `start < requested_end AND end > requested_start`, `tstzrange &&`, hold expiry and zoned recurring coverage           |

Example net earnings query (failed attempts are excluded):

```sql
SELECT s.owner_id, SUM(p.amount) AS net_paise
FROM payments p
JOIN bookings b ON b.id=p.booking_id
JOIN parking_spots s ON s.id=b.parking_spot_id
WHERE p.payment_status='SUCCESS'
GROUP BY s.owner_id;
```

PostgreSQL range/exclusion rationale: [official range documentation](https://www.postgresql.org/docs/17/rangetypes.html). Migrations are intentionally versioned SQL, including features not represented by Prisma's model DSL. Do not use `prisma db push` as a replacement for migrations; it does not reproduce this safety layer.
