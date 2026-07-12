import { useState } from 'react';
import Popover from './Popover.jsx';
import LayoutTabs from './LayoutTabs.jsx';
import { IconListView, IconBoardView } from './Icons.jsx';

const GROUP_OPTIONS = [
  { key: 'none', label: 'None' },
  { key: 'priority', label: 'Priority' },
  { key: 'date', label: 'Date' },
  { key: 'createdAt', label: 'Date added' }
];

const SORT_OPTIONS = [
  { key: 'priority', label: 'Priority' },
  { key: 'date', label: 'Date' },
  { key: 'manual', label: 'Manual' }
];

// The one header popover for every view that supports Board: List/Board
// tabs, then Group by and Sort by when the caller passes them. Inbox and
// Project pass both; Today and Upcoming pass neither, so the popover shows
// just the tabs, the same trigger chrome everywhere. Replaces the standalone
// SortControl from phase 2.5 and the bare LayoutTabs Today and Upcoming used
// to render directly. No Filter section, per docs/roadmap.md.
export default function LayoutControl({ layout, onLayoutChange, groupMode, onGroupChange, sortMode, onSortChange }) {
  const [open, setOpen] = useState(false);
  const showGroup = groupMode !== undefined;
  const showSort = sortMode !== undefined;

  return (
    <div className="popover-wrap">
      <button type="button" className="btn btn-quiet layout-trigger" onClick={() => setOpen((v) => !v)}>
        {layout === 'board' ? <IconBoardView width={14} height={14} /> : <IconListView width={14} height={14} />}
        Display
      </button>
      {open ? (
        <Popover onClose={() => setOpen(false)}>
          <LayoutTabs layout={layout} onChange={onLayoutChange} />

          {showGroup ? (
            <>
              <div className="popover-section-label">Group by</div>
              {GROUP_OPTIONS.map((o) => (
                <button
                  key={o.key}
                  type="button"
                  className="popover-item"
                  onClick={() => onGroupChange(o.key)}
                >
                  {o.label}
                  <span className="when">{groupMode === o.key ? '✓' : ''}</span>
                </button>
              ))}
            </>
          ) : null}

          {showSort ? (
            <>
              <div className="popover-section-label">Sort by</div>
              {SORT_OPTIONS.map((o) => (
                <button
                  key={o.key}
                  type="button"
                  className="popover-item"
                  onClick={() => onSortChange(o.key)}
                >
                  {o.label}
                  <span className="when">{sortMode === o.key ? '✓' : ''}</span>
                </button>
              ))}
            </>
          ) : null}
        </Popover>
      ) : null}
    </div>
  );
}
