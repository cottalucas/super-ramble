import { useEffect, useRef, useState } from 'react';
import { useData } from '../AppData.jsx';
import TaskList from '../components/TaskList.jsx';
import Board from '../components/Board.jsx';
import { buildChildrenMap } from '../components/TaskRow.jsx';
import { IconPlus, IconCaret, IconInbox } from '../components/Icons.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import LayoutControl from '../components/LayoutControl.jsx';
import InlineTaskAdd from '../components/InlineTaskAdd.jsx';
import SectionForm from '../components/SectionForm.jsx';
import SectionOptionsMenu from '../components/SectionOptionsMenu.jsx';
import { colorHex } from '../lib/colors.js';
import { sortTasks } from '../lib/sort.js';
import { groupTasks } from '../lib/group.js';
import { rescheduleDue } from '../lib/date.js';

const DESC_DEBOUNCE_MS = 500;

// Editable description under the project title. Module scope so it keeps a
// stable identity across renders; a component defined inside ProjectView would
// remount on every keystroke and drop focus.
function ProjectDescription({ project, onSave }) {
  const [value, setValue] = useState(project.description || '');
  const timer = useRef(null);

  useEffect(() => {
    setValue(project.description || '');
  }, [project.id]);

  function onChange(v) {
    setValue(v);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => onSave(v), DESC_DEBOUNCE_MS);
  }

  return (
    <textarea
      className="modal-desc project-desc"
      placeholder="Add a description"
      rows={1}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

// Project view, also used for Inbox. Title, optional collapsible sections,
// tasks, and sub-tasks nested under their parent in List layout, or a Board
// of cards in Board layout, the one global preference from AppData. Group by
// (None, Priority, Date, Date added) replaces the project's real Sections
// with virtual groups while active; None restores Sections unchanged, since
// grouping never writes to a section. See docs/roadmap.md (Phase 2.8) and
// docs/resolution-log.md.
export default function ProjectView({ view }) {
  const { store, tasks, projectById, openAdd, openTaskDetail, completeTask, deleteTask, bump, revision, layout, setLayoutPref } =
    useData();
  const project = projectById(view.projectId);

  const [sections, setSections] = useState([]);
  const [addingSection, setAddingSection] = useState(Boolean(view.addSection));
  const [editingSection, setEditingSection] = useState(null);
  const [deleteSectionTarget, setDeleteSectionTarget] = useState(null);
  const [sortMode, setSortMode] = useState('manual');
  const [groupMode, setGroupMode] = useState('none');
  const [dragId, setDragId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);
  // Which "+ Add task" line, if any, is expanded inline right now: null,
  // 'no-section', or a section id. Only one at a time, closed by its own
  // Cancel/Escape/successful add. See docs/design-system.md.
  const [addingTaskFor, setAddingTaskFor] = useState(null);
  // Lifted here, not left inside each TaskList, so a drag started in one
  // section (or the no-section list, or a virtual group) is still live when
  // the drop lands in another: reparenting a task works across all of them,
  // not just within the one list it started in. See docs/resolution-log.md.
  const sharedDrag = { dragId, setDragId, dragOverId, setDragOverId };

  useEffect(() => {
    if (!view.projectId) return;
    store.listSections(view.projectId).then(setSections);
  }, [store, view.projectId, revision]);

  useEffect(() => {
    setAddingSection(Boolean(view.addSection));
  }, [view.addSection, view.projectId]);

  if (!project) {
    return (
      <div className="content-inner">
        <div className="empty">
          <h3>Project not found</h3>
          <p>Pick a project from the sidebar.</p>
        </div>
      </div>
    );
  }

  const projectTasks = tasks.filter((t) => t.projectId === project.id);
  const rootTasks = projectTasks.filter((t) => !t.parentId);
  const childrenOf = buildChildrenMap(projectTasks);
  const noSectionRoots = sortTasks(
    rootTasks.filter((t) => !t.sectionId),
    sortMode
  );
  const virtualGroups = groupMode !== 'none' ? groupTasks(rootTasks, groupMode, sortMode) : null;

  async function addSection({ name, description }) {
    await store.createSection({ projectId: project.id, name, description, order: sections.length });
    await bump();
    setAddingSection(false);
  }

  async function editSection(s, { name, description }) {
    await store.updateSection(s.id, { name, description });
    await bump();
    setEditingSection(null);
  }

  async function moveSection(s, targetProjectId) {
    await store.moveSectionToProject(s.id, targetProjectId);
    setEditingSection((cur) => (cur && cur.id === s.id ? null : cur));
    await bump();
  }

  async function toggleCollapse(s) {
    await store.updateSection(s.id, { collapsed: !s.collapsed });
    await bump();
  }

  async function confirmDeleteSection() {
    const s = deleteSectionTarget;
    setDeleteSectionTarget(null);
    await store.deleteSection(s.id);
    await bump();
  }

  async function handleReorderColumn(colKey, reordered) {
    await Promise.all(reordered.map((t, i) => (t.order === i ? null : store.updateTask(t.id, { order: i }))));
    await bump();
  }

  // What a cross-column drop writes depends entirely on what the columns
  // represent. Group None: sections, so a drop writes sectionId, the one
  // cross-section case this phase allows. Priority or Date: the grouped
  // field itself. Date added is not a drag-writable field, a system
  // timestamp, so a cross-column drop there is a no-op, the same reasoning
  // Today's Overdue column already uses for "not a settable target."
  async function handleCrossColumnDrop(taskId, fromColKey, toColKey) {
    if (groupMode === 'none') {
      await store.updateTask(taskId, { sectionId: toColKey });
      await bump();
      return;
    }
    if (groupMode === 'priority') {
      await store.updateTask(taskId, { priority: toColKey });
      await bump();
      return;
    }
    if (groupMode === 'date') {
      const t = tasks.find((x) => x.id === taskId);
      if (!t) return;
      await store.updateTask(taskId, { due: toColKey ? rescheduleDue(t.due, toColKey) : null });
      await bump();
    }
    // groupMode === 'createdAt': no-op.
  }

  const boardColumns =
    groupMode === 'none'
      ? [
          { key: null, label: 'No section', tasks: noSectionRoots },
          ...sections.map((s) => ({
            key: s.id,
            label: s.name,
            section: s,
            tasks: sortTasks(
              rootTasks.filter((t) => t.sectionId === s.id),
              sortMode
            )
          }))
        ]
      : virtualGroups;

  const boardActions = {
    completeTask,
    deleteTask,
    onOpen: (task) => openTaskDetail(task.id),
    onAddSub: (parent) => openAdd({ projectId: parent.projectId, parentId: parent.id, sectionId: parent.sectionId || null })
  };

  // Section editing (Edit, Move to, Add section) is a real-Sections concept,
  // so Board only gets it in Group None, the same gate the columns
  // themselves already use. A virtual-group Board (Priority, Date, Date
  // added columns) has no sections to operate on.
  const sectionOps =
    groupMode === 'none'
      ? {
          editingSectionId: editingSection?.id || null,
          addingSection,
          onStartAdd: () => setAddingSection(true),
          onCancelAdd: () => setAddingSection(false),
          onSubmitAdd: addSection,
          onStartEdit: (s) => setEditingSection(s),
          onCancelEdit: () => setEditingSection(null),
          onSubmitEdit: editSection,
          onMoveTo: moveSection,
          onDeleteRequest: (s) => setDeleteSectionTarget(s)
        }
      : null;

  return (
    <div className="content-inner" style={layout === 'board' ? { maxWidth: 'none', paddingRight: 24 } : undefined}>
      <div className="view-header">
        {project.isInbox ? (
          <IconInbox className="icon" width={20} height={20} style={{ color: 'var(--ds-ink-soft)' }} />
        ) : (
          <span className="project-dot" style={{ background: colorHex(project.color), width: 12, height: 12 }} />
        )}
        <h1 className="view-title">{project.name}</h1>
        <span className="spacer" />
        <LayoutControl
          layout={layout}
          onLayoutChange={setLayoutPref}
          groupMode={groupMode}
          onGroupChange={setGroupMode}
          sortMode={sortMode}
          onSortChange={setSortMode}
        />
      </div>

      {!project.isInbox ? (
        <ProjectDescription
          project={project}
          onSave={async (description) => {
            await store.updateProject(project.id, { description });
            await bump();
          }}
        />
      ) : null}

      {layout === 'board' ? (
        <>
          <Board
            columns={boardColumns}
            onReorder={handleReorderColumn}
            onCrossColumnDrop={handleCrossColumnDrop}
            onAddTask={groupMode === 'none' ? (col) => openAdd({ projectId: project.id, sectionId: col.key }) : undefined}
            projectById={projectById}
            actions={boardActions}
            sectionOps={sectionOps}
          />
          {groupMode !== 'none' ? (
            <button type="button" className="add-line" onClick={() => openAdd({ projectId: project.id })}>
              <span className="plus">
                <IconPlus width={14} height={14} />
              </span>
              Add task
            </button>
          ) : null}
        </>
      ) : groupMode !== 'none' ? (
        <>
          {virtualGroups.map((g) => (
            <div key={String(g.key)} className="section">
              <div className="section-head-row">
                <div className="section-head">
                  {g.label}
                  <span className="count">{g.tasks.length || ''}</span>
                </div>
              </div>
              <TaskList
                roots={g.tasks}
                childrenOf={childrenOf}
                variant="flat"
                draggable={sortMode === 'manual'}
                sharedDrag={sharedDrag}
              />
            </div>
          ))}
          <button type="button" className="add-line" onClick={() => openAdd({ projectId: project.id })}>
            <span className="plus">
              <IconPlus width={14} height={14} />
            </span>
            Add task
          </button>
        </>
      ) : (
        <>
          <TaskList
            roots={noSectionRoots}
            childrenOf={childrenOf}
            variant="flat"
            draggable={sortMode === 'manual'}
            sharedDrag={sharedDrag}
            positionAware
            destSectionId={null}
          />

          {addingTaskFor === 'no-section' ? (
            <InlineTaskAdd
              defaults={{ projectId: project.id }}
              onCancel={() => setAddingTaskFor(null)}
              onDone={() => setAddingTaskFor(null)}
            />
          ) : (
            <button type="button" className="add-line" onClick={() => setAddingTaskFor('no-section')}>
              <span className="plus">
                <IconPlus width={14} height={14} />
              </span>
              Add task
            </button>
          )}

          {sections.map((s) => {
            const roots = sortTasks(
              rootTasks.filter((t) => t.sectionId === s.id),
              sortMode
            );
            return (
              <div key={s.id} className="section">
                {editingSection?.id === s.id ? (
                  <SectionForm
                    initial={{ name: s.name, description: s.description }}
                    submitLabel="Save"
                    onSubmit={(vals) => editSection(s, vals)}
                    onCancel={() => setEditingSection(null)}
                  />
                ) : (
                  <div className="section-head-row">
                    <button type="button" className={`section-head ${s.collapsed ? 'collapsed' : ''}`} onClick={() => toggleCollapse(s)}>
                      <IconCaret className="caret" width={16} height={16} />
                      {s.name}
                      <span className="count">{roots.length || ''}</span>
                    </button>
                    <SectionOptionsMenu
                      section={s}
                      onEdit={setEditingSection}
                      onMoveTo={moveSection}
                      onDelete={setDeleteSectionTarget}
                    />
                  </div>
                )}
                {!s.collapsed ? (
                  <>
                    {s.description && editingSection?.id !== s.id ? (
                      <p className="section-description">{s.description}</p>
                    ) : null}
                    <TaskList
                      roots={roots}
                      childrenOf={childrenOf}
                      variant="flat"
                      draggable={sortMode === 'manual'}
                      sharedDrag={sharedDrag}
                      positionAware
                      destSectionId={s.id}
                    />
                    {addingTaskFor === s.id ? (
                      <InlineTaskAdd
                        defaults={{ projectId: project.id, sectionId: s.id }}
                        onCancel={() => setAddingTaskFor(null)}
                        onDone={() => setAddingTaskFor(null)}
                      />
                    ) : (
                      <button type="button" className="add-line" onClick={() => setAddingTaskFor(s.id)}>
                        <span className="plus">
                          <IconPlus width={14} height={14} />
                        </span>
                        Add task
                      </button>
                    )}
                  </>
                ) : null}
              </div>
            );
          })}

          {addingSection ? (
            <div style={{ marginTop: 18 }}>
              <SectionForm submitLabel="Add section" onSubmit={addSection} onCancel={() => setAddingSection(false)} />
            </div>
          ) : (
            <button type="button" className="add-line" style={{ marginTop: 12, opacity: 0.8 }} onClick={() => setAddingSection(true)}>
              <span className="plus">
                <IconPlus width={14} height={14} />
              </span>
              Add section
            </button>
          )}
        </>
      )}

      {deleteSectionTarget ? (
        <ConfirmDialog
          title={`Delete "${deleteSectionTarget.name}"?`}
          message="Its tasks stay in the project without a section."
          confirmLabel="Delete section"
          onConfirm={confirmDeleteSection}
          onCancel={() => setDeleteSectionTarget(null)}
        />
      ) : null}
    </div>
  );
}
