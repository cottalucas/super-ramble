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
export default function Board({ columns, onReorder, onCrossColumnDrop, onAddTask, projectById, actions, sectionOps }) {
  const [dragId, setDragId] = useState(null);
  const [dragFromCol, setDragFromCol] = useState(null);
  const [dragOverTaskId, setDragOverTaskId] = useState(null);
  const [dragOverColKey, setDragOverColKey] = useState(null);

  function endDrag() {
    setDragId(null);
    setDragFromCol(null);
    setDragOverTaskId(null);
    setDragOverColKey(null);
  }

  async function dropOnTask(col, targetTask) {
    const fromId = dragId;
    const fromCol = dragFromCol;
    endDrag();
    if (!fromId || fromId === targetTask.id) return;

    if (fromCol === col.key) {
      const ids = col.tasks.map((t) => t.id);
      const from = ids.indexOf(fromId);
      const to = ids.indexOf(targetTask.id);
      if (from === -1 || to === -1) return;
      const reordered = [...col.tasks];
      const [moved] = reordered.splice(from, 1);
      reordered.splice(to, 0, moved);
      await onReorder(col.key, reordered);
      return;
    }
    await onCrossColumnDrop(fromId, fromCol, col.key);
  }

  async function dropOnColumn(col) {
    const fromId = dragId;
    const fromCol = dragFromCol;
    endDrag();
    if (!fromId || fromCol === col.key) return;
    await onCrossColumnDrop(fromId, fromCol, col.key);
  }

  return (
    <div className="board">
      {columns.map((col) => (
        <div
          key={String(col.key)}
          className={`board-col ${dragId && dragOverColKey === col.key ? 'drag-over-col' : ''}`}
          onDragOver={(e) => {
            if (!dragId) return;
            e.preventDefault();
            setDragOverColKey(col.key);
          }}
          onDragLeave={() => setDragOverColKey((cur) => (cur === col.key ? null : cur))}
          onDrop={(e) => {
            if (!dragId) return;
            e.preventDefault();
            dropOnColumn(col);
          }}
        >
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
                dragOver={dragOverTaskId === t.id && dragId !== t.id}
                onDragStartRow={(task) => {
                  setDragId(task.id);
                  setDragFromCol(col.key);
                }}
                onDragOverRow={(task) => setDragOverTaskId(task.id)}
                onDragLeaveRow={(task) => setDragOverTaskId((cur) => (cur === task.id ? null : cur))}
                onDropRow={(task) => dropOnTask(col, task)}
                onDragEndRow={endDrag}
              />
            ))}
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
