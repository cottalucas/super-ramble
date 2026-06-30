import { useEffect, useRef, useState } from 'react';
import { useData } from '../AppData.jsx';
import Popover from './Popover.jsx';
import DatePicker from './DatePicker.jsx';
import PriorityPicker from './PriorityPicker.jsx';
import LabelPicker from './LabelPicker.jsx';
import ReminderPicker from './ReminderPicker.jsx';
import { IconHash, IconInbox } from './Icons.jsx';

// The quick-add modal. Composes the pickers and writes one task through
// store.createProjectTree, the same path the pipeline uses. See docs/architecture.md.
export default function QuickAddModal({ onClose, defaults = {} }) {
  const { store, projects, labels, inboxId, bump, flash, projectById } = useData();

  const [content, setContent] = useState('');
  const [description, setDescription] = useState('');
  const [due, setDue] = useState(defaults.due || null);
  const [priority, setPriority] = useState(4);
  const [selLabels, setSelLabels] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [projectId, setProjectId] = useState(defaults.projectId || inboxId);
  const [sectionId, setSectionId] = useState(defaults.sectionId || null);
  const [sections, setSections] = useState([]);
  const [projOpen, setProjOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const nameRef = useRef(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!projectId) return;
    store.listSections(projectId).then(setSections);
  }, [store, projectId]);

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const project = projectById(projectId);
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
          reminders,
          sectionId: sectionId || null,
          parentId: defaults.parentId || null
        }
      ]
    });
    await bump();
    flash(defaults.parentId ? 'Sub-task added' : 'Task added');
    onClose();
  }

  function onNameKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      add();
    }
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-label="Add task">
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
            />
            <ReminderPicker value={reminders} onChange={setReminders} />
          </div>
        </div>

        <div className="modal-footer">
          <div className="popover-wrap">
            <button type="button" className="chip active" onClick={() => setProjOpen((v) => !v)}>
              {project?.isInbox ? <IconInbox width={14} height={14} className="icon" /> : <IconHash width={14} height={14} className="icon" />}
              {project ? project.name : 'Inbox'}
              {sectionId ? ` / ${sections.find((s) => s.id === sectionId)?.name || ''}` : ''}
            </button>
            {projOpen ? (
              <Popover onClose={() => setProjOpen(false)}>
                {projects.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="popover-item"
                    onClick={() => {
                      setProjectId(p.id);
                      setSectionId(null);
                      setProjOpen(false);
                    }}
                  >
                    {p.isInbox ? <IconInbox width={16} height={16} className="icon" /> : <IconHash width={16} height={16} className="icon" />}
                    {p.name}
                  </button>
                ))}
                {sections.length ? (
                  <>
                    <div className="nav-section-label" style={{ padding: '8px 10px 2px' }}>
                      Sections
                    </div>
                    {sections.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        className="popover-item"
                        onClick={() => {
                          setSectionId(s.id);
                          setProjOpen(false);
                        }}
                      >
                        {s.name}
                        <span className="when">{sectionId === s.id ? '✓' : ''}</span>
                      </button>
                    ))}
                  </>
                ) : null}
              </Popover>
            ) : null}
          </div>

          <div className="right">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" disabled={!canAdd} onClick={add}>
              {defaults.parentId ? 'Add sub-task' : 'Add task'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
