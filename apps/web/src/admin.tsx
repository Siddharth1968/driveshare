import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useLocation } from 'react-router-dom';
import {
  ShieldCheck,
  Users,
  House,
  Wallet,
  Clock3,
  ArrowUpRight,
  AlertTriangle,
} from 'lucide-react';
import { api, post, queryClient, money, dateTime, label } from './api';
import type { AdminData, Booking } from './types';
import {
  useAuth,
  useConfig,
  useToast,
  PageTitle,
  Stat,
  Loading,
  ErrorState,
  Badge,
  Empty,
  Field,
  DemoWarning,
} from './ui';
import { BookingRow } from './driver';
export function Admin() {
  const auth = useAuth();
  const showcase = Boolean(auth.data?.showcase);
  const query = useQuery({
    queryKey: ['admin'],
    queryFn: () => api<AdminData>('/admin/overview'),
    refetchInterval: 15000,
  });
  const location = useLocation();
  const toast = useToast();
  const config = useConfig();
  const [busy, setBusy] = useState(false);
  const section = location.pathname.split('/')[2] ?? 'overview';
  async function action(path: string, data: unknown) {
    setBusy(true);
    try {
      await post(path, data);
      await queryClient.invalidateQueries();
      toast('Administrative action recorded.');
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  if (query.isPending) return <Loading />;
  if (query.error || !query.data) return <ErrorState error={query.error} />;
  const data = query.data;
  const disputes = data.bookings.filter((b) => b.dispute?.status === 'OPEN');
  const pending = data.spots.filter((s) => s.approvalStatus === 'PENDING');
  return (
    <>
      <PageTitle
        eyebrow="KEEPING THE NEIGHBORHOOD FAIR"
        title={
          {
            overview: 'A clearer view.',
            listings: 'Listing approvals',
            users: 'The neighborhood',
            disputes: 'A fair resolution.',
            bookings: 'Every reservation',
            payments: 'Simulated payment records',
          }[section] ?? 'Administration'
        }
        text="Review carefully. Every administrative decision leaves an audit trail."
      />
      {showcase && (
        <div className="notice" data-testid="admin-showcase-banner">
          <ShieldCheck size={20} />
          <div>
            <strong>Restricted admin demonstration</strong>
            <p>
              Read-only showcase mode protects shared demonstration listings, accounts and disputes.
            </p>
          </div>
        </div>
      )}
      {section === 'overview' && (
        <>
          <div className="stats-grid">
            <Stat
              title="Registered neighbors"
              value={data.stats.users}
              icon={<Users size={18} />}
            />
            <Stat
              title="Parking spaces"
              value={data.stats.spots}
              detail={`${pending.length} waiting for review`}
              icon={<House size={18} />}
            />
            <Stat
              title="Open disputes"
              value={data.stats.disputes}
              icon={<ShieldCheck size={18} />}
            />
            <Stat
              title="Net demo payments"
              value={money(data.stats.revenue)}
              detail="Signed credits less refunds"
              icon={<Wallet size={18} />}
            />
          </div>
          <div className="dashboard-columns">
            <div className="panel padded">
              <h2>A little attention needed</h2>
              <Link className="admin-task" to="/admin/listings">
                <ShieldCheck />
                <div>
                  <strong>{pending.length} listings to review</strong>
                  <span>Verify permission and listing details</span>
                </div>
                <ArrowUpRight size={18} />
              </Link>
              <Link className="admin-task" to="/admin/disputes">
                <AlertTriangle />
                <div>
                  <strong>{disputes.length} open disputes</strong>
                  <span>Listen to both sides and resolve fairly</span>
                </div>
                <ArrowUpRight size={18} />
              </Link>
              <Link className="admin-task" to="/admin/bookings">
                <Clock3 />
                <div>
                  <strong>{data.bookings.filter((b) => b.occupied).length} occupied spaces</strong>
                  <span>Physical occupancy stays until verified checkout</span>
                </div>
                <ArrowUpRight size={18} />
              </Link>
            </div>
            {config.data?.demo && (
              <div className="panel padded demo-controls">
                <span className="eyebrow">LOCAL DEMONSTRATION ONLY</span>
                <h2>Make time for a demonstration.</h2>
                <p>
                  Seeded scenarios include an overdue vehicle, a protected next driver, a disputed
                  fine, a waiting driver and a listing awaiting approval.
                </p>
                <p className="small muted">
                  Authoritative server time: {dateTime(config.data.serverTime)}
                </p>
                <div className="button-row wrap">
                  <button
                    className="btn"
                    disabled={busy}
                    onClick={() => action('/demo/clock', { advanceMinutes: 35 })}
                  >
                    Advance demo clock 35 min
                  </button>
                  <button
                    className="btn btn-outline"
                    disabled={busy}
                    onClick={() => action('/demo/clock', { reset: true })}
                  >
                    Restore real time
                  </button>
                </div>
                <p className="small muted">
                  Process-local clock. No operating-system time changes. Controls are disabled in
                  production. Database reset is an explicit local CLI command.
                </p>
              </div>
            )}
          </div>
          <div className="section-heading compact">
            <h2>Recent activity</h2>
          </div>
          <div className="panel">
            {data.bookings.slice(0, 5).map((b) => (
              <BookingRow key={b.id} booking={b} />
            ))}
          </div>
        </>
      )}
      {section === 'listings' && (
        <div className="owner-spot-grid">
          {data.spots.map((s) => (
            <article className="panel owner-spot" key={s.id}>
              <img src={s.images[0] ?? '/demo/parking-1.svg'} alt={s.title} />
              <div className="padded">
                <div className="row">
                  <Badge value={s.approvalStatus} />
                  <strong>{money(s.hourlyPrice)} / hr</strong>
                </div>
                <h2>{s.title}</h2>
                <p>{s.address}</p>
                <p className="small muted">
                  Host: {s.owner?.fullName} · Permission:{' '}
                  {s.permissionConfirmed ? 'confirmed' : 'missing'}
                </p>
                <p className="small">{s.description}</p>
                <div className="button-row">
                  <button
                    className="btn btn-sm"
                    disabled={busy || showcase || s.approvalStatus === 'APPROVED'}
                    onClick={() => {
                      const reason = window.prompt(
                        'Approval notes (at least 5 characters):',
                        'Listing and permission reviewed.',
                      );
                      if (reason)
                        action(`/admin/spots/${s.id}`, { approvalStatus: 'APPROVED', reason });
                    }}
                  >
                    Approve listing
                  </button>
                  <button
                    className="btn btn-outline btn-sm"
                    disabled={busy || showcase || s.approvalStatus === 'REJECTED'}
                    onClick={() => {
                      const reason = window.prompt('Explain the rejection:');
                      if (reason)
                        action(`/admin/spots/${s.id}`, { approvalStatus: 'REJECTED', reason });
                    }}
                  >
                    Reject listing
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
      {section === 'users' && (
        <div className="panel table-scroll">
          <table>
            <thead>
              <tr>
                <th>Neighbor</th>
                <th>Capabilities</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {data.users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <strong>{u.fullName}</strong>
                    <small>{u.email}</small>
                  </td>
                  <td>{u.roles.map(label).join(', ')}</td>
                  <td>
                    <Badge value={u.accountStatus} />
                  </td>
                  <td>
                    {!u.roles.includes('ADMIN') && (
                      <button
                        disabled={busy || showcase}
                        className="btn btn-outline btn-sm"
                        onClick={() => {
                          const reason = window.prompt(
                            `Reason to ${u.accountStatus === 'ACTIVE' ? 'suspend' : 'restore'} this account:`,
                          );
                          if (reason)
                            action(`/admin/users/${u.id}`, {
                              accountStatus: u.accountStatus === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE',
                              reason,
                            });
                        }}
                      >
                        {u.accountStatus === 'ACTIVE' ? 'Suspend' : 'Restore'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {section === 'disputes' && (
        <>
          {disputes.length ? (
            disputes.map((b) => (
              <Resolution
                booking={b}
                key={b.id}
                busy={busy || showcase}
                onResolve={(input) => action(`/bookings/${b.id}/actions/resolve`, input)}
              />
            ))
          ) : (
            <Empty title="A little peace of mind" text="There are no open disputes to review." />
          )}
          <div className="section-heading compact">
            <h2>Fine and checkout interventions</h2>
          </div>
          <p className="muted small">
            Review all sessions, including cases without a formal dispute. Paid fines may be reduced
            with simulated refunds.
          </p>
          {data.bookings
            .filter((b) => !b.dispute || b.dispute.status !== 'OPEN')
            .filter((b) => b.occupied || b.fineAmount > 0 || b.bookingStatus === 'NO_SHOW')
            .map((b) => (
              <Resolution
                booking={b}
                key={b.id}
                busy={busy || showcase}
                onResolve={(input) => action(`/bookings/${b.id}/actions/resolve`, input)}
              />
            ))}
        </>
      )}
      {section === 'bookings' && (
        <div className="panel">
          {data.bookings.map((b) => (
            <BookingRow key={b.id} booking={b} />
          ))}
        </div>
      )}
      {section === 'payments' && (
        <>
          <DemoWarning />
          <div className="panel table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Booking</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {data.payments.map((p) => (
                  <tr key={p.id}>
                    <td>{p.transactionReference}</td>
                    <td>
                      <Link className="text-teal" to={`/bookings/${p.bookingId}`}>
                        {p.bookingId.slice(0, 8)}
                      </Link>
                    </td>
                    <td>{label(p.paymentType)}</td>
                    <td>
                      <Badge value={p.paymentStatus} />
                    </td>
                    <td>{money(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
function Resolution({
  booking: b,
  busy,
  onResolve,
}: {
  booking: Booking;
  busy: boolean;
  onResolve: (input: unknown) => void;
}) {
  const [fine, setFine] = useState(String(b.fineAmount / 100));
  const [message, setMessage] = useState('');
  const [departure, setDeparture] = useState(false);
  const [refund, setRefund] = useState(false);
  return (
    <form
      className="panel padded resolution"
      onSubmit={(e) => {
        e.preventDefault();
        if (
          window.confirm(
            'Record this administrative resolution and apply the simulated fine adjustment?',
          )
        )
          onResolve({
            fineAmount: Math.round(Number(fine) * 100),
            message,
            departureVerified: departure,
            refundNoShow: refund,
          });
      }}
    >
      <div className="row">
        <div>
          <h2>{b.spot.title}</h2>
          <Link className="text-button small" to={`/bookings/${b.id}`}>
            {b.driver?.fullName ?? 'Driver'} · Reservation {b.id.slice(0, 8)}
            <ArrowUpRight size={14} />
          </Link>
        </div>
        <Badge value={b.fineStatus} />
      </div>
      {b.dispute && (
        <div className="notice">
          <div>
            <strong>Driver’s account</strong>
            <p>{b.dispute.message}</p>
            {b.dispute.responses?.map((r, i) => (
              <p key={i}>
                <strong>Owner:</strong> {r.detail}
              </p>
            ))}
          </div>
        </div>
      )}
      <p className="small muted">
        Physical occupancy: {b.occupied ? 'Occupied' : 'Not occupied'} · Booking:{' '}
        {label(b.bookingStatus)} · Recorded fine: {money(b.fineAmount)}
      </p>
      <div className="form-grid">
        <Field label="Adjusted fine (₹)">
          <input
            type="number"
            min={0}
            max={10000}
            step="0.01"
            value={fine}
            onChange={(e) => setFine(e.target.value)}
            required
          />
        </Field>
        <Field label="Resolution explanation">
          <input
            required
            minLength={5}
            maxLength={2000}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Explain the evidence and decision"
          />
        </Field>
      </div>
      {b.occupied && (
        <label className="checkbox">
          <input
            type="checkbox"
            checked={departure}
            onChange={(e) => setDeparture(e.target.checked)}
          />
          I verified that the vehicle has departed. Complete checkout and release physical
          occupancy.
        </label>
      )}
      {b.bookingStatus === 'NO_SHOW' && (
        <label className="checkbox">
          <input type="checkbox" checked={refund} onChange={(e) => setRefund(e.target.checked)} />
          Reverse the no-show fee with a full simulated refund.
        </label>
      )}
      <div className="button-row">
        <button className="btn" disabled={busy || Boolean(b.occupied && !departure)}>
          Record resolution
        </button>
        <button
          type="button"
          className="btn btn-outline"
          onClick={() => {
            setFine('0');
            if (!message) setMessage('Fine waived after reviewing the driver and owner evidence.');
          }}
        >
          Set fine to zero
        </button>
      </div>
    </form>
  );
}
