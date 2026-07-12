import { useEffect, useRef, useState } from 'react';
import { useData } from '../AppData.jsx';
import Popover from './Popover.jsx';
import { IconCaret } from './Icons.jsx';
import { colorHex, colorLabel, COLOR_NAMES } from '../lib/colors.js';

// The valid parent candidates for a project: never Inbox (never a child or a
// parent), never the project itself, and never one of its own descendants,
// so a project can never become its own ancestor. excludeId is null for a
// brand-new project, which has no id yet and so no descendants either;
// exported so an edit-parent flow can reuse the same guard later.
export function validParentCandidates(projects, excludeId) {
  const byParent = new Map();
  for (const p of projects) {
    const key = p.parentProjectId || null;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(p);
  }
  const descendantIds = new Set();
  function collect(id) {
    for (const child of byParent.get(id) || []) {
      if (!descendantIds.has(child.id)) {
        descendantIds.add(child.id);
        collect(child.id);
      }
    }
  }
  if (excludeId) collect(excludeId);
  return projects.filter((p) => !p.isInbox && p.id !== excludeId && !descendantIds.has(p.id));
}

// The Add/Edit Project dialog: Name, Description, Color, and Parent project,
// each a labeled field rather than a bare chip. No Workspace, Access,
// favorites, or Layout picker; every new project defaults to view: "list".
// See docs/roadmap.md (Phase 2.7, styling refreshed Phase 2.8).
//
// `project` is null for Add (the default), or an existing project for Edit,
// so the sidebar's Edit action opens this same panel instead of the old
// inline rename input. `initialParentId` seeds Add's Parent project field
// (used by "Add project above/below", which fixes the parent to the
// reference project's own parent); ignored in Edit mode, which reads the
// project's real parentProjectId instead.
export default function AddProjectModal({ project = null, initialParentId = null, onClose, onSaved }) {
  const { store, projects, bump } = useData();
  const isEdit = Boolean(project);
  const [name, setName] = useState(project?.name || '');
  const [description, setDescription] = useState(project?.description || '');
  const [color, setColor] = useState(project?.color || COLOR_NAMES[0]);
  const [parentId, setParentId] = useState(isEdit ? project.parentProjectId || null : initialParentId);
  const [colorOpen, setColorOpen] = useState(false);
  const [parentOpen, setParentOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const nameRef = useRef(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const candidates = validParentCandidates(projects, project?.id || null);
  const parentProject = candidates.find((p) => p.id === parentId) || null;
  const canSave = name.trim().length > 0 && !saving;

  async function save() {
    if (!canSave) return;
    setSaving(true);
    if (isEdit) {
      await store.updateProject(project.id, { name: name.trim(), description, color, parentProjectId: parentId });
      await bump();
      onSaved?.({ ...project, name: name.trim(), description, color, parentProjectId: parentId });
    } else {
      const siblingCount = projects.filter((p) => (p.parentProjectId || null) === parentId).length;
      const created = await store.createProject({
        name: name.trim(),
        description,
        color,
        parentProjectId: parentId,
        order: siblingCount
      });
      await bump();
      onSaved?.(created);
    }
    onClose();
  }

  function onNameKey(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      save();
    }
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-label={isEdit ? 'Edit project' : 'Add project'}>
        <div className="modal-body">
          <h2 className="settings-title">{isEdit ? 'Edit project' : 'Add project'}</h2>

          <div className="form-field">
            <label className="form-label" htmlFor="add-project-name">
              Name
            </label>
            <input
              id="add-project-name"
              ref={nameRef}
              className="form-input"
              placeholder="Project name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={onNameKey}
            />
          </div>

          <div className="form-field">
            <label className="form-label" htmlFor="add-project-desc">
              Description
            </label>
            <textarea
              id="add-project-desc"
              className="form-input"
              rows={2}
              placeholder="Add a description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="form-field">
            <span className="form-label">Color</span>
            <div className="popover-wrap form-select-wrap">
              <button type="button" className="select-control" onClick={() => setColorOpen((v) => !v)}>
                <span className="project-dot" style={{ background: colorHex(color) }} />
                {colorLabel(color)}
                <IconCaret className="caret" width={14} height={14} />
              </button>
              {colorOpen ? (
                <Popover onClose={() => setColorOpen(false)}>
                  <div className="color-grid">
                    {COLOR_NAMES.map((c) => (
                      <button
                        key={c}
                        type="button"
                        className={`color-swatch ${c === color ? 'selected' : ''}`}
                        style={{ background: colorHex(c) }}
                        title={colorLabel(c)}
                        onClick={() => {
                          setColor(c);
                          setColorOpen(false);
                        }}
                      />
                    ))}
                  </div>
                </Popover>
              ) : null}
            </div>
          </div>

          <div className="form-field">
            <span className="form-label">Parent project</span>
            <div className="popover-wrap form-select-wrap">
              <button type="button" className="select-control" onClick={() => setParentOpen((v) => !v)}>
                {parentProject ? (
                  <>
                    <span className="project-dot" style={{ background: colorHex(parentProject.color) }} />
                    {parentProject.name}
                  </>
                ) : (
                  'No Parent'
                )}
                <IconCaret className="caret" width={14} height={14} />
              </button>
              {parentOpen ? (
                <Popover onClose={() => setParentOpen(false)}>
                  <button
                    type="button"
                    className="popover-item"
                    onClick={() => {
                      setParentId(null);
                      setParentOpen(false);
                    }}
                  >
                    No Parent
                    <span className="when">{parentId === null ? '✓' : ''}</span>
                  </button>
                  {candidates.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className="popover-item"
                      onClick={() => {
                        setParentId(p.id);
                        setParentOpen(false);
                      }}
                    >
                      <span className="project-dot" style={{ background: colorHex(p.color) }} />
                      {p.name}
                      <span className="when">{parentId === p.id ? '✓' : ''}</span>
                    </button>
                  ))}
                </Popover>
              ) : null}
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <div className="right">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" disabled={!canSave} onClick={save}>
              {isEdit ? 'Save' : 'Add project'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
