import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowUpRight,
  Bell,
  CarFront,
  Wallet,
  House,
  ShieldCheck,
  LogOut,
  LayoutDashboard,
  RefreshCw,
} from 'lucide-react';
import { api, post, queryClient, dateTime, setCsrf } from './api';
import { useAuth, useToast, PageTitle, Loading, ErrorState, Empty } from './ui';
import type { Notification } from './types';
export function Notifications() {
  const toast = useToast();
  const query = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api<Notification[]>('/notifications'),
    refetchInterval: 5000,
  });
  return (
    <>
      <PageTitle
        title="Your notifications"
        text="Booking updates for drivers and hosts. Checked automatically every 5 seconds."
        action={
          <div className="button-row">
            <button
              className="icon-button"
              aria-label="Refresh notifications"
              onClick={() => query.refetch()}
            >
              <RefreshCw size={20} />
            </button>
            <button
              className="btn btn-outline"
              onClick={async () => {
                try {
                  await post('/notifications/read');
                  queryClient.invalidateQueries({ queryKey: ['notifications'] });
                  toast('Notifications marked as read.');
                } catch (e) {
                  toast((e as Error).message, true);
                }
              }}
            >
              Mark all read
            </button>
          </div>
        }
      />
      {query.isPending ? (
        <Loading />
      ) : query.error ? (
        <ErrorState error={query.error} />
      ) : (
        <div className="notification-list">
          {query.data?.length ? (
            query.data.map((n) => (
              <article className={`notification-card ${n.read ? '' : 'unread'}`} key={n.id}>
                <span className="notification-symbol">
                  <Bell size={20} />
                </span>
                <div>
                  <p>{n.message}</p>
                  <span>{dateTime(n.at)} · IST</span>
                  {n.bookingId && (
                    <>
                      <code className="notification-booking-id">{n.bookingId}</code>
                      <Link className="text-button" to={`/bookings/${n.bookingId}`}>
                        View booking
                        <ArrowUpRight size={16} />
                      </Link>
                    </>
                  )}
                </div>
              </article>
            ))
          ) : (
            <Empty
              title="You’re all caught up"
              text="Confirmed bookings, cancellations and parking updates appear here."
            />
          )}
        </div>
      )}
    </>
  );
}
export function Profile() {
  const { data: user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  if (!user) return <Loading />;
  return (
    <>
      <PageTitle title="Your profile" text="Everything you need for your next arrival." />
      <section className="panel padded profile-identity">
        <span className="avatar">
          {user.fullName
            .split(' ')
            .map((v) => v[0])
            .slice(0, 2)
            .join('')}
        </span>
        <div>
          <h2>{user.fullName}</h2>
          <p>{user.email}</p>
          <span className="small muted">
            {user.roles
              .map((v) => (v === 'OWNER' ? 'Host' : v === 'ADMIN' ? 'Administrator' : 'Driver'))
              .join(' · ')}
          </span>
        </div>
      </section>
      <div className="profile-links">
        {[
          ['/vehicles', 'My vehicles', 'Add or manage cars and two-wheelers', CarFront],
          ['/payments', 'Payment history', 'Demo payments, refunds and fines', Wallet],
          [
            '/dashboard',
            'Driver overview',
            'Active session, spending and history',
            LayoutDashboard,
          ],
          [
            '/owner',
            user.roles.includes('OWNER') ? 'Host dashboard' : 'Become a host',
            'Your spaces, reservations and earnings',
            House,
          ],
          ...(user.roles.includes('ADMIN')
            ? [['/admin', 'Administration', 'Listings, accounts and disputes', ShieldCheck]]
            : []),
        ].map(([url, title, detail, Icon]) => {
          const I = Icon as typeof CarFront;
          return (
            <Link key={url as string} to={url as string} className="profile-link">
              <span>
                <I size={24} />
              </span>
              <div>
                <h3>{title as string}</h3>
                <p>{detail as string}</p>
              </div>
              <ArrowUpRight size={20} />
            </Link>
          );
        })}
      </div>
      <button
        className="btn btn-outline"
        onClick={async () => {
          try {
            await post('/auth/logout');
            setCsrf(null);
            queryClient.clear();
            navigate('/login');
          } catch (e) {
            toast((e as Error).message, true);
          }
        }}
      >
        <LogOut size={18} />
        Sign out
      </button>
    </>
  );
}
