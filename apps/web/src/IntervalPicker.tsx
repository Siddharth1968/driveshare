import { useState } from 'react';
import { CalendarDays, Clock3 } from 'lucide-react';
import {
  type BookingInterval,
  istParts,
  istToISO,
  withDuration,
  hoursBetween,
  durationText,
} from './booking-time';
export function IntervalPicker({
  value,
  onChange,
  serverTime,
}: {
  value: BookingInterval;
  onChange: (value: BookingInterval) => void;
  serverTime?: string;
}) {
  const [custom, setCustom] = useState(false);
  const start = istParts(value.start),
    end = istParts(value.end);
  function change(which: 'start' | 'end', part: 'date' | 'time', text: string) {
    const current = which === 'start' ? start : end;
    const iso = istToISO(
      part === 'date' ? text : current.date,
      part === 'time' ? text : current.time,
    );
    if (!iso) return;
    if (which === 'start' && !custom) {
      onChange(withDuration(iso, hoursBetween(value) || 2));
    } else {
      setCustom(true);
      onChange({ ...value, [which]: iso });
    }
  }
  return (
    <div className="interval-picker">
      <div className="interval-fields">
        {(['start', 'end'] as const).map((which) => {
          const parts = which === 'start' ? start : end;
          const name = which === 'start' ? 'Check-in' : 'Check-out';
          const times = Array.from(
            { length: 96 },
            (_, i) =>
              `${String(Math.floor(i / 4)).padStart(2, '0')}:${String((i % 4) * 15).padStart(2, '0')}`,
          );
          if (parts.time && !times.includes(parts.time)) times.push(parts.time);
          return (
            <fieldset className="time-box" key={which}>
              <legend>{name}</legend>
              <label>
                <CalendarDays size={18} />
                <span className="sr-only">{name} date</span>
                <input
                  aria-label={`${name} date`}
                  type="date"
                  required
                  min={serverTime ? istParts(serverTime).date : undefined}
                  value={parts.date}
                  onChange={(e) => change(which, 'date', e.target.value)}
                />
              </label>
              <label>
                <Clock3 size={18} />
                <span className="sr-only">{name} time (24-hour IST)</span>
                <select
                  aria-label={`${name} time (24-hour IST)`}
                  value={parts.time}
                  onChange={(e) => change(which, 'time', e.target.value)}
                >
                  {times.sort().map((t) => (
                    <option value={t} key={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
            </fieldset>
          );
        })}
      </div>
      <div className="duration-row">
        <span>How long?</span>
        <div className="duration-buttons">
          {[1, 2, 4, 8, 12, 24].map((h) => (
            <button
              type="button"
              aria-pressed={!custom && hoursBetween(value) === h}
              key={h}
              onClick={() => {
                setCustom(false);
                onChange(withDuration(value.start, h));
              }}
            >
              {h} {h === 1 ? 'Hour' : 'Hours'}
            </button>
          ))}
          <button type="button" aria-pressed={custom} onClick={() => setCustom(true)}>
            Custom
          </button>
        </div>
      </div>
      <div className="interval-note">
        <span>India Standard Time · 24-hour clock</span>
        <strong>{durationText(value)} total</strong>
      </div>
    </div>
  );
}
