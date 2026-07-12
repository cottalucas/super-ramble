import TaskAddForm from './TaskAddForm.jsx';

// Replaces a "+ Add task" line in place with the shared add-task form: a
// thin-bordered box, no backdrop, no centered floating card. Matches
// Todoist's own inline add. See docs/design-system.md.
export default function InlineTaskAdd({ defaults, onCancel, onDone }) {
  return (
    <div className="inline-add">
      <TaskAddForm defaults={defaults} onCancel={onCancel} onDone={onDone} />
    </div>
  );
}
