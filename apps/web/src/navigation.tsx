import { useQuery } from '@tanstack/react-query';
import { Link, NavLink, Routes, Route, useLocation } from 'react-router-dom';
import {
  Search,
  CalendarDays,
  Bell,
  UserRound,
  House,
  LayoutDashboard,
  Wallet,
  ShieldCheck,
  Users,
  MessageSquare,
  Plus,
  ArrowUpRight,
} from 'lucide-react';
import { api } from './api';
import { Logo, Guard, useAuth, useConfig, Empty } from './ui';
import type { Notification } from './types';
import { AuthPage } from './public';
import { Explore, SpotDetails, BookingConfirmation } from './search';
import {
  DriverDashboard,
  Bookings,
  BookingDetails,
  Vehicles,
  PaymentPage,
  PaymentHistory,
} from './driver';
import { OwnerDashboard, OwnerSpots, ListingEditor, Availability } from './owner';
import { Admin } from './admin';
import { Profile, Notifications } from './account';
const nav = [
  ['/', 'Find parking', Search],
  ['/bookings', 'My bookings', CalendarDays],
  ['/notifications', 'Notifications', Bell],
  ['/profile', 'Profile', UserRound],
] as const;
const ownerLinks = [
  ['/owner', 'Overview', LayoutDashboard],
  ['/owner/spots', 'My parking spaces', House],
  ['/owner/bookings', 'Reservations', CalendarDays],
  ['/owner/earnings', 'Earnings', Wallet],
] as const;
const adminLinks = [
  ['/admin', 'Overview', LayoutDashboard],
  ['/admin/listings', 'Listing approvals', ShieldCheck],
  ['/admin/users', 'User management', Users],
  ['/admin/disputes', 'Disputes', MessageSquare],
  ['/admin/bookings', 'Booking monitor', CalendarDays],
  ['/admin/payments', 'Payment records', Wallet],
] as const;
export default function App() {
  const auth = useAuth();
  const config = useConfig();
  const location = useLocation();
  const owner = location.pathname.startsWith('/owner'),
    admin = location.pathname.startsWith('/admin');
  const sidebar = Boolean(auth.data && (owner || admin));
  const searchPage = ['/', '/explore'].includes(location.pathname);
  const authPage = ['/login', '/register'].includes(location.pathname);
  const details =
    location.pathname.startsWith('/explore/') ||
    location.pathname.startsWith('/booking-confirmation/');
  const { data: notifications = [] } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api<Notification[]>('/notifications'),
    enabled: Boolean(auth.data),
    refetchInterval: 5000,
  });
  const unread = notifications.filter((n) => !n.read).length;
  function navigation(mobile = false) {
    return (
      <nav
        className={mobile ? 'bottom-navigation' : 'desktop-navigation'}
        aria-label={mobile ? 'Mobile navigation' : 'Main navigation'}
      >
        {nav.map(([url, title, Icon]) => (
          <NavLink
            key={url}
            to={url}
            end={url === '/' || url === '/bookings'}
            className={({ isActive }) =>
              isActive || (url === '/' && location.pathname === '/explore') ? 'active' : ''
            }
          >
            <span className="nav-icon">
              <Icon size={20} />
              {url === '/notifications' && unread > 0 && <i />}
            </span>
            <span>{title}</span>
          </NavLink>
        ))}
      </nav>
    );
  }
  return (
    <>
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <header className="header">
        <div className="header-inner">
          <Logo />
          {navigation()}
          <div className="header-actions">
            {config.data?.demo && (
              <span className="demo-pill">
                <span />
                Local demo
              </span>
            )}
            {auth.data ? (
              <>
                {auth.data.roles.includes('OWNER') && (
                  <Link className="host-shortcut" to="/owner">
                    <House size={16} />
                    Host dashboard
                  </Link>
                )}
                {auth.data.roles.includes('ADMIN') && (
                  <Link className="host-shortcut" to="/admin">
                    Admin
                  </Link>
                )}
                <Link className="avatar" to="/profile" aria-label="My profile">
                  {auth.data.fullName
                    .split(' ')
                    .map((n) => n[0])
                    .slice(0, 2)
                    .join('')}
                </Link>
              </>
            ) : (
              <Link className="btn btn-sm" to="/login">
                Sign in
                <ArrowUpRight size={15} />
              </Link>
            )}
          </div>
        </div>
      </header>
      <div className={sidebar ? 'workspace redesign-workspace' : ''}>
        {sidebar && (
          <aside className="sidebar">
            <Link className="workspace-return" to="/profile">
              Your workspaces
            </Link>
            <div className="workspace-switch">
              <Link to="/">Driver</Link>
              <Link className={owner ? 'active' : ''} to="/owner">
                Host
              </Link>
              {auth.data?.roles.includes('ADMIN') && (
                <Link className={admin ? 'active' : ''} to="/admin">
                  Admin
                </Link>
              )}
            </div>
            <nav aria-label="Workspace navigation">
              {(admin ? adminLinks : ownerLinks).map(([url, title, Icon]) => (
                <NavLink key={url} to={url} end>
                  <Icon size={19} />
                  {title}
                </NavLink>
              ))}
            </nav>
            {owner && (
              <Link className="btn sidebar-create" to="/owner/spots/new">
                <Plus size={17} />
                List a space
              </Link>
            )}
            <p className="sidebar-note">
              Every reservation connects a driver and host through the same booking ID.
            </p>
          </aside>
        )}
        <main
          id="main-content"
          className={
            sidebar ? 'workspace-main' : searchPage || details || authPage ? '' : 'account-main'
          }
        >
          <Routes>
            <Route path="/" element={<Explore />} />
            <Route path="/explore" element={<Explore />} />
            <Route path="/explore/:id" element={<SpotDetails />} />
            <Route path="/login" element={<AuthPage />} />
            <Route path="/register" element={<AuthPage register />} />
            <Route
              path="/profile"
              element={
                <Guard>
                  <Profile />
                </Guard>
              }
            />
            <Route
              path="/notifications"
              element={
                <Guard>
                  <Notifications />
                </Guard>
              }
            />
            <Route
              path="/booking-confirmation/:id"
              element={
                <Guard>
                  <BookingConfirmation />
                </Guard>
              }
            />
            <Route
              path="/dashboard"
              element={
                <Guard>
                  <DriverDashboard />
                </Guard>
              }
            />
            <Route
              path="/bookings"
              element={
                <Guard>
                  <Bookings />
                </Guard>
              }
            />
            <Route
              path="/bookings/:id"
              element={
                <Guard>
                  <BookingDetails />
                </Guard>
              }
            />
            <Route
              path="/vehicles"
              element={
                <Guard>
                  <Vehicles />
                </Guard>
              }
            />
            <Route
              path="/payments"
              element={
                <Guard>
                  <PaymentHistory />
                </Guard>
              }
            />
            <Route
              path="/pay/:id"
              element={
                <Guard>
                  <PaymentPage />
                </Guard>
              }
            />
            <Route
              path="/owner"
              element={
                <Guard>
                  <OwnerDashboard />
                </Guard>
              }
            />
            <Route
              path="/owner/spots"
              element={
                <Guard role="OWNER">
                  <OwnerSpots />
                </Guard>
              }
            />
            <Route
              path="/owner/spots/new"
              element={
                <Guard role="OWNER">
                  <ListingEditor />
                </Guard>
              }
            />
            <Route
              path="/owner/spots/:id/edit"
              element={
                <Guard role="OWNER">
                  <ListingEditor />
                </Guard>
              }
            />
            <Route
              path="/owner/spots/:id/availability"
              element={
                <Guard role="OWNER">
                  <Availability />
                </Guard>
              }
            />
            <Route
              path="/owner/bookings"
              element={
                <Guard role="OWNER">
                  <Bookings owner />
                </Guard>
              }
            />
            <Route
              path="/owner/earnings"
              element={
                <Guard role="OWNER">
                  <PaymentHistory owner />
                </Guard>
              }
            />
            <Route
              path="/admin/*"
              element={
                <Guard role="ADMIN">
                  <Admin />
                </Guard>
              }
            />
            <Route
              path="*"
              element={
                <Empty
                  title="Page not found"
                  text="Head back to parking to find your next space."
                  action={
                    <Link className="btn" to="/">
                      Find parking
                    </Link>
                  }
                />
              }
            />
          </Routes>
        </main>
      </div>
      {sidebar && (
        <nav className="workspace-mobile-nav" aria-label="Host and admin navigation">
          {(admin ? adminLinks : ownerLinks).map(([url, title]) => (
            <NavLink key={url} to={url} end>
              {title}
            </NavLink>
          ))}
        </nav>
      )}
      {!authPage && navigation(true)}
      {!sidebar && (
        <footer className="footer">
          <Logo />
          <span>Fictional demo parking near Sahyadri College, Adyar, Mangaluru.</span>
          <span>Simulated payments · No real money</span>
        </footer>
      )}
    </>
  );
}
