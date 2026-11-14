import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  CarFront,
  Clock3,
  Plus,
  MapPin,
  Wallet,
  AlertTriangle,
  CheckCircle2,
  CreditCard,
  Smartphone,
  Banknote,
  ShieldCheck,
  ChevronLeft,
  Trash2,
  Pencil,
  Star,
} from 'lucide-react';
import { api, post, money, dateTime, label, queryClient } from './api';
import type { Booking, Vehicle, Payment } from './types';
import { HostBookings } from './HostBookings';
import { durationText } from './booking-time';
import {
  useAuth,
  useToast,
  useConfig,
  PageTitle,
  Loading,
  ErrorState,
  Empty,
  Stat,
  Badge,
  Field,
  DemoWarning,
} from './ui';

export function useBookings(owner = false) {
  return useQuery({
    queryKey: ['bookings', owner],
    queryFn: () => api<Booking[]>(`/bookings${owner ? '?scope=owner' : ''}`),
    refetchInterval: 5000,
  });
}
export function BookingRow({ booking: b }: { booking: Booking }) {
  return (
    <Link className="booking-row" to={`/bookings/${b.id}`}>
      <img src={b.spot.images[0] ?? '/demo/parking-1.svg'} alt="" />
      <div className="booking-row-main">
        <h3>{b.termsSnapshot.title ?? b.spot.title}</h3>
        <code className="booking-reference">{b.id}</code>
        <p>
          <CalendarDays size={14} />
          {dateTime(b.startTime)} — {dateTime(b.endTime)}
        </p>
        <span className="small muted">
          {b.vehicle.registrationNumber}
          {b.driver ? ` · ${b.driver.fullName}` : ''}
        </span>
        {b.spaceUnavailable && (
          <span className="small text-amber">
            Previous vehicle still parked · full refund available
          </span>
        )}
      </div>
      <div className="booking-row-status">
        <strong>{money(b.totalAmount)}</strong>
        <Badge value={b.bookingStatus} />
        {b.occupied && <span className="small text-teal">Physically occupied</span>}
      </div>
      <ArrowUpRight size={18} />
    </Link>
  );
}
export function DriverDashboard() {
  const user = useAuth();
  const bookings = useBookings();
  const { data: vehicles = [] } = useQuery({
    queryKey: ['vehicles'],
    queryFn: () => api<Vehicle[]>('/vehicles'),
  });
  const { data: payments = [] } = useQuery({
    queryKey: ['payments', false],
    queryFn: () => api<Payment[]>('/payments'),
  });
  if (bookings.isPending) return <Loading />;
  if (bookings.error) return <ErrorState error={bookings.error} />;
  const all = bookings.data ?? [];
  const upcoming = all.filter((b) => ['CONFIRMED', 'PAYMENT_PENDING'].includes(b.bookingStatus));
  const active = all.filter((b) => b.occupied);
  const fines = all
    .filter((b) => b.fineStatus === 'OUTSTANDING')
    .reduce((s, b) => s + b.fineAmount, 0);
  const spending = payments
    .filter((p) => p.paymentStatus === 'SUCCESS')
    .reduce((s, p) => s + p.amount, 0);
  return (
    <>
      <PageTitle
        eyebrow="YOUR DAY, WITH A LITTLE MORE ROOM"
        title={`Hello, ${user.data?.fullName.split(' ')[0]}.`}
        text="A good day starts with knowing where to park."
        action={
          <Link className="btn" to="/explore">
            <Plus size={17} />
            Find a space
          </Link>
        }
      />
      <div className="stats-grid">
        <Stat
          title="Upcoming reservations"
          value={upcoming.length}
          detail="A spot saved for your plans"
          icon={<CalendarDays size={18} />}
        />
        <Stat
          title="Simulated spending"
          value={money(spending)}
          detail="Net of refunds · no real money"
          icon={<Wallet size={18} />}
        />
        <Stat
          title="Outstanding fines"
          value={money(fines)}
          detail="Finalized, undisputed fines"
          icon={<Clock3 size={18} />}
        />
        <Stat
          title="Your vehicles"
          value={vehicles.length}
          detail="Ready for the next arrival"
          icon={<CarFront size={18} />}
        />
      </div>
      {active.map((b) => (
        <div className={`active-session ${b.checkoutReminder ? 'overdue' : ''}`} key={b.id}>
          <div className="active-session-icon">
            <CarFront size={32} />
          </div>
          <div>
            <p className="eyebrow">{b.checkoutReminder ? 'CHECKOUT REMINDER' : 'YOU’RE PARKED'}</p>
            <h2>{b.spot.title}</h2>
            <p>Reserved until {dateTime(b.endTime)} · Owner-confirmed entry</p>
            {b.provisionalFine > 0 && (
              <p>
                Provisional overstay fine: {money(b.provisionalFine)}. Finalized after verified
                departure.
              </p>
            )}
          </div>
          <Link className="btn btn-light" to={`/bookings/${b.id}`}>
            Manage session
            <ArrowRight size={17} />
          </Link>
        </div>
      ))}
      <div className="dashboard-columns">
        <section>
          <div className="section-heading compact">
            <h2>Coming up next</h2>
            <Link className="text-button" to="/bookings">
              View all
              <ArrowUpRight size={15} />
            </Link>
          </div>
          <div className="panel">
            {upcoming.length ? (
              upcoming
                .slice()
                .reverse()
                .slice(0, 4)
                .map((b) => <BookingRow key={b.id} booking={b} />)
            ) : (
              <Empty
                title="Where will your day take you?"
                text="Your next reservation will appear here."
                action={
                  <Link className="btn btn-outline" to="/explore">
                    Explore parking
                  </Link>
                }
              />
            )}
          </div>
          <div className="section-heading compact">
            <h2>Recent journeys</h2>
          </div>
          <div className="panel">
            {all
              .filter((b) => ['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(b.bookingStatus))
              .slice(0, 3)
              .map((b) => (
                <BookingRow key={b.id} booking={b} />
              ))}
            {!all.some((b) => ['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(b.bookingStatus)) && (
              <p className="padded muted">Your parking history starts with your first visit.</p>
            )}
          </div>
        </section>
        <aside>
          <div className="section-heading compact">
            <h2>Your garage</h2>
            <Link className="text-button" to="/vehicles">
              <Plus size={15} />
              Add
            </Link>
          </div>
          <div className="panel garage-panel">
            {vehicles.length ? (
              vehicles.map((v) => (
                <div className="garage-item" key={v.id}>
                  <CarFront size={24} />
                  <div>
                    <strong>{v.vehicleModel}</strong>
                    <span>{v.registrationNumber}</span>
                  </div>
                  <Badge value={v.vehicleType} />
                </div>
              ))
            ) : (
              <p className="muted">Add a vehicle before booking.</p>
            )}
          </div>
          <div className="tip-card">
            <LeafIcon />
            <span className="eyebrow">GOOD NEIGHBORS, BETTER CITIES</span>
            <h3>
              Have a little space
              <br />
              to spare?
            </h3>
            <p>Turn an empty driveway into someone’s easier arrival.</p>
            <Link className="text-button" to="/owner">
              Explore hosting
              <ArrowUpRight size={16} />
            </Link>
          </div>
        </aside>
      </div>
    </>
  );
}
function LeafIcon() {
  return <HouseGlyph />;
}
function HouseGlyph() {
  return (
    <div className="tip-illustration">
      <CarFront size={42} />
      <MapPin size={38} />
    </div>
  );
}
export function Bookings({ owner = false }: { owner?: boolean }) {
  const bookings = useBookings(owner);
  const [filter, setFilter] = useState('all');
  const groups: Record<string, string[]> = {
    upcoming: ['CONFIRMED', 'PAYMENT_PENDING'],
    active: ['CHECKED_IN', 'CHECKOUT_PENDING'],
    history: ['COMPLETED', 'CANCELLED', 'EXPIRED', 'NO_SHOW'],
    waiting: ['WAITLISTED'],
  };
  const list = (bookings.data ?? []).filter(
    (b) => filter === 'all' || groups[filter]?.includes(b.bookingStatus),
  );
  return (
    <>
      <PageTitle
        eyebrow={owner ? 'YOUR HOST WORKSPACE' : 'YOUR PLANS, IN ONE PLACE'}
        title={owner ? 'Reservations' : 'My bookings'}
        text={
          owner
            ? 'Verify arrivals and departures, and keep your neighbors informed.'
            : 'From your next arrival to the places you’ve been.'
        }
        action={
          <Link className="btn" to={owner ? '/owner/spots' : '/explore'}>
            {owner ? 'Manage spaces' : 'Find parking'}
            <ArrowUpRight size={17} />
          </Link>
        }
      />
      <div className="tabs" role="tablist">
        {['all', 'upcoming', 'active', 'history', 'waiting'].map((t) => (
          <button
            role="tab"
            aria-selected={filter === t}
            className={filter === t ? 'active' : ''}
            onClick={() => setFilter(t)}
            key={t}
          >
            {t === 'waiting' ? 'Waiting list' : label(t)}
          </button>
        ))}
      </div>
      {bookings.isPending ? (
        <Loading />
      ) : bookings.error ? (
        <ErrorState error={bookings.error} />
      ) : (
        <div className="panel">
          {list.length ? (
            owner ? (
              <HostBookings bookings={list} />
            ) : (
              list.map((b) => <BookingRow key={b.id} booking={b} />)
            )
          ) : (
            <Empty
              title="Nothing here just yet"
              text="Reservations in this category will appear here."
            />
          )}
        </div>
      )}
    </>
  );
}
export function BookingDetails() {
  const { id } = useParams();
  const user = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const query = useQuery({
    queryKey: ['booking', id],
    queryFn: () => api<Booking>(`/bookings/${id}`),
    refetchInterval: 10000,
  });
  const [rating, setRating] = useState(5);
  const [review, setReview] = useState('');
  const [busy, setBusy] = useState(false);
  async function perform(action: string, input: unknown = {}) {
    setBusy(true);
    try {
      await post(`/bookings/${id}/${action}`, input);
      await queryClient.invalidateQueries();
      toast('Booking updated.');
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  if (query.isPending) return <Loading />;
  if (query.error || !query.data) return <ErrorState error={query.error} />;
  const b = query.data;
  const owner = user.data?.id === b.spot.ownerId;
  const admin = user.data?.roles.includes('ADMIN');
  const driver = user.data?.id === b.driverId;
  const cancel = () => {
    const reason = window.prompt(
      'Reason for cancellation (at least 5 characters). Your policy and any simulated fee apply.',
    );
    if (
      reason &&
      window.confirm(
        b.occupied
          ? 'Physical checkout is required. Continue?'
          : owner || b.spaceUnavailable
            ? 'Cancel and issue a full simulated refund?'
            : 'Cancel this booking under the displayed cancellation policy?',
      )
    )
      perform('cancel', { reason });
  };
  return (
    <>
      <Link className="back-link" to={owner ? '/owner/bookings' : '/bookings'}>
        <ChevronLeft size={15} />
        All reservations
      </Link>
      <PageTitle
        eyebrow="RESERVATION DETAILS"
        title={b.termsSnapshot.title ?? b.spot.title}
        action={<Badge value={b.bookingStatus} />}
      />
      {b.spaceUnavailable && (
        <div className="notice warning">
          <AlertTriangle />
          <div>
            <strong>Your space is still occupied.</strong>
            <p>
              The previous vehicle has not been verified as departed. Check-in is blocked. You can
              cancel with a full simulated refund.
            </p>
          </div>
        </div>
      )}
      {b.checkoutReminder && (
        <div className="notice warning">
          <Clock3 />
          <div>
            <strong>Keep an eye on your checkout time.</strong>
            <p>
              Request checkout when you leave. The owner must verify physical departure. Provisional
              fine: {money(b.provisionalFine)}.
            </p>
          </div>
        </div>
      )}
      <div className="detail-layout booking-detail">
        <div>
          <div className="panel padded">
            <div className="row">
              <h2>Reservation summary</h2>
              <Badge value={b.paymentStatus} />
            </div>
            <p className="small muted">
              Booking ID <code className="booking-detail-id">{b.id}</code>
            </p>
            <div className="booking-summary-grid">
              <div>
                <span>ARRIVE</span>
                <strong>{dateTime(b.startTime, b.termsSnapshot.timezone)}</strong>
              </div>
              <div>
                <span>LEAVE</span>
                <strong>{dateTime(b.endTime, b.termsSnapshot.timezone)}</strong>
                <small>{durationText({ start: b.startTime, end: b.endTime })}</small>
              </div>
              <div>
                <span>VEHICLE</span>
                <strong>{b.vehicle.vehicleModel}</strong>
                <small>{b.vehicle.registrationNumber}</small>
                {(owner || admin) && b.driver && <small>Driver: {b.driver.fullName}</small>}
              </div>
              <div>
                <span>RESERVATION TOTAL</span>
                <strong>{money(b.totalAmount)}</strong>
                <small>{money(b.priceSnapshot)} / hour at booking</small>
              </div>
            </div>
            <div className="notice">
              <MapPin size={19} />
              <div>
                <strong>{b.termsSnapshot.address ?? b.spot.address}</strong>
                <p>{b.termsSnapshot.accessInstructions ?? b.spot.accessInstructions}</p>
              </div>
            </div>
            <p className="small muted">
              Local time: {b.termsSnapshot.timezone ?? 'Asia/Kolkata'} · Server time:{' '}
              {dateTime(b.serverTime)}
            </p>
            {b.cancellationReason && <p className="small">Cancellation: {b.cancellationReason}</p>}
            <div className="button-row wrap">
              {driver && b.bookingStatus === 'PAYMENT_PENDING' && (
                <Link className="btn" to={`/pay/${b.id}`}>
                  Complete demo payment
                  <ArrowRight size={16} />
                </Link>
              )}
              {driver && b.bookingStatus === 'WAITLISTED' && (
                <button
                  disabled={busy}
                  className="btn"
                  onClick={async () => {
                    setBusy(true);
                    try {
                      const result = await post<Booking>(`/bookings/${id}/accept`);
                      queryClient.invalidateQueries();
                      navigate(`/pay/${result.id}`);
                    } catch (e) {
                      toast((e as Error).message, true);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Try reserving released space
                </button>
              )}
              {driver && b.bookingStatus === 'CONFIRMED' && (
                <button
                  disabled={busy || b.spaceUnavailable}
                  className="btn"
                  onClick={() => perform('actions/arrival-request')}
                >
                  I’ve arrived · notify host
                </button>
              )}
              {(owner || admin) && b.bookingStatus === 'CONFIRMED' && (
                <button
                  disabled={busy}
                  className="btn"
                  onClick={() => {
                    if (window.confirm('Have you physically verified this vehicle’s arrival?'))
                      perform('actions/check-in');
                  }}
                >
                  Confirm vehicle entry
                </button>
              )}
              {driver && b.occupied && !b.checkoutRequestedAt && (
                <button
                  disabled={busy}
                  className="btn"
                  onClick={() => {
                    if (
                      window.confirm(
                        'Request owner verification of your departure? The space stays occupied until confirmed.',
                      )
                    )
                      perform('actions/request-checkout');
                  }}
                >
                  Request checkout
                </button>
              )}
              {(owner || admin) && b.occupied && (
                <button
                  disabled={busy}
                  className="btn"
                  onClick={() => {
                    if (
                      window.confirm(
                        'Have you physically verified this vehicle has left the space?',
                      )
                    )
                      perform('actions/confirm-checkout', { departureVerified: true });
                  }}
                >
                  Verify departure & checkout
                </button>
              )}
              {!b.occupied &&
                ['PAYMENT_PENDING', 'CONFIRMED', 'WAITLISTED'].includes(b.bookingStatus) && (
                  <button disabled={busy} className="btn btn-outline" onClick={cancel}>
                    Cancel {b.bookingStatus === 'WAITLISTED' ? 'waiting entry' : 'booking'}
                  </button>
                )}
              {owner && b.bookingStatus === 'CONFIRMED' && (
                <button
                  disabled={busy}
                  className="text-button danger"
                  onClick={() => {
                    if (
                      window.confirm(
                        'Have you physically verified the vehicle is absent after the arrival grace period? This report is auditable and the driver may dispute it.',
                      )
                    )
                      perform('actions/no-show', { absenceVerified: true });
                  }}
                >
                  Report verified no-show
                </button>
              )}
              {driver &&
                ['COMPLETED', 'CHECKED_IN', 'CHECKOUT_PENDING', 'NO_SHOW', 'CANCELLED'].includes(
                  b.bookingStatus,
                ) &&
                b.dispute?.status !== 'OPEN' && (
                  <button
                    className="btn btn-outline"
                    disabled={busy}
                    onClick={() => {
                      const message = window.prompt(
                        'Describe your dispute (10–2000 characters). Fine accumulation freezes when disputed.',
                      );
                      if (message) perform('actions/dispute', { message });
                    }}
                  >
                    Raise a dispute
                  </button>
                )}
            </div>
          </div>
          <div className="panel padded fine-card">
            <div className="row">
              <h2>Overstay & fine details</h2>
              <Badge value={b.fineStatus} />
            </div>
            <p>
              {b.termsSnapshot.graceMinutes}-minute grace period.{' '}
              {money(b.termsSnapshot.intervalPaise)} for each started{' '}
              {b.termsSnapshot.intervalMinutes}-minute interval after grace, using the policy saved
              with this reservation.
            </p>
            <div className="stats-grid two">
              <Stat
                title={b.occupied ? 'Provisional fine' : 'Finalized fine'}
                value={money(b.occupied ? b.provisionalFine : b.fineAmount)}
              />
              <Stat title="Verified overstay" value={`${b.overstayMinutes} min`} />
            </div>
            <p className="small muted">
              {b.actualExitTime
                ? `Departure confirmed ${dateTime(b.actualExitTime)}.`
                : 'Physical departure has not yet been confirmed.'}{' '}
              {b.fineCapAt ? `Fine accumulation capped at ${dateTime(b.fineCapAt)}.` : ''}
            </p>
            {driver && b.fineStatus === 'OUTSTANDING' && (
              <Link className="btn" to={`/pay/${b.id}?type=OVERSTAY_FINE`}>
                Pay demo fine
                <ArrowRight size={16} />
              </Link>
            )}
          </div>
          {b.dispute && (
            <div className="panel padded">
              <div className="row">
                <h2>Dispute</h2>
                <Badge value={b.dispute.status} />
              </div>
              <p>{b.dispute.message}</p>
              {b.dispute.responses?.map((r, i) => (
                <div className="soft-card" key={i}>
                  <strong>Owner response</strong>
                  <p>{r.detail}</p>
                  <small>{dateTime(r.at)}</small>
                </div>
              ))}
              {b.dispute.resolution && (
                <div className="notice">
                  <CheckCircle2 size={20} />
                  <span>{b.dispute.resolution}</span>
                </div>
              )}
              {owner && b.dispute.status === 'OPEN' && (
                <button
                  className="btn btn-outline"
                  disabled={busy}
                  onClick={() => {
                    const message = window.prompt('Response to the driver and administrator:');
                    if (message) perform('actions/respond-dispute', { message });
                  }}
                >
                  Respond to dispute
                </button>
              )}
              {admin && b.dispute.status === 'OPEN' && (
                <Link to="/admin/disputes" className="btn">
                  Resolve in admin workspace
                </Link>
              )}
            </div>
          )}
          {driver && b.bookingStatus === 'COMPLETED' && !b.review && (
            <form
              className="panel padded"
              onSubmit={(e) => {
                e.preventDefault();
                perform('review', { rating, comment: review });
              }}
            >
              <h2>How was your arrival?</h2>
              <Field label="Rating">
                <select value={rating} onChange={(e) => setRating(Number(e.target.value))}>
                  {[5, 4, 3, 2, 1].map((n) => (
                    <option key={n} value={n}>
                      {n} stars
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Your review">
                <textarea
                  required
                  minLength={5}
                  maxLength={1000}
                  value={review}
                  onChange={(e) => setReview(e.target.value)}
                />
              </Field>
              <button className="btn" disabled={busy}>
                Share your experience
                <Star size={16} />
              </button>
            </form>
          )}
          <div className="panel padded">
            <h2>Reservation timeline</h2>
            <div className="timeline">
              {b.audit.map((e, i) => (
                <div key={i}>
                  <span />
                  <div>
                    <strong>{label(e.action)}</strong>
                    <small>{dateTime(e.at)}</small>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <aside>
          <div className="panel padded">
            <h3>Simulated payment history</h3>
            <DemoWarning />
            {b.payments.length ? (
              b.payments.map((p) => (
                <div className="payment-mini" key={p.id}>
                  <div>
                    <strong>{label(p.paymentType)}</strong>
                    <span>{label(p.paymentStatus)}</span>
                  </div>
                  <strong className={p.amount < 0 ? 'text-teal' : ''}>{money(p.amount)}</strong>
                </div>
              ))
            ) : (
              <p className="muted">No payment recorded.</p>
            )}
            <Link className="text-button" to="/payments">
              All transactions
              <ArrowUpRight size={15} />
            </Link>
          </div>
          <div className="policy-summary">
            <h3>Cancellation policy</h3>
            <p>{b.termsSnapshot.cancellation}</p>
            <p>
              Checked-in vehicles require verified departure. A cancellation alone cannot free an
              occupied space.
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}
const vehicleSchema = z.object({
  registrationNumber: z.string().min(4).max(20),
  vehicleType: z.enum(['CAR', 'TWO_WHEELER']),
  vehicleModel: z.string().min(2).max(80),
});
export function Vehicles() {
  const [editing, setEditing] = useState<string | null>(null);
  const toast = useToast();
  const query = useQuery({ queryKey: ['vehicles'], queryFn: () => api<Vehicle[]>('/vehicles') });
  const form = useForm<z.infer<typeof vehicleSchema>>({
    resolver: zodResolver(vehicleSchema),
    defaultValues: { registrationNumber: '', vehicleType: 'CAR', vehicleModel: '' },
  });
  const mutation = useMutation({
    mutationFn: (values: z.infer<typeof vehicleSchema>) =>
      api(`/vehicles${editing ? `/${editing}` : ''}`, {
        method: editing ? 'PATCH' : 'POST',
        body: JSON.stringify(values),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      form.reset({ registrationNumber: '', vehicleType: 'CAR', vehicleModel: '' });
      setEditing(null);
      toast('Your garage is up to date.');
    },
  });
  async function remove(v: Vehicle) {
    if (
      !window.confirm(
        `Remove ${v.registrationNumber} from your active vehicles? Booking history is preserved.`,
      )
    )
      return;
    try {
      await api(`/vehicles/${v.id}`, { method: 'DELETE' });
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      toast('Vehicle removed from your garage.');
    } catch (e) {
      toast((e as Error).message, true);
    }
  }
  return (
    <>
      <PageTitle
        eyebrow="READY FOR THE NEXT ARRIVAL"
        title="Your garage"
        text="One place for the vehicles that take you places."
      />
      <div className="dashboard-columns">
        <div>
          {query.isPending ? (
            <Loading />
          ) : query.error ? (
            <ErrorState error={query.error} />
          ) : query.data?.length ? (
            query.data.map((v) => (
              <div className="vehicle-card panel" key={v.id}>
                <div className="vehicle-illustration">
                  <CarFront size={64} strokeWidth={1.2} />
                </div>
                <div>
                  <Badge value={v.vehicleType} />
                  <h2>{v.vehicleModel}</h2>
                  <div className="number-plate">
                    <small>IND</small>
                    {v.registrationNumber}
                  </div>
                </div>
                <div className="button-row">
                  <button
                    className="icon-button"
                    aria-label={`Edit ${v.registrationNumber}`}
                    onClick={() => {
                      setEditing(v.id);
                      form.reset(v);
                    }}
                  >
                    <Pencil size={18} />
                  </button>
                  <button
                    className="icon-button danger"
                    aria-label={`Remove ${v.registrationNumber}`}
                    onClick={() => remove(v)}
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            ))
          ) : (
            <Empty
              title="Make yourself at home"
              text="Add a car or two-wheeler to reserve your first space."
            />
          )}
        </div>
        <form
          className="panel padded"
          onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
        >
          <h2>{editing ? 'Edit vehicle' : 'Add a vehicle'}</h2>
          <Field label="Vehicle model" error={form.formState.errors.vehicleModel?.message}>
            <input placeholder="e.g. Maruti Swift" {...form.register('vehicleModel')} />
          </Field>
          <Field
            label="Registration number"
            error={form.formState.errors.registrationNumber?.message}
          >
            <input placeholder="e.g. KA 01 AB 1234" {...form.register('registrationNumber')} />
          </Field>
          <Field label="Vehicle type">
            <select {...form.register('vehicleType')}>
              <option value="CAR">Car</option>
              <option value="TWO_WHEELER">Two-wheeler</option>
            </select>
          </Field>
          {mutation.error && <ErrorState error={mutation.error} />}
          <button className="btn btn-full" disabled={mutation.isPending}>
            <Plus size={17} />
            {editing ? 'Save vehicle' : 'Add to my garage'}
          </button>
          {editing && (
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setEditing(null);
                form.reset();
              }}
            >
              Cancel edit
            </button>
          )}
          <p className="muted small">
            Removing a vehicle keeps your reservation and payment history intact.
          </p>
        </form>
      </div>
    </>
  );
}
export function PaymentPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const fine = params.get('type') === 'OVERSTAY_FINE';
  const navigate = useNavigate();
  const toast = useToast();
  const query = useQuery({
    queryKey: ['booking', id],
    queryFn: () => api<Booking>(`/bookings/${id}`),
    refetchInterval: 10000,
  });
  const [method, setMethod] = useState('DEMO_UPI');
  const [key, setKey] = useState(crypto.randomUUID());
  const config = useConfig();
  const mutation = useMutation({
    mutationFn: (outcome: string) =>
      post(`/bookings/${id}/pay`, {
        method,
        outcome,
        type: fine ? 'OVERSTAY_FINE' : 'BOOKING',
        idempotencyKey: key,
      }),
    onSuccess: (_result, outcome) => {
      queryClient.invalidateQueries();
      if (outcome === 'success') {
        toast(fine ? 'Demo fine paid.' : 'Your space is confirmed. See you there.');
        navigate(`/bookings/${id}`);
      } else {
        toast('Simulated payment failed. Your hold stays active until its original expiry.', true);
        setKey(crypto.randomUUID());
      }
    },
  });
  if (query.isPending) return <Loading />;
  if (query.error || !query.data) return <ErrorState error={query.error} />;
  const b = query.data;
  const expiry = b.holdExpiresAt
    ? Math.max(
        0,
        Math.ceil(
          (+new Date(b.holdExpiresAt) - +new Date(config.data?.serverTime ?? b.serverTime)) / 60000,
        ),
      )
    : 0;
  const eligible = fine
    ? b.fineStatus === 'OUTSTANDING' && b.bookingStatus === 'COMPLETED'
    : b.bookingStatus === 'PAYMENT_PENDING' && expiry > 0;
  return (
    <>
      <Link className="back-link" to={`/bookings/${id}`}>
        <ChevronLeft size={15} />
        Reservation details
      </Link>
      <PageTitle
        eyebrow="ONE LAST LITTLE STEP"
        title={fine ? 'Settle your demo fine.' : 'Make this space yours.'}
        text="A simulated checkout, with everything clear from the start."
      />
      <div className="payment-layout">
        <div className="panel padded">
          <DemoWarning />
          <h2>Choose a demo payment method</h2>
          <p className="muted small">
            No card numbers, UPI IDs, bank accounts or personal payment details are needed.
          </p>
          <div className="payment-methods">
            {[
              ['DEMO_UPI', 'Demo UPI', Smartphone],
              ['DEMO_CARD', 'Demo Card', CreditCard],
              ['DEMO_CASH', 'Demo Cash', Banknote],
            ].map(([value, title, Icon]) => {
              const I = Icon as typeof Smartphone;
              return (
                <label
                  className={`payment-method ${method === value ? 'active' : ''}`}
                  key={value as string}
                >
                  <input
                    type="radio"
                    name="payment"
                    value={value as string}
                    checked={method === value}
                    onChange={() => {
                      setMethod(value as string);
                      setKey(crypto.randomUUID());
                    }}
                  />
                  <I size={23} />
                  <strong>{title as string}</strong>
                  <CheckCircle2 size={18} />
                </label>
              );
            })}
          </div>
          {!eligible && (
            <div className="notice warning">
              This payment is no longer available. Check the booking status and reserve again if
              your hold expired.
            </div>
          )}
          {mutation.error && <ErrorState error={mutation.error} />}
          <button
            className="btn btn-full"
            disabled={!eligible || mutation.isPending}
            onClick={() => mutation.mutate('success')}
          >
            {mutation.isPending ? 'Processing demo payment…' : 'Complete Demo Payment'}
            <ArrowRight size={17} />
          </button>
          <div className="button-row">
            <button
              className="btn btn-outline"
              disabled={!eligible || mutation.isPending}
              onClick={() => mutation.mutate('failure')}
            >
              Simulate Payment Failure
            </button>
            <button
              className="text-button"
              disabled={mutation.isPending}
              onClick={async () => {
                if (fine) {
                  navigate(`/bookings/${id}`);
                  return;
                }
                if (!window.confirm('Cancel payment and release this hold?')) return;
                try {
                  await post(`/bookings/${id}/cancel`, { reason: 'Driver cancelled demo payment' });
                  queryClient.invalidateQueries();
                  navigate(`/bookings/${id}`);
                } catch (e) {
                  toast((e as Error).message, true);
                }
              }}
            >
              Cancel Payment
            </button>
          </div>
        </div>
        <aside className="panel padded payment-order">
          <img src={b.spot.images[0] ?? '/demo/parking-1.svg'} alt="Reserved parking" />
          <h2>{b.termsSnapshot.title}</h2>
          <p className="muted small">
            {dateTime(b.startTime)} — {dateTime(b.endTime)}
          </p>
          <div className="price-breakdown">
            <div>
              <span>{fine ? 'Finalized overstay fine' : 'Reservation total'}</span>
              <strong>{money(fine ? b.fineAmount : b.totalAmount)}</strong>
            </div>
          </div>
          {!fine && (
            <div className="notice">
              <Clock3 size={20} />
              <span>
                Hold expires in approximately{' '}
                <strong>
                  {expiry} minute{expiry === 1 ? '' : 's'}
                </strong>
                . The server revalidates before confirmation.
              </span>
            </div>
          )}
          <p className="small muted">
            <ShieldCheck size={15} /> Prices and fines are calculated securely by DriveShare.
          </p>
        </aside>
      </div>
    </>
  );
}
export function PaymentHistory({ owner = false }: { owner?: boolean }) {
  const query = useQuery({
    queryKey: ['payments', owner],
    queryFn: () => api<Payment[]>(`/payments${owner ? '?scope=owner' : ''}`),
  });
  const [status, setStatus] = useState('all');
  const list = (query.data ?? []).filter((p) => status === 'all' || p.paymentStatus === status);
  const net = (query.data ?? [])
    .filter((p) => p.paymentStatus === 'SUCCESS')
    .reduce((s, p) => s + p.amount, 0);
  return (
    <>
      <PageTitle
        eyebrow={owner ? 'A LITTLE SPACE, SHARED WELL' : 'EVERY TRANSACTION, CLEARLY'}
        title={owner ? 'Your simulated earnings' : 'Payment history'}
        text="A transparent record of demo payments, refunds and adjustments."
      />
      <DemoWarning />
      <div className="stats-grid two">
        <Stat
          title={owner ? 'Net simulated earnings' : 'Net simulated spending'}
          value={money(net)}
          detail="Successful credits less signed refunds"
          icon={<Wallet size={18} />}
        />
        <Stat
          title="Recorded transactions"
          value={query.data?.length ?? 0}
          detail="Includes failures and zero-value audit adjustments"
        />
      </div>
      <div className="row section-heading compact">
        <h2>All transactions</h2>
        <select
          aria-label="Filter transaction status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="all">All statuses</option>
          <option value="SUCCESS">Successful</option>
          <option value="FAILED">Failed</option>
        </select>
      </div>
      {query.isPending ? (
        <Loading />
      ) : query.error ? (
        <ErrorState error={query.error} />
      ) : (
        <div className="panel table-scroll">
          <table>
            <thead>
              <tr>
                <th>Space / reference</th>
                <th>Type</th>
                <th>Date</th>
                <th>Method</th>
                <th>Status</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link to={`/bookings/${p.bookingId}`}>
                      <strong>{p.booking?.spot.title ?? p.bookingId.slice(0, 8)}</strong>
                      <small>{p.transactionReference.slice(0, 24)}…</small>
                    </Link>
                  </td>
                  <td>{label(p.paymentType)}</td>
                  <td>{dateTime(p.createdAt)}</td>
                  <td>{label(p.paymentMethod)}</td>
                  <td>
                    <Badge value={p.paymentStatus} />
                  </td>
                  <td className={p.amount < 0 ? 'text-teal' : ''}>
                    <strong>{money(p.amount)}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!list.length && (
            <Empty title="A fresh start" text="Your demo transactions will appear here." />
          )}
        </div>
      )}
    </>
  );
}
