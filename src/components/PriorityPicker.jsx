import { useState } from 'react';
import Popover from './Popover.jsx';
import { IconFlag } from './Icons.jsx';

const OPTIONS = [
  { p: 1, label: 'Priority 1', cls: 'flag-p1' },
  { p: 2, label: 'Priority 2', cls: 'flag-p2' },
  { p: 3, label: 'Priority 3', cls: 'flag-p3' },
  { p: 4, label: 'Priority 4', cls: 'flag-p4' }
];

export function priorityClass(p) {
  return p === 1 ? 'p1' : p === 2 ? 'p2' : p === 3 ? 'p3' : '';
}

// The four-flag priority picker. p1 red, p2 orange, p3 blue, p4 none.
export default function PriorityPicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const active = OPTIONS.find((o) => o.p === value) || OPTIONS[3];
  return (
    <div className="popover-wrap">
      <button type="button" className={`chip ${value && value < 4 ? 'active' : ''}`} onClick={() => setOpen((v) => !v)}>
        <IconFlag width={14} height={14} className={`icon ${active.cls}`} filled={value < 4} />
        {value && value < 4 ? `P${value}` : 'Priority'}
      </button>
      {open ? (
        <Popover onClose={() => setOpen(false)}>
          {OPTIONS.map((o) => (
            <button
              key={o.p}
              type="button"
              className="popover-item"
              onClick={() => {
                onChange(o.p);
                setOpen(false);
              }}
            >
              <IconFlag width={16} height={16} className={`icon ${o.cls}`} filled={o.p < 4} />
              {o.label}
            </button>
          ))}
        </Popover>
      ) : null}
    </div>
  );
}
