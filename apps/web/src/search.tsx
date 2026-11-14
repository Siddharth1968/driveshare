import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  ArrowRight,
  ArrowUpRight,
  MapPin,
  Search,
  CarFront,
  ShieldCheck,
  ChevronLeft,
  CheckCircle2,
  Navigation,
  Copy,
  CalendarDays,
  Clock3,
} from 'lucide-react';
import { api, post, money, dateTime, queryClient, label } from './api';
import {
  useAuth,
  useConfig,
  useToast,
  Loading,
  ErrorState,
  Empty,
  Field,
  DemoWarning,
  Badge,
} from './ui';
import { IntervalPicker } from './IntervalPicker';
import {
  CAMPUS,
  defaultInterval,
  readInterval,
  intervalError,
  hoursBetween,
  durationText,
  detailsURL,
  directionsURL,
  type BookingInterval,
} from './booking-time';
import type { Spot, Vehicle, Booking } from './types';
import { ParkingMap } from './Map';

export function Explore() {
  const [params, setParams] = useSearchParams();
  const config = useConfig();
  const [interval, setInterval] = useState<BookingInterval>(
    () => readInterval(params) ?? defaultInterval(),
  );
  const touched = useRef(Boolean(readInterval(params)));
  useEffect(() => {
    if (config.data && !touched.current) {
      setInterval(defaultInterval(config.data.serverTime));
      touched.current = true;
    }
  }, [config.data]);
  const [q, setQ] = useState(params.get('q') ?? 'Adyar');
  const [vehicle, setVehicle] = useState(params.get('vehicleType') ?? 'CAR');
  const [price, setPrice] = useState('');
  const [availableOnly, setAvailableOnly] = useState(true);
  const [selected, setSelected] = useState<string>();
  const [view, setView] = useState<'list' | 'map'>('list');
  const error = intervalError(interval, config.data?.serverTime);
  const filters = new URLSearchParams({
    q,
    start: interval.start,
    end: interval.end,
    lat: String(CAMPUS.latitude),
    lng: String(CAMPUS.longitude),
  });
  if (vehicle) filters.set('vehicleType', vehicle);
  if (price) filters.set('maxPrice', String(Number(price) * 100));
  const query = useQuery({
    queryKey: ['search-spots', filters.toString()],
    queryFn: () => api<Spot[]>(`/spots?${filters}`),
    enabled: !error,
    refetchInterval: 15000,
  });
  const all = query.data ?? [];
  const spots = all.filter((s) => !availableOnly || s.available);
  const linkParams = new URLSearchParams({
    q,
    start: interval.start,
    end: interval.end,
    vehicleType: vehicle,
  });
  function select(id: string, fromMap = false) {
    setSelected(id);
    if (!fromMap) setView('map');
    if (fromMap) {
      document
        .getElementById(`space-${id}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }
  return (
    <div className="discovery-page">
      <section className="search-intro">
        <div>
          <span className="eyebrow">A LITTLE SPACE. A BETTER DAY.</span>
          <h1>
            Park nearby.
            <br />
            <span>Get on with your day.</span>
          </h1>
          <p>Find a space around Sahyadri College, Adyar, Mangaluru.</p>
        </div>
        <div className="campus-chip">
          <span className="campus-icon">
            <MapPin size={26} />
          </span>
          <div>
            <strong>Sahyadri College</strong>
            <span>Adyar · Mangaluru, Karnataka</span>
            <small>Fictional demo spaces · real map</small>
          </div>
        </div>
      </section>
      <form
        className="search-panel"
        onSubmit={(e) => {
          e.preventDefault();
          if (!error) {
            setParams(linkParams, { replace: true });
            document
              .getElementById('parking-results')
              ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }}
      >
        <div className="search-panel-top">
          <Field label="Where would you like to park?">
            <div className="input-icon">
              <MapPin size={20} />
              <input
                aria-label="Search location"
                list="parking-areas"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Sahyadri College, Adyar or Mangaluru"
              />
              <datalist id="parking-areas">
                {(
                  config.data?.areas ?? ['Adyar', 'Mangaluru', 'Sahyadri College', 'College Road']
                ).map((a) => (
                  <option key={a}>{a}</option>
                ))}
              </datalist>
            </div>
          </Field>
          <Field label="Your vehicle">
            <select
              aria-label="Vehicle type"
              value={vehicle}
              onChange={(e) => setVehicle(e.target.value)}
            >
              <option value="CAR">Car</option>
              <option value="TWO_WHEELER">Two-wheeler</option>
              <option value="">All vehicles</option>
            </select>
          </Field>
          <button className="btn search-submit" disabled={Boolean(error)}>
            <Search size={19} />
            Find parking
          </button>
        </div>
        <IntervalPicker
          value={interval}
          serverTime={config.data?.serverTime}
          onChange={(v) => {
            touched.current = true;
            setInterval(v);
          }}
        />
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
        <button className="btn mobile-search-submit" disabled={Boolean(error)}>
          <Search size={18} />
          Find parking
        </button>
      </form>
      <section id="parking-results" className="parking-results">
        <div className="results-heading">
          <div>
            <span className="eyebrow">SPACES AROUND YOU</span>
            <h2>
              {query.isPending
                ? 'Finding your space…'
                : `${spots.length} ${availableOnly ? 'available ' : ''}spaces near campus`}
            </h2>
            <p>Demo listings are fictional and don’t authorise access to real property.</p>
          </div>
          <div className="results-controls">
            <label className="checkbox">
              <input
                type="checkbox"
                checked={availableOnly}
                onChange={(e) => setAvailableOnly(e.target.checked)}
              />
              Available only
            </label>
            <select
              aria-label="Maximum hourly price"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            >
              <option value="">Any price</option>
              {[25, 40, 60, 100].map((n) => (
                <option value={n} key={n}>
                  Up to ₹{n}/hr
                </option>
              ))}
            </select>
            <div className="view-toggle" aria-label="Parking view">
              <button type="button" aria-pressed={view === 'list'} onClick={() => setView('list')}>
                List
              </button>
              <button type="button" aria-pressed={view === 'map'} onClick={() => setView('map')}>
                Map
              </button>
            </div>
          </div>
        </div>
        {error ? (
          <Empty title="Let’s check those times" text={error} />
        ) : query.error ? (
          <ErrorState error={query.error} />
        ) : query.isPending ? (
          <Loading />
        ) : (
          <div className={`results-layout mobile-${view}`}>
            <div className="parking-cards">
              {spots.length ? (
                spots.map((s) => (
                  <article
                    id={`space-${s.id}`}
                    key={s.id}
                    data-spot-id={s.id}
                    className={`parking-card ${selected === s.id ? 'selected' : ''}`}
                  >
                    <Link className="parking-photo" to={detailsURL(s.id, linkParams)}>
                      <img
                        src={s.images[0] ?? '/demo/parking-1.svg'}
                        alt={`Illustrated demo parking: ${s.title}`}
                      />
                      <span className="photo-demo">DEMO SPACE</span>
                    </Link>
                    <div className="parking-card-body">
                      <div className="row">
                        <span className="availability-pill">
                          <span />
                          {s.available
                            ? 'Available for your times'
                            : 'Unavailable · join waiting list'}
                        </span>
                        <button
                          className="map-select"
                          type="button"
                          onClick={() => select(s.id)}
                          aria-label={`Show ${s.title} on map`}
                        >
                          <MapPin size={17} />
                        </button>
                      </div>
                      <Link to={detailsURL(s.id, linkParams)}>
                        <h3>{s.title}</h3>
                      </Link>
                      <p className="space-address">{s.address.replace(' (fictional demo)', '')}</p>
                      <div className="space-meta">
                        <span>
                          <Navigation size={14} />
                          {s.distance?.toFixed(2)} km from campus
                        </span>
                        <span>
                          <CarFront size={14} />
                          {s.vehicleTypes.map(label).join(' / ')}
                        </span>
                        <span>{label(s.parkingType)}</span>
                      </div>
                      <div className="space-time">
                        <Clock3 size={14} />
                        {dateTime(interval.start)} → {dateTime(interval.end)}
                      </div>
                      <div className="parking-card-bottom">
                        <div>
                          <strong>{money(s.hourlyPrice)}</strong>
                          <span> / hour</span>
                          <small>
                            {money(Math.ceil(hoursBetween(interval) * s.hourlyPrice))} for{' '}
                            {durationText(interval)}
                          </small>
                        </div>
                        <Link className="btn btn-outline" to={detailsURL(s.id, linkParams)}>
                          View details
                          <ArrowRight size={16} />
                        </Link>
                      </div>
                    </div>
                  </article>
                ))
              ) : (
                <Empty
                  title="Try a different time or filter"
                  text="No matching spaces are available. Turn off Available only to see waiting-list options."
                  action={
                    <button
                      className="btn btn-outline"
                      onClick={() => {
                        setAvailableOnly(false);
                        setPrice('');
                      }}
                    >
                      Show all matching spaces
                    </button>
                  }
                />
              )}
            </div>
            <ParkingMap
              spots={spots}
              selected={selected}
              onSelect={(id) => select(id, true)}
              linkParams={linkParams}
            />
          </div>
        )}
      </section>
    </div>
  );
}
export const Landing = Explore;
export function SpotDetails() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const auth = useAuth();
  const config = useConfig();
  const toast = useToast();
  const [interval, setInterval] = useState(() => readInterval(params) ?? defaultInterval());
  const [editTimes, setEditTimes] = useState(!readInterval(params));
  const [vehicle, setVehicle] = useState('');
  const [method, setMethod] = useState('DEMO_UPI');
  const attempt = useRef<{ signature: string; key: string; id?: string } | undefined>(undefined);
  const spot = useQuery({ queryKey: ['spot', id], queryFn: () => api<Spot>(`/spots/${id}`) });
  const vehicles = useQuery({
    queryKey: ['vehicles'],
    queryFn: () => api<Vehicle[]>('/vehicles'),
    enabled: Boolean(auth.data),
  });
  const error = intervalError(interval, config.data?.serverTime);
  const compatible = (vehicles.data ?? []).filter((v) =>
    spot.data?.vehicleTypes.includes(v.vehicleType),
  );
  const preferredType = params.get('vehicleType');
  const selectedVehicle =
    compatible.find((v) => v.id === vehicle) ??
    compatible.find((v) => v.vehicleType === preferredType) ??
    compatible[0];
  const vehicleType = selectedVehicle?.vehicleType ?? preferredType;
  const availability = useQuery({
    queryKey: ['space-availability', id, interval.start, interval.end, vehicleType],
    queryFn: () =>
      api<Spot[]>(
        `/spots?${new URLSearchParams({ start: interval.start, end: interval.end, ...(vehicleType ? { vehicleType } : {}) })}`,
      ),
    enabled: Boolean(spot.data) && !error,
    refetchInterval: 10000,
  });
  const available = availability.data?.find((s) => s.id === id)?.available;
  const heldId = attempt.current?.id;
  const confirm = useMutation({
    mutationFn: async (waitlist: boolean) => {
      if (!auth.data) {
        const query = new URLSearchParams(params);
        query.set('start', interval.start);
        query.set('end', interval.end);
        const next = `/explore/${id}?${query}`;
        navigate(`/login?next=${encodeURIComponent(next)}`);
        throw new Error('Sign in to confirm your booking.');
      }
      if (error) throw new Error(error);
      if (!selectedVehicle) throw new Error('Add a compatible vehicle in your profile first.');
      const signature = JSON.stringify([id, interval, selectedVehicle.id, waitlist]);
      if (attempt.current?.signature !== signature)
        attempt.current = { signature, key: crypto.randomUUID() };
      const held = await post<Booking>('/bookings', {
        parkingSpotId: id,
        vehicleId: selectedVehicle.id,
        startTime: interval.start,
        endTime: interval.end,
        idempotencyKey: attempt.current.key,
        waitlist,
      });
      attempt.current.id = held.id;
      if (waitlist) return held;
      if (held.bookingStatus === 'CONFIRMED' && held.paymentStatus === 'SUCCESS') return held;
      if (!['PAYMENT_PENDING', 'CONFIRMED'].includes(held.bookingStatus))
        throw new Error('This hold has expired. Change your time or start a new reservation.');
      const paid = await post<{ booking: Booking }>(`/bookings/${held.id}/pay`, {
        idempotencyKey: `${attempt.current.key}:payment:${method}`,
        method,
        outcome: 'success',
        type: 'BOOKING',
      });
      return paid.booking;
    },
    onSuccess: (b) => {
      queryClient.invalidateQueries();
      if (b.bookingStatus === 'WAITLISTED') {
        toast('Waiting-list entry saved. You will be notified in the app.');
        navigate(`/bookings/${b.id}`);
      } else navigate(`/booking-confirmation/${b.id}`);
    },
  });
  if (spot.isPending) return <Loading />;
  if (spot.error || !spot.data) return <ErrorState error={spot.error} />;
  const s = spot.data;
  return (
    <div className="review-page">
      <Link to={`/?${params}`} className="back-link">
        <ChevronLeft size={16} />
        Back to parking
      </Link>
      <div className="booking-steps">
        <span>1. Find parking</span>
        <strong>2. Review & confirm</strong>
        <span>3. You’re booked</span>
      </div>
      <div className="review-heading">
        <h1>Your space is one step away.</h1>
        <p>Check the details, then confirm. Everything is shown in India Standard Time.</p>
      </div>
      <div className="review-grid">
        <div>
          <section className="panel review-space">
            <img
              src={s.images[0] ?? '/demo/parking-1.svg'}
              alt={`Illustrated demo space: ${s.title}`}
            />
            <div>
              <span className="eyebrow">FICTIONAL DEMONSTRATION SPACE</span>
              <h2>{s.title}</h2>
              <p>{s.address}</p>
              {s.owner && <p className="small muted">Hosted by {s.owner.fullName}</p>}
              <div className="space-meta">
                <span>
                  <ShieldCheck size={16} />
                  Reviewed listing
                </span>
                <span>
                  <CarFront size={16} />
                  {s.vehicleTypes.map(label).join(' / ')}
                </span>
                <span>{label(s.parkingType)}</span>
              </div>
              <a
                className="text-button"
                href={directionsURL(s.latitude, s.longitude)}
                target="_blank"
                rel="noreferrer"
              >
                Open in Google Maps
                <ArrowUpRight size={16} />
              </a>
            </div>
          </section>
          <section className="panel padded review-time-panel">
            <div className="row">
              <h2>Your parking time</h2>
              <button className="text-button" onClick={() => setEditTimes(!editTimes)}>
                {editTimes ? 'Done' : 'Change dates'}
              </button>
            </div>
            {editTimes ? (
              <IntervalPicker
                value={interval}
                onChange={(v) => {
                  setInterval(v);
                  attempt.current = undefined;
                }}
                serverTime={config.data?.serverTime}
              />
            ) : (
              <div className="review-times">
                <div>
                  <span>Check-in · IST</span>
                  <strong>{dateTime(interval.start)}</strong>
                </div>
                <ArrowRight size={20} />
                <div>
                  <span>Check-out · IST</span>
                  <strong>{dateTime(interval.end)}</strong>
                </div>
                <span className="duration-badge">{durationText(interval)}</span>
              </div>
            )}
            {error && (
              <p className="inline-error" role="alert">
                {error}
              </p>
            )}
          </section>
          <section className="panel padded rules-panel">
            <h2>Arriving at your space</h2>
            <p>{s.accessInstructions}</p>
            <div className="rule-list">
              <p>
                <ShieldCheck size={18} />
                Your host confirms arrival and physical departure.
              </p>
              <p>
                <Clock3 size={18} />
                {config.data?.policy.graceMinutes ?? 10} minutes’ grace, then ₹
                {config.data?.policy.fineRupees ?? 20} per started{' '}
                {config.data?.policy.fineInterval ?? 15} minutes of overstay.
              </p>
              <p>
                <CalendarDays size={18} />
                {config.data?.policy.cancellation}
              </p>
            </div>
            <h3>About this demo space</h3>
            <p>{s.description}</p>
            {s.reviews?.length > 0 && (
              <details>
                <summary>
                  {s.reviews.length} completed-booking review{s.reviews.length === 1 ? '' : 's'}
                </summary>
                {s.reviews.map((review) => (
                  <div key={review.id}>
                    <strong>
                      {review.reviewer?.fullName ?? 'Driver'} · {review.rating}/5
                    </strong>
                    <p>{review.comment}</p>
                  </div>
                ))}
              </details>
            )}
          </section>
        </div>
        <aside className="panel confirm-panel">
          <h2>A clear price. A simpler arrival.</h2>
          <div className="price-breakdown">
            <div>
              <span>
                {money(s.hourlyPrice)} × {durationText(interval)}
              </span>
              <span>{money(Math.ceil(hoursBetween(interval) * s.hourlyPrice))}</span>
            </div>
            <div>
              <strong>Total</strong>
              <strong className="review-total">
                {money(Math.ceil(hoursBetween(interval) * s.hourlyPrice))}
              </strong>
            </div>
          </div>
          <Field label="Your vehicle">
            <select
              aria-label="Your vehicle"
              value={selectedVehicle?.id ?? ''}
              onChange={(e) => {
                setVehicle(e.target.value);
                attempt.current = undefined;
              }}
            >
              <option value="">
                {auth.data ? 'Choose a vehicle' : 'Sign in to use your vehicle'}
              </option>
              {compatible.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.vehicleModel} · {v.registrationNumber}
                </option>
              ))}
            </select>
          </Field>
          {auth.data && !compatible.length && (
            <Link className="text-button" to="/vehicles">
              Add a compatible vehicle
              <ArrowUpRight size={15} />
            </Link>
          )}
          <Field label="Simulated payment method">
            <select value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="DEMO_UPI">Demo UPI</option>
              <option value="DEMO_CARD">Demo Card</option>
              <option value="DEMO_CASH">Demo Cash</option>
            </select>
          </Field>
          <DemoWarning />
          {availability.error && <ErrorState error={availability.error} />}
          {!error && availability.isSuccess && available === undefined && (
            <p className="inline-error" role="alert">
              This space is no longer listed for the selected vehicle.
            </p>
          )}
          {available === false && !heldId && (
            <div className="notice warning">
              This interval is unavailable. Choose another time or join the waiting list without
              payment.
            </div>
          )}
          {confirm.error && <ErrorState error={confirm.error} />}
          <button
            className="btn btn-full"
            disabled={
              confirm.isPending ||
              Boolean(error) ||
              Boolean(auth.data && !compatible.length) ||
              (available !== true && !heldId)
            }
            onClick={() => confirm.mutate(false)}
          >
            {confirm.isPending
              ? 'Confirming your booking…'
              : auth.data
                ? 'Confirm demo booking'
                : 'Sign in to book'}
            <ArrowRight size={18} />
          </button>
          {available === false && !heldId && (
            <button
              className="btn btn-outline btn-full"
              disabled={confirm.isPending || !selectedVehicle}
              onClick={() => confirm.mutate(true)}
            >
              Join waiting list
            </button>
          )}
          {confirm.error && attempt.current?.id && (
            <Link className="text-button" to={`/pay/${attempt.current.id}`}>
              Open payment options
            </Link>
          )}
          <p className="secure-note">
            <ShieldCheck size={16} />
            Server-verified availability. No real money.
          </p>
        </aside>
      </div>
    </div>
  );
}
export function BookingConfirmation() {
  const { id } = useParams();
  const toast = useToast();
  const query = useQuery({
    queryKey: ['booking', id],
    queryFn: () => api<Booking>(`/bookings/${id}`),
  });
  if (query.isPending) return <Loading />;
  if (query.error || !query.data) return <ErrorState error={query.error} />;
  const b = query.data;
  return (
    <div className="confirmation-page">
      <div className="confirmation-icon">
        <CheckCircle2 size={48} />
      </div>
      <span className="eyebrow">A SPACE SAVED FOR YOUR DAY</span>
      <h1>{b.bookingStatus === 'CONFIRMED' ? 'You’re booked.' : 'Your reservation'}</h1>
      <p>
        {b.bookingStatus === 'CONFIRMED'
          ? 'Your host has the same booking and has been notified in the app.'
          : 'Open the booking to see its current status.'}
      </p>
      <section className="panel padded">
        <Badge value={b.bookingStatus} />
        <h2>{b.termsSnapshot.title}</h2>
        <div className="review-times">
          <div>
            <span>Check-in · IST</span>
            <strong>{dateTime(b.startTime)}</strong>
          </div>
          <div>
            <span>Check-out · IST</span>
            <strong>{dateTime(b.endTime)}</strong>
          </div>
        </div>
        <div className="booking-id-box">
          <span>Booking ID · shared with your host</span>
          <code data-testid="confirmed-booking-id">{b.id}</code>
          <button
            className="text-button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(b.id);
                toast('Booking ID copied.');
              } catch {
                toast('Select the booking ID to copy it.');
              }
            }}
          >
            <Copy size={15} />
            Copy booking ID
          </button>
        </div>
        <div className="row">
          <span>
            {durationText({ start: b.startTime, end: b.endTime })} · {b.vehicle.registrationNumber}
          </span>
          <strong>{money(b.totalAmount)}</strong>
        </div>
      </section>
      <Link className="btn" to={`/bookings/${b.id}`}>
        View booking
        <ArrowRight size={18} />
      </Link>
      <Link className="text-button" to="/bookings">
        My bookings
      </Link>
    </div>
  );
}
