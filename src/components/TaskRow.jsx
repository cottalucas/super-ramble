import { useState } from 'react';
import PriorityPicker, { priorityClass } from './PriorityPicker.jsx';
import DatePicker from './DatePicker.jsx';
import { IconCheck, IconCaret, IconPlus, IconHash, IconDots, IconX, IconInbox } from './Icons.jsx';
import Popover from './Popover.jsx';
import ConfirmDialog from './ConfirmDialog.jsx';
import { dueMeta, isOverdue } from '../lib/date.js';
import { colorHex } from '../lib/colors.js';

// The project identity shown next to a task, shared by both `.meta-project`
// (collapsed) and `.task-edit-footer-project` (expanded) below, and by
// `SuperRambleModal.jsx`'s own three-way header for its "existing project"
// state: one small render, not three copies of the same branch. Real
// Todoist's own sidebar convention (docs/design-system.md's "Sidebar project
// list" section): the colored "#" hash for a real project, matching
// `.project-hash`'s own styling, never a filled dot here; Inbox gets its own
// icon instead of any colored mark at all, the same way `Sidebar.jsx`'s own
// Inbox nav row uses `IconInbox` plus the word "Inbox," not a hash. Exported
// so `SuperRambleModal.jsx` can reuse it directly rather than re-deriving the
// same two-way branch a second time.
export function ProjectLabel({ project }) {
  return project.isInbox ? (
    <>
      <IconInbox width={14} height={14} className="icon" />
      {project.name}
    </>
  ) : (
    <>
      <span className="project-hash" style={{ color: colorHex(project.color) }}>
        #
      </span>
      {project.name}
    </>
  );
}

// A section-ref picker for the editable preview only: a small list of the
// response's own local sections (by ref, not a real Firestore id) plus "No
// section". No existing picker fits this shape (ProjectPicker's own section
// list is Firestore-backed, store.listSections against a real projectId,
// which does not exist yet for a tree still being previewed), so this is a
// small new one, matching PriorityPicker's/DatePicker's exact chip+Popover
// shape rather than inventing a different one. Local to this file, the only
// caller, the same "local to the one file that uses it" convention
// ProjectNode (Sidebar.jsx) and TreePreview (SuperRambleModal.jsx) already
// follow.
function SectionRefPicker({ sections, value, onChange }) {
  const [open, setOpen] = useState(false);
  const active = sections.find((s) => s.ref === value);
  return (
    <div className="popover-wrap">
      <button
        type="button"
        className={`chip ${value ? 'active' : ''}`}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <IconHash width={14} height={14} className="icon" />
        {active ? active.name : 'No section'}
      </button>
      {open ? (
        <Popover onClose={() => setOpen(false)}>
          <button
            type="button"
            className="popover-item"
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
          >
            No section
          </button>
          {sections.map((s) => (
            <button
              key={s.ref}
              type="button"
              className="popover-item"
              onClick={() => {
                onChange(s.ref);
                setOpen(false);
              }}
            >
              {s.name}
            </button>
          ))}
        </Popover>
      ) : null}
    </div>
  );
}

// One task and its nested sub-tasks. The checkbox completes. Priority sets the
// ring color. The meta line carries due time in green, label chips, and the
// project name when shown outside its project. Clicking the content opens the
// task detail view. `variant` picks the outer wrapper style only: "flat" is
// the full-width divider row (Inbox, Project), "card" is the bordered box
// (Today, Upcoming). Every behavior below is identical between variants.
// `draggable` enables native HTML5 drag on this row, forwarded recursively to
// every sub-task too, so a sub-task can be dragged and dropped onto any other
// row the same TaskList (or drag owner) renders, at any depth. `dragId` and
// `dragOverId` are the drag owner's raw state, threaded down so each nested
// row can compute its own `dragOver` the same way its parent's caller did.
//
// No fixed nesting depth limit, matching the same "no fixed depth limit"
// already granted to nested projects: the "Add sub-task" button and drag-nest
// are both available at any depth, so a sub-task can have its own sub-task,
// and so on. Visual indent still caps at the `sub2` (56px) step past depth 1;
// depth keeps incrementing in the data, the extra levels just do not indent
// further right.
//
// Every drag-over always reports a zone up to the caller through
// `onDragOverRow(task, zone)`: pointer in the row's top half is "before",
// bottom half is "nest". A caller that only wants the older single-outcome
// behavior (Today, task detail) can simply ignore the second argument, same
// as it always has. `dragPreview`, when set by a position-aware caller
// (ProjectView's List layout), is `{ kind: 'before' | 'nest', taskId }` and
// is drawn as a `.drop-before`/`.drop-nest` class on this row itself
// (box-shadow/background, see src/styles.css), never a mounted or
// unmounted sibling element. An inserted placeholder div was tried first
// and reverted: it shifted every row below it by its own height as
// dragPreview changed, which could move the row still under the cursor
// out from under it, firing a spurious dragleave that cleared the preview
// and made a drop silently no-op or land on the wrong row. See
// docs/design-system.md and docs/resolution-log.md, 2026-07-10.
//
// `readOnly` (default false, so every existing caller is unaffected) renders
// an inert row for a not-yet-written preview: the checkbox is disabled, the
// content is not clickable, and the Add-sub-task/"..." actions are hidden
// entirely rather than left clickable-but-dead, since a dead button is
// exactly what docs/design-system.md's anti-pattern checklist forbids.
// Recurses down to every nested sub-task automatically.
//
// `editable` (default false) is the newer, less-inert sibling of `readOnly`,
// for a preview a user can still adjust before Confirm: the checkbox stays
// disabled (nothing here is a real task yet).
//
// Collapsed vs. expanded, matching real Todoist's own Text Scan preview
// (docs/resolution-log.md, 2026-07-17): an editable row starts collapsed,
// content as a plain `.task-content` div and the same read-only `.task-meta`/
// `.task-desc` blocks every other row already renders (the due chip and a
// description snippet, if either is set), no input, no controls. Clicking
// the row's main area (not the remove "x", moved into the footer below)
// calls `onToggleExpand(task)`, which the caller (`TreePreview`,
// `SuperRambleModal.jsx`) uses to drive a single `expandedTaskId`: only one
// row across the whole tree is ever expanded at once, an accordion, matching
// the reference screenshots.
//
// The expanded row swaps to a bordered `.task-edit-card` (the same thin
// `1px solid var(--ds-line)` / `--ds-canvas` in-place-expansion convention
// `.inline-add`/`.comment-add-box` already use, docs/design-system.md's
// "Inline add-task" section, not a new visual language): the content input
// (`onContentChange`); a description textarea (`onDescriptionChange`, a
// real, already-existing task field this app edits everywhere else,
// `TaskDetail.jsx`'s `.detail-desc`, just never populated by Structure's own
// contract, the same "no model behind it" reasoning a plain Add-task form's
// own description field already has); `.task-edit-controls`, now just
// priority and due date (`onPriorityChange`, `onDueChange`, reusing
// `DatePicker.jsx` but reading only its `date` back out as a plain ISO
// string, so it flows straight through `toDue()` unchanged at Confirm-time);
// and `.task-edit-footer` (2026-07-17, round 2, replacing a single "Done"
// button, matching the Todoist reference's own bottom row): left side is
// `SectionRefPicker` (root tasks only, depth 0, since a sub-task has no
// `sectionRef` of its own in this contract) when there's one to show, or a
// plain static `project` label otherwise (a sub-task, or no sections at
// all), so the left side is never empty; right side is a remove "x"
// (`onRemove(task)`, the same handler the row's own top-right action used
// to call, hidden there while this card is open so only one remove control
// shows at a time) and a checkmark collapsing back (`onToggleExpand(null)`).
// No Cancel: every field here already writes to `edited` state directly on
// every change, there is no local draft a Cancel would actually revert, so a
// second button would look like it discards changes without doing so; the
// footer's "x" is a real remove, matching what an X means in Todoist's own
// add/edit-task flow, not a fake no-op cancel.
// See SuperRambleModal.jsx, the only caller of either mode.
export default function TaskRow({
  task,
  depth = 0,
  childrenOf,
  showProject = false,
  project,
  // 'dot' (default) is this app's general convention (docs/design-system.md's
  // "Sidebar project list" section): a colored filled circle everywhere a
  // task shows its project, matching real Todoist's own task-row treatment.
  // 'hash' is a scoped exception, only ever passed by SuperRambleModal.jsx's
  // own preview rows, matching real Todoist's Text Scan preview instead: see
  // `ProjectLabel` above.
  projectIndicator = 'dot',
  onComplete,
  onAddSub,
  onDelete,
  onOpen,
  variant = 'flat',
  draggable = false,
  dragOver = false,
  dragId = null,
  dragOverId = null,
  dragPreview = null,
  onDragStartRow,
  onDragOverRow,
  onDropRow,
  onDragEndRow,
  onDragLeaveRow,
  readOnly = false,
  editable = false,
  onRemove,
  onContentChange,
  onDescriptionChange,
  sections = [],
  onPriorityChange,
  onDueChange,
  onSectionChange,
  expandedTaskId = null,
  onToggleExpand
}) {
  const kids = childrenOf.get(task.id) || [];
  const [expanded, setExpanded] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const depthCls = depth === 1 ? 'sub' : depth >= 2 ? 'sub2' : '';
  const meta = dueMeta(task.due);
  const overdue = isOverdue(task.due);
  const inert = readOnly || editable;
  // `expandedTaskId` is the raw id/ref, threaded down unchanged through
  // recursion (never a pre-resolved boolean): each row compares it against
  // its own task.id, the only way a single accordion value stays correct at
  // every depth, not just the row that first received it.
  const editOpen = editable && expandedTaskId === task.id;
  const clickableToExpand = editable && expandedTaskId !== task.id;
  // Drawn as box-shadow/background states on the row itself, not a
  // mounted/unmounted sibling element: inserting or removing a DOM node as
  // dragPreview changes shifts every row below it by that node's height,
  // which can move the row the cursor is still physically over out from
  // under it, firing a spurious dragleave that clears the preview and can
  // make a drop land on the wrong row or not commit at all. See
  // docs/resolution-log.md, 2026-07-10 (the drag-and-drop reliability fix).
  const dropBefore = dragPreview?.kind === 'before' && dragPreview.taskId === task.id;
  const dropNest = dragPreview?.kind === 'nest' && dragPreview.taskId === task.id;

  return (
    <>
      <div
        className={`task-row ${depthCls} ${variant === 'card' ? 'card' : ''} ${task.completed ? 'done' : ''} ${
          dragOver ? 'drag-over' : ''
        } ${dropBefore ? 'drop-before' : ''} ${dropNest ? 'drop-nest' : ''}`}
        draggable={draggable}
        onDragStart={(e) => {
          e.dataTransfer.setData('text/plain', task.id);
          onDragStartRow?.(task);
        }}
        onDragOver={(e) => {
          if (!draggable) return;
          e.preventDefault();
          e.stopPropagation();
          const rect = e.currentTarget.getBoundingClientRect();
          const inBottomHalf = e.clientY >= rect.top + rect.height / 2;
          onDragOverRow?.(task, inBottomHalf ? 'nest' : 'before');
        }}
        onDragLeave={() => onDragLeaveRow?.(task)}
        onDrop={(e) => {
          if (!draggable) return;
          e.preventDefault();
          e.stopPropagation();
          onDropRow?.(task);
        }}
        onDragEnd={() => onDragEndRow?.()}
      >
        <button
          type="button"
          className={`checkbox ${priorityClass(task.priority)}`}
          aria-label="Complete task"
          onClick={inert ? undefined : () => onComplete(task)}
          disabled={inert}
        >
          <IconCheck className="check" />
        </button>

        <div
          className="task-main"
          onClick={
            inert
              ? clickableToExpand
                ? () => onToggleExpand(task)
                : undefined
              : () => onOpen(task)
          }
          style={{ cursor: !inert || clickableToExpand ? 'pointer' : 'default' }}
        >
          {editOpen ? (
            <div className="task-edit-card" onClick={(e) => e.stopPropagation()}>
              <input
                type="text"
                className="task-content-input"
                value={task.content}
                onChange={(e) => onContentChange(task, e.target.value)}
              />
              <textarea
                className="task-edit-description"
                placeholder="Description"
                rows={2}
                value={task.description || ''}
                onChange={(e) => onDescriptionChange(task, e.target.value)}
              />
              <div className="task-edit-controls">
                <PriorityPicker value={task.priority} onChange={(p) => onPriorityChange(task, p)} />
                <DatePicker value={task.due} onChange={(next) => onDueChange(task, next?.date ?? null)} />
              </div>
              <div className="task-edit-footer">
                <div className="task-edit-footer-left">
                  {depth === 0 && sections.length ? (
                    <SectionRefPicker sections={sections} value={task.sectionId} onChange={(ref) => onSectionChange(task, ref)} />
                  ) : project ? (
                    <span className="task-edit-footer-project">
                      {projectIndicator === 'hash' ? (
                        <ProjectLabel project={project} />
                      ) : (
                        <>
                          <span className="project-dot" style={{ background: colorHex(project.color), width: 8, height: 8 }} />
                          {project.name}
                        </>
                      )}
                    </span>
                  ) : null}
                </div>
                <div className="task-edit-footer-actions">
                  {/* Bigger than a normal 14-15px icon-btn glyph elsewhere in
                      this app, reported directly against real Todoist's own
                      Text Scan reference: its remove/done controls read
                      larger, this row's own most frequent actions. Scoped to
                      this one pair, not a change to .icon-btn's own default
                      sizing, which every other caller in the app still
                      relies on unchanged. */}
                  <button type="button" className="icon-btn" title="Remove" onClick={() => onRemove(task)}>
                    <IconX width={18} height={18} className="icon" />
                  </button>
                  <button
                    type="button"
                    className="icon-btn task-edit-footer-done"
                    title="Done"
                    onClick={() => onToggleExpand(null)}
                  >
                    <IconCheck width={18} height={18} className="icon" />
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="task-content">{task.content}</div>
          )}
          {!editOpen && task.description ? (
            <div className={`task-desc ${variant === 'card' ? 'task-desc-clamp' : ''}`}>{task.description}</div>
          ) : null}

          {!editOpen && (meta || (task.labels && task.labels.length) || showProject) && (
            <div className="task-meta">
              {meta ? <span className={`meta-due ${overdue ? 'overdue' : ''}`}>{meta}</span> : null}
              {(task.labels || []).map((l) => (
                <span key={l} className="label-chip">
                  @{l}
                </span>
              ))}
              {showProject && project ? (
                <span className="meta-project">
                  {projectIndicator === 'hash' ? (
                    <ProjectLabel project={project} />
                  ) : (
                    <>
                      <span className="project-dot" style={{ background: colorHex(project.color), width: 8, height: 8 }} />
                      {project.name}
                    </>
                  )}
                </span>
              ) : null}
            </div>
          )}

          {kids.length ? (
            <button
              type="button"
              className="task-toggle"
              onClick={(e) => {
                e.stopPropagation();
                setExpanded((v) => !v);
              }}
            >
              <IconCaret width={12} height={12} style={{ transform: expanded ? 'none' : 'rotate(-90deg)' }} />
              {kids.length} sub-task{kids.length > 1 ? 's' : ''}
            </button>
          ) : null}
        </div>

        {readOnly ? null : editable ? (
          // Hidden while this row's own edit card is open: the footer above
          // already carries a remove "x", the same handler, so only one
          // remove control ever shows for a given row at once.
          editOpen ? null : (
            <div className="task-row-actions">
              {/* Bigger than the 14px default, matching the expanded card's
                  own remove control above: reported directly against real
                  Todoist's Text Scan reference. This branch only ever
                  renders for an editable (Super Ramble preview) row, never
                  the normal Add-sub-task/"..." pair below, so this stays
                  scoped to the one context it was reported against. */}
              <button type="button" className="icon-btn" title="Remove" onClick={() => onRemove(task)}>
                <IconX width={17} height={17} className="icon" />
              </button>
            </div>
          )
        ) : (
          <div className="task-row-actions">
            <button type="button" className="icon-btn" title="Add sub-task" onClick={() => onAddSub(task)}>
              <IconPlus width={15} height={15} className="icon" />
            </button>
            <div className="popover-wrap">
              <button type="button" className="icon-btn" title="More" onClick={() => setMenuOpen((v) => !v)}>
                <IconDots width={15} height={15} className="icon" />
              </button>
              {menuOpen ? (
                <Popover onClose={() => setMenuOpen(false)}>
                  <button
                    type="button"
                    className="popover-item"
                    onClick={() => {
                      setMenuOpen(false);
                      setConfirmDelete(true);
                    }}
                  >
                    Delete
                  </button>
                </Popover>
              ) : null}
            </div>
          </div>
        )}
      </div>

      {confirmDelete ? (
        <ConfirmDialog
          title={`Delete "${task.content}"?`}
          message={kids.length ? `This removes ${kids.length} sub-task${kids.length > 1 ? 's' : ''} too.` : undefined}
          confirmLabel="Delete task"
          onConfirm={() => {
            setConfirmDelete(false);
            onDelete(task);
          }}
          onCancel={() => setConfirmDelete(false)}
        />
      ) : null}

      {expanded
        ? kids.map((k) => (
            // Sub-tasks always render flat regardless of this row's variant,
            // card density stays scoped to root rows, but drag state
            // threads down unchanged, so a sub-task is just as draggable
            // and droppable-onto as any root row.
            <TaskRow
              key={k.id}
              task={k}
              depth={depth + 1}
              childrenOf={childrenOf}
              showProject={showProject}
              project={project}
              projectIndicator={projectIndicator}
              onComplete={onComplete}
              onAddSub={onAddSub}
              onDelete={onDelete}
              onOpen={onOpen}
              draggable={draggable}
              dragOver={dragOverId === k.id && dragId !== k.id}
              dragId={dragId}
              dragOverId={dragOverId}
              dragPreview={dragPreview}
              onDragStartRow={onDragStartRow}
              onDragOverRow={onDragOverRow}
              onDragLeaveRow={onDragLeaveRow}
              onDropRow={onDropRow}
              onDragEndRow={onDragEndRow}
              readOnly={readOnly}
              editable={editable}
              onRemove={onRemove}
              onContentChange={onContentChange}
              onDescriptionChange={onDescriptionChange}
              sections={sections}
              onPriorityChange={onPriorityChange}
              onDueChange={onDueChange}
              onSectionChange={onSectionChange}
              expandedTaskId={expandedTaskId}
              onToggleExpand={onToggleExpand}
            />
          ))
        : null}
    </>
  );
}

// Build a parentId -> children[] map from a flat task list, top-level under null.
export function buildChildrenMap(tasks) {
  const map = new Map();
  for (const t of tasks) {
    const key = t.parentId || null;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(t);
  }
  for (const arr of map.values()) arr.sort((a, b) => a.order - b.order);
  return map;
}
