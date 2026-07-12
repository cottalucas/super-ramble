import { useEffect, useRef, useState } from 'react';
import { useData } from '../AppData.jsx';
import DatePicker from './DatePicker.jsx';
import PriorityPicker from './PriorityPicker.jsx';
import LabelPicker from './LabelPicker.jsx';
import ProjectPicker from './ProjectPicker.jsx';

// The add-task form: name, description, the chip row (Date, Priority,
// Labels), and a footer (project/section picker left, Cancel/Add task
// right). Writes through store.createProjectTree, the one path every
// Add-task entry point shares, whichever chrome wraps it: QuickAddModal's
// centered overlay, an inline box in place of a "+ Add task" line, or a
// popover anchored to the sidebar's own button. See docs/architecture.md.
export default function TaskAddForm({ defaults = {}, onCancel, onDone, autoFocus = true }) {
  const { store, labels, inboxId, bump, flash } = useData();

  const [content, setContent] = useState('');
  const [description, setDescription] = useState('');
  const [due, setDue] = useState(defaults.due || null);
  const [priority, setPriority] = useState(4);
  const [selLabels, setSelLabels] = useState([]);
  const [projectId, setProjectId] = useState(defaults.projectId || inboxId);
  const [sectionId, setSectionId] = useState(defaults.sectionId || null);
  const [saving, setSaving] = useState(false);
  const nameRef = useRef(null);

  useEffect(() => {
    if (autoFocus) nameRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onCancel();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const canAdd = content.trim().length > 0 && !saving;

  async function add() {
    if (!canAdd) return;
    setSaving(true);
    await store.createProjectTree({
      project: { id: projectId },
      sections: [],
      tasks: [
        {
          ref: 't',
          content: content.trim(),
          description: description.trim(),
          due,
          priority,
          labels: selLabels,
          sectionId: sectionId || null,
          parentId: defaults.parentId || null
        }
      ]
    });
    await bump();
    flash(defaults.parentId ? 'Sub-task added' : 'Task added');
    onDone();
  }

  function onNameKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      add();
    }
  }

  return (
    <>
      <div className="modal-body">
        <input
          ref={nameRef}
          className="modal-name"
          placeholder={defaults.parentId ? 'Sub-task name' : 'Task name'}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={onNameKey}
        />
        <textarea
          className="modal-desc"
          placeholder="Description"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <div className="modal-chips">
          <DatePicker value={due} onChange={setDue} />
          <PriorityPicker value={priority} onChange={setPriority} />
          <LabelPicker
            value={selLabels}
            labels={labels}
            onChange={setSelLabels}
            onCreateLabel={async (name) => {
              await store.createLabel({ name });
              await bump();
            }}
            onDeleteLabel={async (id) => {
              await store.deleteLabel(id);
              await bump();
            }}
          />
        </div>
      </div>

      <div className="modal-footer">
        <ProjectPicker
          projectId={projectId}
          sectionId={sectionId}
          onChange={({ projectId: nextProjectId, sectionId: nextSectionId }) => {
            setProjectId(nextProjectId);
            setSectionId(nextSectionId);
          }}
        />

        <div className="right">
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" disabled={!canAdd} onClick={add}>
            {defaults.parentId ? 'Add sub-task' : 'Add task'}
          </button>
        </div>
      </div>
    </>
  );
}
