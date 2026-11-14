import { createContext, useContext, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, Navigate, useLocation } from 'react-router-dom';
import {
  AlertCircle,
  ArrowUpRight,
  CheckCircle2,
  LoaderCircle,
  ParkingSquare,
  X,
  MapPin,
  Star,
  ShieldCheck,
} from 'lucide-react';
import { api, money, label, setCsrf } from './api';
import type { User, Spot, AppConfig } from './types';
const ToastContext = createContext<(message: string, error?: boolean) => void>(() => {});
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ message: string; error: boolean } | null>(null);
  return (
    <ToastContext.Provider
      value={(message, error = false) => {
        setToast({ message, error });
        setTimeout(() => setToast(null), 6500);
      }}
    >
      {children}
      {toast && (
        <div
          role={toast.error ? 'alert' : 'status'}
          className={`toast ${toast.error ? 'error' : ''}`}
        >
          {toast.error ? <AlertCircle size={20} /> : <CheckCircle2 size={20} />}
          <span>{toast.message}</span>
          <button aria-label="Dismiss notification" onClick={() => setToast(null)}>
            <X size={18} />
          </button>
        </div>
      )}
    </ToastContext.Provider>
  );
}
export const useToast = () => useContext(ToastContext);
export function useAuth() {
  return useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      const result = await api<{ user: User | null; csrf: string | null }>('/auth/me');
      setCsrf(result.csrf);
      return result.user;
    },
    retry: false,
  });
}
export function useConfig() {
  return useQuery({
    queryKey: ['config'],
    queryFn: () => api<AppConfig>('/config'),
    refetchInterval: 10000,
  });
}
export function Guard({ children, role }: { children: ReactNode; role?: string }) {
  const user = useAuth();
  const location = useLocation();
  if (user.isPending) return <Loading />;
  if (!user.data)
    return (
      <Navigate
        to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`}
        replace
      />
    );
  if (role && !user.data.roles.includes(role))
    return (
      <Empty
        title="This workspace needs another permission"
        text="You can manage your driver account or enable hosting from your dashboard."
        action={
          <Link className="btn" to="/dashboard">
            Go to dashboard
          </Link>
        }
      />
    );
  return children;
}
export function Logo() {
  return (
    <Link to="/" className="logo" aria-label="DriveShare home">
      <span className="logo-mark">
        <ParkingSquare size={25} strokeWidth={2.2} />
      </span>
      <span>
        Drive<span className="text-teal">Share</span>
        <span className="logo-dot">.</span>
      </span>
    </Link>
  );
}
export function Loading() {
  return (
    <div className="loading" role="status">
      <LoaderCircle className="spin" size={26} /> Finding a little space…
    </div>
  );
}
export function ErrorState({ error }: { error: unknown }) {
  return (
    <div role="alert" className="notice error">
      <AlertCircle size={20} />
      <span>
        {error instanceof Error ? error.message : 'Something went wrong. Please refresh.'}
      </span>
    </div>
  );
}
export function Empty({
  title,
  text,
  action,
}: {
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <ParkingSquare size={36} />
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}
export function Badge({ value }: { value: string }) {
  return <span className={`badge badge-${value.toLowerCase()}`}>{label(value)}</span>;
}
export function PageTitle({
  eyebrow,
  title,
  text,
  action,
}: {
  eyebrow?: string;
  title: string;
  text?: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-title">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {text && <p>{text}</p>}
      </div>
      {action}
    </div>
  );
}
export function Stat({
  title,
  value,
  detail,
  icon,
}: {
  title: string;
  value: ReactNode;
  detail?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="stat">
      <div className="stat-label">
        {title}
        {icon}
      </div>
      <strong>{value}</strong>
      {detail && <span>{detail}</span>}
    </div>
  );
}
export function SpotCard({
  spot,
  selected,
  onSelect,
}: {
  spot: Spot;
  selected?: boolean;
  onSelect?: () => void;
}) {
  return (
    <article className={`spot-card ${selected ? 'selected' : ''}`}>
      <Link className="spot-image" to={`/explore/${spot.id}`}>
        <img
          src={spot.images[0] ?? '/demo/parking-1.svg'}
          alt={`${spot.parkingType.toLowerCase()} parking illustration for ${spot.title}`}
          loading="lazy"
        />
        <span className="image-tag">
          <ShieldCheck size={13} /> Verified host
        </span>
      </Link>
      <div className="spot-content">
        <div className="row">
          <span className="overline">
            {label(spot.parkingType)} · {spot.distance ?? 0} km away
          </span>
          <span className="rating">
            <Star size={13} fill="currentColor" />
            {spot.rating ? spot.rating.toFixed(1) : 'New'}
          </span>
        </div>
        <Link to={`/explore/${spot.id}`}>
          <h3>{spot.title}</h3>
        </Link>
        <p className="muted small">
          <MapPin size={13} />
          {spot.address.split(',').slice(0, 2).join(',')}
        </p>
        <div className="row card-bottom">
          <div>
            <strong>{money(spot.hourlyPrice)}</strong>
            <span className="muted small"> / hour</span>
          </div>
          {onSelect ? (
            <button className="text-button" onClick={onSelect}>
              {selected ? 'On map' : 'View on map'}
              <ArrowUpRight size={15} />
            </button>
          ) : (
            <Link className="text-button" to={`/explore/${spot.id}`}>
              View space
              <ArrowUpRight size={15} />
            </Link>
          )}
        </div>
        {spot.available === false && (
          <p className="small text-amber">Unavailable for selected time · waiting list available</p>
        )}
      </div>
    </article>
  );
}
export function Field({
  label: labelText,
  children,
  error,
  hint,
}: {
  label: string;
  children: ReactNode;
  error?: string;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{labelText}</span>
      {children}
      {error && (
        <small role="alert" className="field-error">
          {error}
        </small>
      )}
      {hint && <small className="muted">{hint}</small>}
    </label>
  );
}
export function DemoWarning() {
  return (
    <div className="demo-payment">
      <ShieldCheck size={20} />
      <span>DEMO PAYMENT — NO REAL MONEY WILL BE CHARGED</span>
    </div>
  );
}
