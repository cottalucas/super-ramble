import { useState } from 'react';
import TaskRow from './TaskRow.jsx';
import SectionForm from './SectionForm.jsx';
import SectionOptionsMenu from './SectionOptionsMenu.jsx';
import { IconPlus } from './Icons.jsx';

const emptyChildren = new Map();

// A generic Board renderer: columns of cards sharing one drag state across
// the whole board, the same shared-state need phase 2.7's cross-day
// reschedule had (TaskList's per-instance isolation is the wrong shape here).
// Board has no opinion on what a column or a cross-column drop means; it
// only reports "this card moved from column A to column B" or "reorder
// column C", and the caller decides what that writes, including a no-op
// (Today's Overdue column, Date-added groups). See docs/roadmap.md
// (Phase 2.8).
//
// `sectionOps`, when passed (Group None only; see ProjectView.jsx), makes a
// column that carries a real `section` (not the "No section" column, and
// never present on a virtual Priority/Date/Date-added column) editable the
// same way List layout's own section head already is: an Edit/Move
// to.../Delete menu, and a trailing "+ Add section" column. Today and
// Upcoming's Board never pass it, so their fixed columns (Overdue/Today, or
// one per day) are unaffected. See docs/resolution-log.md.
//
// Cross-column drop preview: `dragPreview` is `{ colKey, taskId }`, `taskId`
// null meaning "append at the end of this column." Drawn as `.drop-before`
// on the row itself (TaskRow's own dragPreview prop, the same box-shadow
// technique ProjectView's List layout and Sidebar's project tree already
// use) or `.drop-placeholder` in the column's own fixed end-zone (past the
// last card, TaskList.jsx's own pattern), never a mounted/unmounted
// placeholder among the real cards: that shifts every card below it and can
// move the hovered card out from under a stationary cursor, which is
// exactly the bug that made real drops silently no-op. Replaces the old
// whole-column `.drag-over-col` dashed outline, which only reported
// "dragging over this column at all," not where. See docs/resolution-log.md,
// 2026-07-10 (the drag-and-drop reliability fix) and 2026-07-15 (this pass).
// Board never nests a card under another (every TaskRow here renders at
// depth 0 with no children), so the bottom half of a hovered row means
// "insert after this card" (i.e. before its next sibling, or at the end if
// it's the last card), never "nest," unlike TaskRow's other position-aware
// caller (ProjectView's List layout). Hover never writes; only a drop reads
// the last `dragPreview`, the same rule TaskList.jsx's own
// `handlePositionDrop` already follows. Cross-column writes still land at
// column granularity through `onCrossColumnDrop`, unchanged from before this
// pass: several callers (Today's Overdue column, Upcoming's "Date added"
// group) treat a cross-column drop as a deliberate no-op for reasons
// specific to that column, and there is no reliable signal here for
// distinguishing a real write from one of those no-ops, so layering a
// second, row-precise `order` write on top would risk quietly reordering a
// column that was never meant to be a drop target at all. Only a genuine
// same-column reorder (below) is order-precise, exactly as it already was.
export default function Board({ columns, onReorder, onCrossColumnDrop, onAddTask, projectById, actions, sectionOps }) {
  const [dragId, setDragId] = useState(null);
  const [dragFromCol, setDragFromCol] = useState(null);
  const [dragPreview, setDragPreview] = useState(null);

  function endDrag() {
    setDragId(null);
    setDragFromCol(null);
    setDragPreview(null);
  }

  function handleRowDragOver(col, task, zone) {
    if (zone === 'nest') {
      const idx = col.tasks.findIndex((t) => t.id === task.id);
      const next = idx === -1 ? null : col.tasks[idx + 1];
      setDragPreview({ colKey: col.key, taskId: next ? next.id : null });
      return;
    }
    setDragPreview({ colKey: col.key, taskId: task.id });
  }

  function handleRowDragLeave(col, task) {
    setDragPreview((cur) => (cur && cur.colKey === col.key && cur.taskId === task.id ? null : cur));
  }

  async function handleDrop() {
    const fromId = dragId;
    const fromCol = dragFromCol;
    const preview = dragPreview;
    endDrag();
    if (!fromId || !preview) return;
    const col = columns.find((c) => c.key === preview.colKey);
    if (!col || fromId === preview.taskId) return;

    if (fromCol === col.key) {
      const ids = col.tasks.map((t) => t.id);
      const from = ids.indexOf(fromId);
      if (from === -1) return;
      const reordered = [...col.tasks];
      const [moved] = reordered.splice(from, 1);
      const targetIndex = preview.taskId ? reordered.findIndex((t) => t.id === preview.taskId) : reordered.length;
      reordered.splice(targetIndex === -1 ? reordered.length : targetIndex, 0, moved);
      await onReorder(col.key, reordered);
      return;
    }
    await onCrossColumnDrop(fromId, fromCol, col.key);
  }

  return (
    <div className="board">
      {columns.map((col) => (
        <div key={String(col.key)} className="board-col">
          {col.section && sectionOps?.editingSectionId === col.section.id ? (
            <SectionForm
              initial={{ name: col.section.name, description: col.section.description }}
              submitLabel="Save"
              onSubmit={(vals) => sectionOps.onSubmitEdit(col.section, vals)}
              onCancel={sectionOps.onCancelEdit}
            />
          ) : (
            <>
              <div className="board-col-head">
                <span className="board-col-title">
                  {col.label}
                  <span className="count">{col.tasks.length || ''}</span>
                </span>
                {col.section && sectionOps ? (
                  <SectionOptionsMenu
                    section={col.section}
                    onEdit={sectionOps.onStartEdit}
                    onMoveTo={sectionOps.onMoveTo}
                    onDelete={sectionOps.onDeleteRequest}
                  />
                ) : null}
              </div>
              {col.section?.description ? <p className="board-col-desc">{col.section.description}</p> : null}
            </>
          )}
          <div className="board-col-body">
            {col.tasks.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                depth={0}
                childrenOf={emptyChildren}
                showProject={Boolean(col.showProject)}
                project={projectById ? projectById(t.projectId) : null}
                onComplete={actions.completeTask}
                onDelete={actions.deleteTask}
                onOpen={actions.onOpen}
                onAddSub={actions.onAddSub}
                variant="card"
                draggable
                dragPreview={dragPreview?.colKey === col.key && dragPreview.taskId === t.id ? { kind: 'before', taskId: t.id } : null}
                onDragStartRow={(task) => {
                  setDragId(task.id);
                  setDragFromCol(col.key);
                }}
                onDragOverRow={(task, zone) => handleRowDragOver(col, task, zone)}
                onDragLeaveRow={(task) => handleRowDragLeave(col, task)}
                onDropRow={handleDrop}
                onDragEndRow={endDrag}
              />
            ))}
            <div
              className="task-list-end-zone"
              onDragOver={(e) => {
                if (!dragId) return;
                e.preventDefault();
                setDragPreview({ colKey: col.key, taskId: null });
              }}
              onDragLeave={() => setDragPreview((cur) => (cur && cur.colKey === col.key && cur.taskId === null ? null : cur))}
              onDrop={(e) => {
                if (!dragId) return;
                e.preventDefault();
                handleDrop();
              }}
            >
              {dragPreview?.colKey === col.key && dragPreview.taskId === null ? <div className="drop-placeholder" /> : null}
            </div>
          </div>
          {onAddTask ? (
            <button type="button" className="add-line" onClick={() => onAddTask(col)}>
              <span className="plus">
                <IconPlus width={14} height={14} />
              </span>
              Add task
            </button>
          ) : null}
        </div>
      ))}
      {sectionOps ? (
        <div className="board-col board-col-add">
          {sectionOps.addingSection ? (
            <SectionForm submitLabel="Add section" onSubmit={sectionOps.onSubmitAdd} onCancel={sectionOps.onCancelAdd} />
          ) : (
            <button type="button" className="add-line" onClick={sectionOps.onStartAdd}>
              <span className="plus">
                <IconPlus width={14} height={14} />
              </span>
              Add section
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
