import { useState } from 'react';
import Popover from './Popover.jsx';
import ConfirmDialog from './ConfirmDialog.jsx';
import { IconHash, IconX } from './Icons.jsx';

// Pick from existing labels or create one by typing. Value is an array of label
// names. New labels are created through the store via onCreateLabel and applied
// to the current task immediately. There is no separate Labels page; deleting a
// label happens right here too, behind a confirm.
export default function LabelPicker({ value = [], labels = [], onChange, onCreateLabel, onDeleteLabel }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);

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
            <div key={l.id} className="popover-item-row">
              <button type="button" className="popover-item" onClick={() => toggle(l.name)}>
                <IconHash width={16} height={16} className="icon" />
                {l.name}
                <span className="when">{value.includes(l.name) ? '✓' : ''}</span>
              </button>
              {onDeleteLabel ? (
                <button
                  type="button"
                  className="icon-btn label-delete"
                  title={`Delete label ${l.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteTarget(l);
                  }}
                >
                  <IconX width={12} height={12} />
                </button>
              ) : null}
            </div>
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
              Create "{query}"
            </button>
          ) : null}
          {!labels.length && !query ? <div style={{ padding: '6px 10px', color: 'var(--ds-ink-soft)' }}>No labels yet</div> : null}
        </Popover>
      ) : null}

      {deleteTarget ? (
        <ConfirmDialog
          title={`Delete label "${deleteTarget.name}"?`}
          message="Tasks keep the label name until edited. This only removes it from the picker."
          confirmLabel="Delete label"
          onConfirm={async () => {
            const target = deleteTarget;
            setDeleteTarget(null);
            await onDeleteLabel(target.id);
          }}
          onCancel={() => setDeleteTarget(null)}
        />
      ) : null}
    </div>
  );
}
