import { Link } from 'react-router-dom';
import { ArrowUpRight, Clock3 } from 'lucide-react';
import { dateTime, money } from './api';
import { durationText } from './booking-time';
import { Badge, Empty } from './ui';
import type { Booking } from './types';
export function HostBookings({ bookings }: { bookings: Booking[] }) {
  return (
    <div className="host-booking-list">
      {bookings.length ? (
        bookings.map((b) => (
          <article
            className={`host-booking-card ${b.bookingStatus === 'CONFIRMED' && +new Date(b.serverTime) - +new Date(b.createdAt) < 900000 ? 'new-booking' : ''}`}
            key={b.id}
          >
            <div className="host-booking-top">
              <div>
                <span className="small muted">Booking ID</span>
                <code>{b.id}</code>
              </div>
              <Badge value={b.bookingStatus} />
            </div>
            <div className="host-booking-main">
              <div>
                <span>Driver</span>
                <strong>{b.driver?.fullName ?? 'Driver'}</strong>
                <small>{b.vehicle.registrationNumber}</small>
              </div>
              <div>
                <span>Parking space</span>
                <strong>{b.termsSnapshot.title ?? b.spot.title}</strong>
                <small>{b.spot.spotNumber}</small>
              </div>
              <div>
                <span>Check-in · IST</span>
                <strong>{dateTime(b.startTime)}</strong>
              </div>
              <div>
                <span>Check-out · IST</span>
                <strong>{dateTime(b.endTime)}</strong>
              </div>
            </div>
            <div className="host-booking-bottom">
              <span>
                <Clock3 size={15} />
                {durationText({ start: b.startTime, end: b.endTime })} · {money(b.totalAmount)}
              </span>
              <Link className="btn btn-outline" to={`/bookings/${b.id}`}>
                View details
                <ArrowUpRight size={16} />
              </Link>
            </div>
          </article>
        ))
      ) : (
        <Empty
          title="No reservations in this view"
          text="New confirmed driver bookings arrive here automatically."
        />
      )}
    </div>
  );
}
