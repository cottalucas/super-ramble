import { useState } from 'react';
import { priorityClass } from './PriorityPicker.jsx';
import { IconCheck, IconCaret, IconPlus, IconHash, IconDots } from './Icons.jsx';
import Popover from './Popover.jsx';
import ConfirmDialog from './ConfirmDialog.jsx';
import { dueMeta, isOverdue } from '../lib/date.js';
import { colorHex } from '../lib/colors.js';

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
// Recurses down to every nested sub-task automatically. See
// SuperRambleModal.jsx for the one caller.
export default function TaskRow({
  task,
  depth = 0,
  childrenOf,
  showProject = false,
  project,
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
  readOnly = false
}) {
  const kids = childrenOf.get(task.id) || [];
  const [expanded, setExpanded] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const depthCls = depth === 1 ? 'sub' : depth >= 2 ? 'sub2' : '';
  const meta = dueMeta(task.due);
  const overdue = isOverdue(task.due);
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
          onClick={readOnly ? undefined : () => onComplete(task)}
          disabled={readOnly}
        >
          <IconCheck className="check" />
        </button>

        <div
          className="task-main"
          onClick={readOnly ? undefined : () => onOpen(task)}
          style={{ cursor: readOnly ? 'default' : 'pointer' }}
        >
          <div className="task-content">{task.content}</div>
          {task.description ? <div className="task-desc">{task.description}</div> : null}

          {(meta || (task.labels && task.labels.length) || showProject) && (
            <div className="task-meta">
              {meta ? <span className={`meta-due ${overdue ? 'overdue' : ''}`}>{meta}</span> : null}
              {(task.labels || []).map((l) => (
                <span key={l} className="label-chip">
                  @{l}
                </span>
              ))}
              {showProject && project ? (
                <span className="meta-project">
                  <span className="project-dot" style={{ background: colorHex(project.color), width: 8, height: 8 }} />
                  {project.name}
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

        {readOnly ? null : (
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
