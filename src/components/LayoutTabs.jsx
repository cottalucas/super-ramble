import { IconListView, IconBoardView } from './Icons.jsx';

// The List/Board toggle, shared by every view that supports Board. Today and
// Upcoming render just this, no Group by or Sort by; Inbox and Project embed
// it at the top of LayoutControl's popover instead. See docs/roadmap.md
// (Phase 2.8).
export default function LayoutTabs({ layout, onChange }) {
  return (
    <div className="layout-tabs">
      <button type="button" className={layout === 'list' ? 'active' : ''} onClick={() => onChange('list')}>
        <IconListView width={14} height={14} />
        List
      </button>
      <button type="button" className={layout === 'board' ? 'active' : ''} onClick={() => onChange('board')}>
        <IconBoardView width={14} height={14} />
        Board
      </button>
    </div>
  );
}
