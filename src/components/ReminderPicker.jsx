import { useState } from 'react';
import Popover from './Popover.jsx';
import { IconBell } from './Icons.jsx';

// Reminders kept simple. Ramble can set reminders, so the field stays. Each is
// { type: "relative", at } as an ISO 8601 duration before the due time.
const OPTIONS = [
  { at: 'PT0M', label: 'At time of task' },
  { at: '-PT10M', label: '10 minutes before' },
  { at: '-PT1H', label: '1 hour before' },
  { at: '-P1D', label: '1 day before' }
];

export default function ReminderPicker({ value = [], onChange }) {
  const [open, setOpen] = useState(false);

  function toggle(at) {
    const has = value.some((r) => r.at === at);
    if (has) onChange(value.filter((r) => r.at !== at));
    else onChange([...value, { type: 'relative', at }]);
  }

  return (
    <div className="popover-wrap">
      <button type="button" className={`chip ${value.length ? 'active' : ''}`} onClick={() => setOpen((v) => !v)}>
        <IconBell width={14} height={14} className="icon" />
        {value.length ? `${value.length} reminder${value.length > 1 ? 's' : ''}` : 'Reminders'}
      </button>
      {open ? (
        <Popover onClose={() => setOpen(false)}>
          {OPTIONS.map((o) => (
            <button key={o.at} type="button" className="popover-item" onClick={() => toggle(o.at)}>
              <IconBell width={16} height={16} className="icon" />
              {o.label}
              <span className="when">{value.some((r) => r.at === o.at) ? '✓' : ''}</span>
            </button>
          ))}
        </Popover>
      ) : null}
    </div>
  );
}
