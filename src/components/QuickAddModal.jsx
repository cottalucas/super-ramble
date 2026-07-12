import TaskAddForm from './TaskAddForm.jsx';

// Centered overlay chrome around the shared add-task form. Used for
// "Add sub-task" (the icon on a task row), the sidebar's global Add task
// (reopened 2026-07-10, was a popover; see docs/design-system.md's "Inline
// add-task" section), and other callers that have no row to expand into;
// every in-list "+ Add task" line uses InlineTaskAdd instead.
export default function QuickAddModal({ onClose, defaults = {} }) {
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-label="Add task">
        <TaskAddForm defaults={defaults} onCancel={onClose} onDone={onClose} />
      </div>
    </div>
  );
}
