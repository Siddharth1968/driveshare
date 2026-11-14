import { useEffect, useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Plus,
  ArrowUpRight,
  House,
  CarFront,
  Wallet,
  Clock3,
  Pencil,
  CalendarDays,
  ShieldCheck,
  Trash2,
  Upload,
  ChevronLeft,
} from 'lucide-react';
import { api, post, queryClient, money, label, localInput, dateTime, ApiError } from './api';
import { useAuth, useToast, Loading, ErrorState, Empty, PageTitle, Stat, Badge, Field } from './ui';
import type { Spot, Payment, Slot, Booking } from './types';
import { HostBookings } from './HostBookings';
import { CAMPUS, istToISO } from './booking-time';
export function useOwnerSpots() {
  return useQuery({ queryKey: ['owner-spots'], queryFn: () => api<Spot[]>('/owner/spots') });
}
export function OwnerDashboard() {
  const user = useAuth();
  const toast = useToast();
  const host = Boolean(user.data?.roles.includes('OWNER'));
  const spaces = useQuery({
    queryKey: ['owner-spots'],
    queryFn: () => api<Spot[]>('/owner/spots'),
    enabled: host,
  });
  const bookings = useQuery({
    queryKey: ['bookings', true],
    queryFn: () => api<Booking[]>('/bookings?scope=owner'),
    enabled: host,
    refetchInterval: 5000,
  });
  const payments = useQuery({
    queryKey: ['payments', true],
    queryFn: () => api<Payment[]>('/payments?scope=owner'),
    enabled: host,
    refetchInterval: 5000,
  });
  if (!host)
    return (
      <div className="hosting-intro">
        <div className="tip-illustration">
          <House size={90} />
        </div>
        <p className="eyebrow">GOOD NEIGHBORS SHARE A LITTLE SPACE</p>
        <h1>
          Your driveway.
          <br />
          Someone’s better day.
        </h1>
        <p>
          Host parking with your existing account. Confirm you have permission, add a space, set
          your hours, and submit it for review.
        </p>
        <button
          className="btn"
          onClick={async () => {
            try {
              await post('/auth/owner');
              await queryClient.invalidateQueries();
              toast('Your host workspace is ready.');
            } catch (e) {
              toast((e as Error).message, true);
            }
          }}
        >
          Enable my host workspace
          <ArrowUpRight size={17} />
        </button>
      </div>
    );
  if (spaces.isPending || bookings.isPending) return <Loading />;
  if (spaces.error || bookings.error) return <ErrorState error={spaces.error ?? bookings.error} />;
  const all = bookings.data ?? [];
  const occupied = all.filter((b) => b.occupied);
  const overdue = occupied.filter((b) => +new Date(b.endTime) < +new Date(b.serverTime));
  const net = (payments.data ?? [])
    .filter((p) => p.paymentStatus === 'SUCCESS')
    .reduce((s, p) => s + p.amount, 0);
  return (
    <>
      <PageTitle
        eyebrow="A LITTLE SPACE, SHARED WELL"
        title={`Welcome home, ${user.data?.fullName.split(' ')[0]}.`}
        text="Your spaces, your neighbors, and today’s arrivals."
        action={
          <Link className="btn" to="/owner/spots/new">
            <Plus size={17} />
            List a space
          </Link>
        }
      />
      <div className="stats-grid">
        <Stat
          title="Total parking spaces"
          value={spaces.data?.length ?? 0}
          detail={`${spaces.data?.filter((s) => s.approvalStatus === 'APPROVED').length ?? 0} approved listings`}
          icon={<House size={18} />}
        />
        <Stat
          title="Upcoming bookings"
          value={
            all.filter(
              (b) =>
                b.bookingStatus === 'CONFIRMED' && new Date(b.endTime) > new Date(b.serverTime),
            ).length
          }
          detail="Paid reservations still to arrive"
          icon={<Clock3 size={18} />}
        />
        <Stat
          title="Active bookings"
          value={occupied.length}
          detail="Owner-verified physical occupancy"
          icon={<CarFront size={18} />}
        />
        <Stat
          title="Net demo earnings"
          value={money(net)}
          detail="Successful payments less refunds"
          icon={<Wallet size={18} />}
        />
      </div>
      {overdue.length > 0 && (
        <div className="notice warning">
          <Clock3 />
          <div>
            <strong>
              {overdue.length} vehicle{overdue.length === 1 ? ' is' : 's are'} past checkout.
            </strong>
            <p>
              Next drivers see an in-app warning and can cancel for a full simulated refund. Review
              these sessions below.
            </p>
          </div>
        </div>
      )}
      <div className="section-heading compact">
        <h2>Driver bookings</h2>
        <Link className="text-button" to="/owner/bookings">
          All reservations
          <ArrowUpRight size={16} />
        </Link>
      </div>
      <p className="small muted">
        Live database updates every 5 seconds. Match the full ID with your driver.
      </p>
      <HostBookings
        bookings={all
          .slice()
          .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
          .slice(0, 8)}
      />
    </>
  );
}
export function OwnerSpots() {
  const query = useOwnerSpots();
  return (
    <>
      <PageTitle
        eyebrow="ROOM FOR POSSIBILITY"
        title="Your parking spaces"
        text="Thoughtful spaces make the neighborhood work better."
        action={
          <Link className="btn" to="/owner/spots/new">
            <Plus size={17} />
            List a space
          </Link>
        }
      />
      {query.isPending ? (
        <Loading />
      ) : query.error ? (
        <ErrorState error={query.error} />
      ) : query.data?.length ? (
        <div className="owner-spot-grid">
          {query.data.map((s) => (
            <article className="panel owner-spot" key={s.id}>
              <img src={s.images[0] ?? '/demo/parking-1.svg'} alt={`Parking at ${s.title}`} />
              <div className="padded">
                <div className="row">
                  <Badge value={s.approvalStatus} />
                  <strong>
                    {money(s.hourlyPrice)}
                    <span className="muted small"> / hour</span>
                  </strong>
                </div>
                <h2>{s.title}</h2>
                <p className="muted small">{s.address}</p>
                <div className="small muted">
                  {label(s.parkingType)} · {s.spotNumber} ·{' '}
                  {s.availability.filter((a) => a.isActive).length} recurring windows
                </div>
                <div className="button-row">
                  <Link className="btn btn-outline btn-sm" to={`/owner/spots/${s.id}/edit`}>
                    <Pencil size={15} />
                    Edit listing
                  </Link>
                  <Link className="btn btn-sm" to={`/owner/spots/${s.id}/availability`}>
                    <CalendarDays size={15} />
                    Availability
                  </Link>
                </div>
                {!s.isActive && <p className="small text-amber">Listing is paused</p>}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          title="Every good arrival starts somewhere"
          text="List your first space and set the hours you’d like to share."
          action={
            <Link className="btn" to="/owner/spots/new">
              Create a listing
            </Link>
          }
        />
      )}
    </>
  );
}
const listingSchema = z.object({
  title: z.string().min(5).max(120),
  description: z.string().min(20).max(3000),
  address: z.string().min(8).max(300),
  city: z.string().min(2),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  timezone: z.string().min(3),
  hourlyPrice: z.number().min(1).max(1000),
  vehicleType: z.enum(['BOTH', 'CAR', 'TWO_WHEELER']),
  parkingType: z.enum(['COVERED', 'OPEN', 'GATED']),
  spotNumber: z.string().min(1),
  accessInstructions: z.string().min(5),
  permissionConfirmed: z.boolean().refine((v) => v, 'Confirm your permission to host this space.'),
  isActive: z.boolean(),
});
type ListingForm = z.infer<typeof listingSchema>;
export function ListingEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [images, setImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const query = useQuery({
    queryKey: ['spot', id],
    queryFn: () => api<Spot>(`/spots/${id}`),
    enabled: Boolean(id),
  });
  const form = useForm<ListingForm>({
    resolver: zodResolver(listingSchema),
    defaultValues: {
      title: '',
      description: '',
      address: '',
      city: 'Mangaluru',
      latitude: CAMPUS.latitude,
      longitude: CAMPUS.longitude,
      timezone: 'Asia/Kolkata',
      hourlyPrice: 40,
      vehicleType: 'BOTH',
      parkingType: 'COVERED',
      spotNumber: 'P-1',
      accessInstructions: '',
      permissionConfirmed: false,
      isActive: true,
    },
  });
  useEffect(() => {
    if (query.data) {
      const s = query.data;
      form.reset({
        ...s,
        hourlyPrice: s.hourlyPrice / 100,
        vehicleType:
          s.vehicleTypes.length > 1 ? 'BOTH' : (s.vehicleTypes[0] as 'CAR' | 'TWO_WHEELER'),
        parkingType: s.parkingType as ListingForm['parkingType'],
      });
      setImages(s.images);
    }
  }, [query.data, form]);
  const mutation = useMutation({
    mutationFn: (values: ListingForm) => {
      const { vehicleType, ...rest } = values;
      return api<Spot>(`/spots${id ? `/${id}` : ''}`, {
        method: id ? 'PATCH' : 'POST',
        body: JSON.stringify({
          ...rest,
          hourlyPrice: Math.round(values.hourlyPrice * 100),
          vehicleTypes: vehicleType === 'BOTH' ? ['CAR', 'TWO_WHEELER'] : [vehicleType],
          images,
        }),
      });
    },
    onSuccess: (s) => {
      queryClient.invalidateQueries();
      toast('Listing submitted for administrator review. Set your recurring hours next.');
      navigate(`/owner/spots/${s.id}/availability`);
    },
  });
  async function upload(file?: File) {
    if (!file) return;
    setUploading(true);
    try {
      const body = new FormData();
      body.append('image', file);
      const result = await api<{ url: string }>('/uploads', { method: 'POST', body });
      setImages((previous) => [...previous, result.url].slice(0, 6));
      toast('Image uploaded. Save the listing to apply.');
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setUploading(false);
    }
  }
  if (id && query.isPending) return <Loading />;
  if (query.error) return <ErrorState error={query.error} />;
  return (
    <>
      <Link className="back-link" to="/owner/spots">
        <ChevronLeft size={15} />
        My spaces
      </Link>
      <PageTitle
        eyebrow="GOOD SPACES START WITH GOOD DETAILS"
        title={id ? 'A little refresh.' : 'Share your little space.'}
        text="Every new or edited listing is reviewed before becoming publicly bookable."
      />
      <form
        className="listing-form"
        onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
      >
        <div className="panel padded">
          <h2>The essentials</h2>
          <Field label="Space title" error={form.formState.errors.title?.message}>
            <input placeholder="e.g. The Courtyard · Campus Gate" {...form.register('title')} />
          </Field>
          <Field label="Description" error={form.formState.errors.description?.message}>
            <textarea
              rows={4}
              placeholder="Tell drivers what makes your space a good place to arrive."
              {...form.register('description')}
            />
          </Field>
          <Field label="Address" error={form.formState.errors.address?.message}>
            <input {...form.register('address')} />
          </Field>
          <div className="form-grid">
            <Field label="City" error={form.formState.errors.city?.message}>
              <input {...form.register('city')} />
            </Field>
            <Field label="Time zone" error={form.formState.errors.timezone?.message}>
              <input {...form.register('timezone')} />
            </Field>
            <Field label="Latitude" error={form.formState.errors.latitude?.message}>
              <input
                type="number"
                step="any"
                {...form.register('latitude', { valueAsNumber: true })}
              />
            </Field>
            <Field label="Longitude" error={form.formState.errors.longitude?.message}>
              <input
                type="number"
                step="any"
                {...form.register('longitude', { valueAsNumber: true })}
              />
            </Field>
          </div>
          <Field
            label="Arrival instructions"
            error={form.formState.errors.accessInstructions?.message}
          >
            <textarea
              rows={3}
              placeholder="Gate, entry route and where to meet you."
              {...form.register('accessInstructions')}
            />
          </Field>
        </div>
        <div>
          <div className="panel padded">
            <h2>Make it a good fit</h2>
            <div className="form-grid">
              <Field label="Hourly price (₹)" error={form.formState.errors.hourlyPrice?.message}>
                <input
                  type="number"
                  step="0.01"
                  {...form.register('hourlyPrice', { valueAsNumber: true })}
                />
              </Field>
              <Field label="Space number" error={form.formState.errors.spotNumber?.message}>
                <input {...form.register('spotNumber')} />
              </Field>
            </div>
            <Field label="Parking type">
              <select {...form.register('parkingType')}>
                <option value="COVERED">Covered parking</option>
                <option value="OPEN">Open parking</option>
                <option value="GATED">Gated parking</option>
              </select>
            </Field>
            <Field label="Supported vehicles">
              <select {...form.register('vehicleType')}>
                <option value="BOTH">Cars & two-wheelers</option>
                <option value="CAR">Cars only</option>
                <option value="TWO_WHEELER">Two-wheelers only</option>
              </select>
            </Field>
            <label className="checkbox">
              <input type="checkbox" {...form.register('isActive')} />
              Listing active after approval
            </label>
            <label className="checkbox permission">
              <input type="checkbox" {...form.register('permissionConfirmed')} />I own this space or
              have explicit permission to offer it for parking.
            </label>
            {form.formState.errors.permissionConfirmed && (
              <p className="field-error">{form.formState.errors.permissionConfirmed.message}</p>
            )}
          </div>
          <div className="panel padded">
            <h2>A clearer picture</h2>
            <p className="small muted">JPEG, PNG or WebP · up to 5 MB each · 6 images maximum.</p>
            <div className="upload-images">
              {images.map((src, i) => (
                <div key={src}>
                  <img src={src} alt={`Parking image ${i + 1}`} />
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Remove image ${i + 1}`}
                    onClick={() => setImages(images.filter((_, index) => index !== i))}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
            {images.length < 6 && (
              <label className="upload-button">
                <Upload size={18} />
                {uploading ? 'Uploading…' : 'Upload a parking image'}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={uploading}
                  onChange={(e) => upload(e.target.files?.[0])}
                />
              </label>
            )}
          </div>
          <div className="notice small">
            <ShieldCheck size={20} />
            <span>
              Confirmed reservations keep their original price and arrival instructions when you
              edit a listing.
            </span>
          </div>
          {mutation.error && <ErrorState error={mutation.error} />}
          <button className="btn btn-full" disabled={mutation.isPending || uploading}>
            {mutation.isPending ? 'Saving…' : 'Save & set availability'}
            <ArrowUpRight size={16} />
          </button>
        </div>
      </form>
    </>
  );
}
export function Availability() {
  const { id } = useParams();
  const toast = useToast();
  const query = useQuery({ queryKey: ['spot', id], queryFn: () => api<Spot>(`/spots/${id}`) });
  const [slots, setSlots] = useState<Slot[]>([]);
  const [saving, setSaving] = useState(false);
  const [blockStart, setBlockStart] = useState(() => localInput(new Date(Date.now() + 3600000)));
  const [blockEnd, setBlockEnd] = useState(() => localInput(new Date(Date.now() + 7200000)));
  const [reason, setReason] = useState('');
  const [affected, setAffected] = useState<{ id: string; startTime: string; endTime: string }[]>(
    [],
  );
  useEffect(() => {
    if (query.data)
      setSlots(
        query.data.availability.map((a) => ({
          ...a,
          effectiveFrom: a.effectiveFrom.slice(0, 10),
          effectiveUntil: a.effectiveUntil?.slice(0, 10) ?? null,
        })),
      );
  }, [query.data]);
  function edit(index: number, patch: Partial<Slot>) {
    setSlots((previous) => previous.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }
  async function save() {
    setSaving(true);
    try {
      await api(`/spots/${id}/availability`, {
        method: 'PUT',
        body: JSON.stringify({
          slots: slots.map((s) => ({
            dayOfWeek: s.dayOfWeek,
            startTime: s.startTime,
            endTime: s.endTime,
            effectiveFrom: s.effectiveFrom,
            effectiveUntil: s.effectiveUntil,
            isActive: s.isActive,
          })),
        }),
      });
      queryClient.invalidateQueries();
      toast('Recurring availability saved.');
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setSaving(false);
    }
  }
  async function block(resolveBookings = false) {
    if (
      resolveBookings &&
      !window.confirm(
        `Cancel ${affected.length} affected reservations with full simulated refunds and block this interval?`,
      )
    )
      return;
    setSaving(true);
    try {
      await post(`/spots/${id}/blocks`, {
        startTime: istToISO(blockStart.slice(0, 10), blockStart.slice(11)),
        endTime: istToISO(blockEnd.slice(0, 10), blockEnd.slice(11)),
        reason,
        resolveBookings,
        affectedBookingIds: resolveBookings ? affected.map((b) => b.id) : [],
      });
      setAffected([]);
      setReason('');
      queryClient.invalidateQueries();
      toast('Interval blocked.');
    } catch (e) {
      const details = (e as ApiError).details as { affectedBookings?: typeof affected } | undefined;
      if (details?.affectedBookings) setAffected(details.affectedBookings);
      toast((e as Error).message, true);
    } finally {
      setSaving(false);
    }
  }
  if (query.isPending) return <Loading />;
  if (query.error) return <ErrorState error={query.error} />;
  return (
    <>
      <Link className="back-link" to="/owner/spots">
        <ChevronLeft size={15} />
        My spaces
      </Link>
      <PageTitle
        eyebrow="YOUR SPACE, ON YOUR SCHEDULE"
        title="Make a little room."
        text={query.data?.title}
      />
      <div className="panel padded">
        <div className="row">
          <div>
            <h2>Recurring availability</h2>
            <p className="muted small">
              Local time zone: {query.data?.timezone}. End at 24:00 for the end of a day.
            </p>
          </div>
          <button
            className="btn btn-outline btn-sm"
            disabled={slots.length >= 70}
            onClick={() =>
              setSlots([
                ...slots,
                {
                  dayOfWeek: 1,
                  startTime: '09:00',
                  endTime: '17:00',
                  effectiveFrom: new Date().toISOString().slice(0, 10),
                  effectiveUntil: null,
                  isActive: true,
                },
              ])
            }
          >
            <Plus size={16} />
            Add window
          </button>
        </div>
        <div className="schedule-rows">
          {slots.map((s, i) => (
            <div className="schedule-row" key={i}>
              <Field label="Day">
                <select
                  value={s.dayOfWeek}
                  onChange={(e) => edit(i, { dayOfWeek: Number(e.target.value) })}
                >
                  {[
                    'Sunday',
                    'Monday',
                    'Tuesday',
                    'Wednesday',
                    'Thursday',
                    'Friday',
                    'Saturday',
                  ].map((d, n) => (
                    <option key={d} value={n}>
                      {d}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="From">
                <input
                  value={s.startTime}
                  pattern="([01][0-9]|2[0-3]):[0-5][0-9]"
                  placeholder="09:00"
                  onChange={(e) => edit(i, { startTime: e.target.value })}
                />
              </Field>
              <Field label="Until">
                <input
                  value={s.endTime}
                  placeholder="17:00 or 24:00"
                  onChange={(e) => edit(i, { endTime: e.target.value })}
                />
              </Field>
              <Field label="Effective from">
                <input
                  type="date"
                  value={s.effectiveFrom}
                  onChange={(e) => edit(i, { effectiveFrom: e.target.value })}
                />
              </Field>
              <Field label="Effective until">
                <input
                  type="date"
                  value={s.effectiveUntil ?? ''}
                  onChange={(e) => edit(i, { effectiveUntil: e.target.value || null })}
                />
              </Field>
              <button
                className="icon-button danger"
                aria-label={`Remove availability ${i + 1}`}
                onClick={() => setSlots(slots.filter((_, n) => n !== i))}
              >
                <Trash2 size={17} />
              </button>
            </div>
          ))}
        </div>
        {!slots.length && (
          <p className="muted">Add at least one recurring window before drivers can reserve.</p>
        )}
        <div className="button-row">
          <button className="btn" disabled={saving} onClick={save}>
            Save recurring hours
          </button>
          <button
            className="text-button"
            onClick={() => {
              if (
                slots.length &&
                !window.confirm('Replace the form with daily all-day windows? Save to apply.')
              )
                return;
              setSlots(
                Array.from({ length: 7 }, (_, dayOfWeek) => ({
                  dayOfWeek,
                  startTime: '00:00',
                  endTime: '24:00',
                  effectiveFrom: new Date().toISOString().slice(0, 10),
                  effectiveUntil: null,
                  isActive: true,
                })),
              );
            }}
          >
            Use daily all-day hours
          </button>
        </div>
        <p className="small muted">
          Overlapping schedule definitions are rejected. Existing reservations must remain covered.
        </p>
      </div>
      <div className="dashboard-columns">
        <form
          className="panel padded"
          onSubmit={(e) => {
            e.preventDefault();
            block();
          }}
        >
          <h2>Keep an interval for yourself</h2>
          <p className="muted small">
            Maintenance, a family visit, or a change of plans. Confirmed reservations are protected.
          </p>
          <div className="form-grid">
            <Field label="Block from">
              <input
                type="datetime-local"
                value={blockStart}
                required
                onChange={(e) => {
                  setBlockStart(e.target.value);
                  setAffected([]);
                }}
              />
            </Field>
            <Field label="Block until">
              <input
                type="datetime-local"
                value={blockEnd}
                required
                onChange={(e) => {
                  setBlockEnd(e.target.value);
                  setAffected([]);
                }}
              />
            </Field>
          </div>
          <Field label="Reason">
            <textarea
              required
              minLength={5}
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
          <button className="btn" disabled={saving}>
            Review & block interval
          </button>
          {affected.length > 0 && (
            <div className="notice warning block-resolution">
              <div>
                <strong>{affected.length} affected reservations</strong>
                {affected.map((b) => (
                  <Link key={b.id} to={`/bookings/${b.id}`}>
                    {b.id.slice(0, 8)} · {dateTime(b.startTime)} — {dateTime(b.endTime)}
                  </Link>
                ))}
                <button
                  type="button"
                  disabled={saving}
                  className="btn btn-danger"
                  onClick={() => block(true)}
                >
                  Confirm cancellations & full refunds
                </button>
              </div>
            </div>
          )}
        </form>
        <div className="panel padded">
          <h2>Blocked intervals</h2>
          {query.data?.blocks.length ? (
            query.data.blocks.map((b) => (
              <div className="block-item" key={b.id}>
                <div>
                  <strong>{b.reason}</strong>
                  <p className="small muted">
                    {dateTime(b.startTime)} — {dateTime(b.endTime)}
                  </p>
                </div>
                <button
                  className="icon-button danger"
                  aria-label={`Remove block ${b.reason}`}
                  onClick={async () => {
                    if (!window.confirm('Remove this blocked interval?')) return;
                    try {
                      await api(`/spots/${id}/blocks/${b.id}`, { method: 'DELETE' });
                      queryClient.invalidateQueries();
                      toast('Interval released.');
                    } catch (e) {
                      toast((e as Error).message, true);
                    }
                  }}
                >
                  <Trash2 size={17} />
                </button>
              </div>
            ))
          ) : (
            <p className="muted">No upcoming blocked intervals.</p>
          )}
        </div>
      </div>
    </>
  );
}
