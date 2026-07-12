import { useState } from 'react';
import Popover from './Popover.jsx';
import { IconCalendarSmall, IconClock, IconX } from './Icons.jsx';
import {
  presetDate,
  relativeLabel,
  toISODate,
  parseISODate,
  todayISO,
  MONTHS,
  DOW_SHORT,
  formatTime
} from '../lib/date.js';

const PRESETS = [
  { kind: 'today', label: 'Today' },
  { kind: 'tomorrow', label: 'Tomorrow' },
  { kind: 'weekend', label: 'This weekend' },
  { kind: 'nextweek', label: 'Next week' },
  { kind: 'nodate', label: 'No date' }
];

function buildMonth(year, month) {
  const first = new Date(year, month, 1);
  const startDow = first.getDay();
  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  const days = new Date(year, month + 1, 0).getDate();
  for (let d = 1; d <= days; d++) cells.push(new Date(year, month, d));
  return cells;
}

// Date picker: presets, a month calendar, and an optional time. Sets a due of
// { date, datetime, string, isRecurring }. See docs/llm-pipeline.md for the shape.
export default function DatePicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const initial = value?.date ? parseISODate(value.date) : new Date();
  const [cursor, setCursor] = useState({ y: initial.getFullYear(), m: initial.getMonth() });
  const [showTime, setShowTime] = useState(Boolean(value?.datetime));

  const selectedISO = value?.date || null;

  function setDue(dateISO, time) {
    if (!dateISO) {
      onChange(null);
      return;
    }
    let datetime = null;
    let str = relativeLabel(dateISO);
    if (time) {
      const [h, min] = time.split(':').map(Number);
      const d = parseISODate(dateISO);
      d.setHours(h, min, 0, 0);
      datetime = d.toISOString();
      str = `${relativeLabel(dateISO)} ${formatTime(d)}`;
    }
    onChange({ date: dateISO, datetime, string: str, isRecurring: false });
  }

  const cells = buildMonth(cursor.y, cursor.m);
  const currentTime = value?.datetime ? new Date(value.datetime) : null;
  const timeStr = currentTime
    ? `${String(currentTime.getHours()).padStart(2, '0')}:${String(currentTime.getMinutes()).padStart(2, '0')}`
    : '';

  return (
    <div className="popover-wrap">
      <button type="button" className={`chip ${value?.date ? 'active' : ''}`} onClick={() => setOpen((v) => !v)}>
        <IconCalendarSmall width={14} height={14} className="icon" style={{ color: value?.date ? 'var(--ds-due-green)' : undefined }} />
        {value?.date ? (value.datetime ? value.string : relativeLabel(value.date)) : 'Date'}
        {value?.date ? (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              setDue(null);
            }}
            style={{ display: 'inline-flex' }}
          >
            <IconX width={12} height={12} className="icon" />
          </span>
        ) : null}
      </button>
      {open ? (
        <Popover onClose={() => setOpen(false)}>
          {PRESETS.map((p) => (
            <button
              key={p.kind}
              type="button"
              className="popover-item"
              onClick={() => {
                setDue(presetDate(p.kind));
                if (p.kind === 'nodate') setOpen(false);
              }}
            >
              {p.label}
              <span className="when">
                {p.kind === 'nodate' ? '' : relativeLabel(presetDate(p.kind))}
              </span>
            </button>
          ))}

          <div className="cal">
            <div className="cal-head">
              <button type="button" className="icon-btn" onClick={() => setCursor((c) => ({ y: c.m === 0 ? c.y - 1 : c.y, m: (c.m + 11) % 12 }))}>
                ‹
              </button>
              <span>
                {MONTHS[cursor.m]} {cursor.y}
              </span>
              <button type="button" className="icon-btn" onClick={() => setCursor((c) => ({ y: c.m === 11 ? c.y + 1 : c.y, m: (c.m + 1) % 12 }))}>
                ›
              </button>
            </div>
            <div className="cal-grid">
              {DOW_SHORT.map((d) => (
                <div key={d} className="cal-dow">
                  {d}
                </div>
              ))}
              {cells.map((d, i) =>
                d ? (
                  <button
                    key={i}
                    type="button"
                    className={`cal-day ${toISODate(d) === todayISO() ? 'today' : ''} ${
                      selectedISO === toISODate(d) ? 'selected' : ''
                    }`}
                    onClick={() => setDue(toISODate(d), showTime ? timeStr || '09:00' : null)}
                  >
                    {d.getDate()}
                  </button>
                ) : (
                  <span key={i} />
                )
              )}
            </div>
          </div>

          <button
            type="button"
            className="popover-item"
            onClick={() => {
              setShowTime((v) => !v);
              if (!showTime && value?.date) setDue(value.date, timeStr || '09:00');
            }}
          >
            <IconClock width={16} height={16} className="icon" />
            Time
            <span className="when">{value?.datetime ? formatTime(new Date(value.datetime)) : ''}</span>
          </button>
          {showTime ? (
            <div style={{ padding: '4px 10px 8px' }}>
              <input
                type="time"
                value={timeStr}
                onChange={(e) => setDue(value?.date || todayISO(), e.target.value)}
                style={{ width: '100%', padding: '6px', border: '1px solid var(--ds-line)', borderRadius: 6 }}
              />
            </div>
          ) : null}
        </Popover>
      ) : null}
    </div>
  );
}
