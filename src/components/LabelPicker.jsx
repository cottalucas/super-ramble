import { useState } from 'react';
import Popover from './Popover.jsx';
import { IconHash } from './Icons.jsx';

// Pick from existing labels or create one by typing. Value is an array of label
// names. New labels are created through the store via onCreateLabel.
export default function LabelPicker({ value = [], labels = [], onChange, onCreateLabel }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  function toggle(name) {
    if (value.includes(name)) onChange(value.filter((n) => n !== name));
    else onChange([...value, name]);
  }

  const filtered = labels.filter((l) => l.name.toLowerCase().includes(query.toLowerCase()));
  const exact = labels.some((l) => l.name.toLowerCase() === query.toLowerCase());

  return (
    <div className="popover-wrap">
      <button type="button" className={`chip ${value.length ? 'active' : ''}`} onClick={() => setOpen((v) => !v)}>
        <IconHash width={14} height={14} className="icon" />
        {value.length ? value.map((n) => `@${n}`).join(' ') : 'Labels'}
      </button>
      {open ? (
        <Popover onClose={() => setOpen(false)}>
          <div style={{ padding: '4px 8px 8px' }}>
            <input
              autoFocus
              placeholder="Type a label"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ width: '100%', padding: '6px', border: '1px solid var(--ds-line)', borderRadius: 6, outline: 'none' }}
            />
          </div>
          {filtered.map((l) => (
            <button key={l.id} type="button" className="popover-item" onClick={() => toggle(l.name)}>
              <IconHash width={16} height={16} className="icon" />
              {l.name}
              <span className="when">{value.includes(l.name) ? '✓' : ''}</span>
            </button>
          ))}
          {query && !exact ? (
            <button
              type="button"
              className="popover-item"
              onClick={async () => {
                await onCreateLabel(query);
                toggle(query);
                setQuery('');
              }}
            >
              <IconHash width={16} height={16} className="icon" />
              Create label "{query}"
            </button>
          ) : null}
          {!labels.length && !query ? <div style={{ padding: '6px 10px', color: 'var(--ds-ink-soft)' }}>No labels yet</div> : null}
        </Popover>
      ) : null}
    </div>
  );
}
