import { useState } from 'react';
import TaskRow from './TaskRow.jsx';
import { useData } from '../AppData.jsx';

// A task is a descendant of another when walking down childrenOf from the
// ancestor eventually reaches it. Used to block a drag that would make a
// task its own descendant's child, a cycle.
function isDescendant(candidateId, ancestorId, childrenOf) {
  for (const child of childrenOf.get(ancestorId) || []) {
    if (child.id === candidateId) return true;
    if (isDescendant(candidateId, child.id, childrenOf)) return true;
  }
  return false;
}

// Renders a set of root tasks with their nested sub-tasks. Wires every row to
// the shared complete/delete/add-sub/open actions, so there is one write path.
//
// `roots` is always exactly one list: siblings that already share a parent, a
// section (or no-section group), or, on Today, an Overdue-vs-Today grouping.
// Drag state defaults to local (one list at a time, the phase 2.6 shape), but
// a caller rendering several TaskList instances that should interoperate
// (ProjectView's sections, Today's groups) can pass `sharedDrag`, the same
// `{ dragId, setDragId, dragOverId, setDragOverId }` shape lifted to that
// caller, so a drag started in one instance is still live when the drop
// lands in another. Without it, a drop from a different instance has no
// matching `dragId` and does nothing, same as before. `extraTasks` is a
// separate, optional lookup list for the same cross-instance case when
// `childrenOf` alone cannot find the dragged or dropped-on task (Today
// passes an empty `childrenOf` on purpose, since it never nests sub-tasks).
//
// `positionAware` (ProjectView's List layout only; Today, Upcoming, and task
// detail never pass it, so they keep the exact behavior below unchanged) opts
// into a richer model: `TaskRow` reports whether the pointer is over the top
// or bottom half of the hovered row, previewed as an indented placeholder line
// instead of a row highlight. Top half (or anywhere on a row too deep to
// nest under, depth >= 2) means "insert as a sibling immediately before this
// row"; bottom half of a shallower row means "nest as its new last sub-task".
// A drop past the last row, or into an empty list, always means "append as a
// sibling at the end of this exact list" (`destSectionId` names which list
// that is, since an empty `roots` cannot say so on its own). Every case
// resolves the destination list by filtering `childrenOf`'s full task set for
// matching `parentId`+`sectionId`, so a sibling-insert across sections writes
// both fields on the moved task, and a same-list drop is just the special case
// where the destination happens to equal the origin. This subsumes the older
// true-sibling-reorder-versus-reparent split below, which stays as the
// fallback for callers that do not opt in.
//
// A drop on a true sibling (found in the exact list `fromTask` belongs to,
// not just a `parentId` that happens to match) reorders, gated by
// `draggable`, true only when Sort is Manual, since it writes `order`. Any
// other drop reparents instead, writing `parentId`, never gated by Sort,
// since it is a different field entirely, the same distinction Upcoming's
// reorder-versus-reschedule already draws. Checking true membership rather
// than a bare `parentId` match matters for root tasks specifically: two
// root tasks both have `parentId: null`, but if they come from different
// sections they are not siblings, so dropping one onto the other has to
// reparent it, not silently fail a reorder against the wrong list.
export default function TaskList({
  roots,
  childrenOf,
  showProject = false,
  variant = 'flat',
  draggable = false,
  sharedDrag,
  extraTasks = [],
  positionAware = false,
  destSectionId = null
}) {
  const { store, bump, patchTasks, completeTask, deleteTask, openAdd, openTaskDetail, projectById } = useData();
  const [localDragId, setLocalDragId] = useState(null);
  const [localDragOverId, setLocalDragOverId] = useState(null);
  const [dragPreview, setDragPreview] = useState(null);
  const dragId = sharedDrag ? sharedDrag.dragId : localDragId;
  const setDragId = sharedDrag ? sharedDrag.setDragId : setLocalDragId;
  const dragOverId = sharedDrag ? sharedDrag.dragOverId : localDragOverId;
  const setDragOverId = sharedDrag ? sharedDrag.setDragOverId : setLocalDragOverId;

  // allTasks is the drag lookup, kept separate from childrenOf's rendering
  // role: a caller like Today passes an empty childrenOf on purpose (it
  // never shows nested sub-tasks, every due-date bucket is flat), but its
  // sibling TaskList instances (Overdue vs Today, or across virtual groups)
  // still need to find each other's tasks by id to reparent across them.
  // extraTasks carries that lookup without adding anything to childrenOf,
  // so visual nesting is unaffected.
  const allTasks = new Map();
  for (const t of roots) allTasks.set(t.id, t);
  for (const arr of childrenOf.values()) {
    for (const t of arr) allTasks.set(t.id, t);
  }
  for (const t of extraTasks) allTasks.set(t.id, t);

  function wouldCycle(fromId, newParentId) {
    if (!newParentId) return false;
    if (newParentId === fromId) return true;
    return isDescendant(newParentId, fromId, childrenOf);
  }

  // Destination list for a root-level target (destParentId null) is that
  // section's root tasks, matched by parentId and sectionId together, since
  // sectionId is what distinguishes sections. For a sub-task target,
  // sectionId is not consulted anywhere else in the app, so only parentId
  // (true sibling membership) matters.
  function destinationList(destParentId, destSecId, excludeId) {
    return [...allTasks.values()]
      .filter((t) => {
        if (t.id === excludeId) return false;
        if ((t.parentId || null) !== destParentId) return false;
        return destParentId === null ? (t.sectionId || null) === destSecId : true;
      })
      .sort((a, b) => a.order - b.order);
  }

  // Builds the same patch this writes to the store, once, and applies it
  // to local state immediately after the write lands: bump()'s own full
  // reload() (a real Firestore round trip against the Firestore adapter)
  // still runs right after for eventual consistency, but the row doesn't
  // sit at its old position waiting for that round trip to finish. See
  // docs/resolution-log.md, 2026-07-10 (the drag-and-drop reliability fix).
  async function writeOrderedList(list, destParentId, destSecId, movedTaskId) {
    const patchesById = new Map();
    list.forEach((t, i) => {
      const patch = {};
      if (t.order !== i) patch.order = i;
      if (t.id === movedTaskId) {
        if ((t.parentId || null) !== destParentId) patch.parentId = destParentId;
        if ((t.sectionId || null) !== destSecId) patch.sectionId = destSecId;
      }
      if (Object.keys(patch).length) patchesById.set(t.id, patch);
    });
    await Promise.all([...patchesById.entries()].map(([id, patch]) => store.updateTask(id, patch)));
    patchTasks((prev) => prev.map((t) => (patchesById.has(t.id) ? { ...t, ...patchesById.get(t.id) } : t)));
  }

  // Position-aware drop: resolves purely from dragId + the last dragPreview
  // reported by whichever row (or the list's own end zone) was last hovered.
  // A hover never writes; only this function does, on an actual drop.
  async function handlePositionDrop() {
    const fromId = dragId;
    const preview = dragPreview;
    setDragId(null);
    setDragPreview(null);
    if (!draggable || !fromId || !preview) return;
    const fromTask = allTasks.get(fromId);
    if (!fromTask) return;

    if (preview.kind === 'end') {
      const destParentId = null;
      const destSecId = preview.sectionId ?? null;
      const list = destinationList(destParentId, destSecId, fromTask.id);
      list.push(fromTask);
      await writeOrderedList(list, destParentId, destSecId, fromTask.id);
      await bump();
      return;
    }

    const targetTask = allTasks.get(preview.taskId);
    if (!targetTask || targetTask.id === fromTask.id) return;

    if (preview.kind === 'nest') {
      if (wouldCycle(fromTask.id, targetTask.id)) return;
      const children = destinationList(targetTask.id, null, fromTask.id);
      const nestPatch = { parentId: targetTask.id, sectionId: targetTask.sectionId || null, order: children.length };
      await store.updateTask(fromTask.id, nestPatch);
      patchTasks((prev) => prev.map((t) => (t.id === fromTask.id ? { ...t, ...nestPatch } : t)));
      await bump();
      return;
    }

    // preview.kind === 'before'
    const destParentId = targetTask.parentId || null;
    const destSecId = targetTask.sectionId || null;
    if (wouldCycle(fromTask.id, destParentId)) return;
    const list = destinationList(destParentId, destSecId, fromTask.id);
    const targetIndex = list.findIndex((t) => t.id === targetTask.id);
    list.splice(targetIndex === -1 ? list.length : targetIndex, 0, fromTask);
    await writeOrderedList(list, destParentId, destSecId, fromTask.id);
    await bump();
  }

  async function handleDrop(target) {
    if (positionAware) return handlePositionDrop();

    const fromId = dragId;
    setDragId(null);
    setDragOverId(null);
    if (!fromId || fromId === target.id) return;

    const fromTask = allTasks.get(fromId);
    const targetTask = allTasks.get(target.id);
    if (!fromTask || !targetTask) return;

    // The list fromTask actually belongs to: its real siblings if it has a
    // parent, or this instance's own roots if it is a root task. Only a
    // target found in that exact list is a true sibling.
    const siblingsOfFrom = fromTask.parentId ? childrenOf.get(fromTask.parentId) || [] : roots;
    const isTrueSibling =
      siblingsOfFrom.some((t) => t.id === fromTask.id) && siblingsOfFrom.some((t) => t.id === targetTask.id);

    if (isTrueSibling) {
      // Same list: reorder it only, same mechanics as phase 2.6.
      if (!draggable) return;
      const ids = siblingsOfFrom.map((t) => t.id);
      const from = ids.indexOf(fromId);
      const to = ids.indexOf(target.id);
      if (from === -1 || to === -1) return;
      const reordered = [...siblingsOfFrom];
      const [moved] = reordered.splice(from, 1);
      reordered.splice(to, 0, moved);
      const orderById = new Map(reordered.map((t, i) => [t.id, i]));
      await Promise.all(
        reordered.map((t, i) => (t.order === i ? null : store.updateTask(t.id, { order: i })))
      );
      patchTasks((prev) => prev.map((t) => (orderById.has(t.id) ? { ...t, order: orderById.get(t.id) } : t)));
      await bump();
      return;
    }

    // Not a true sibling: dropped "into" targetTask, reparent under it.
    // Refuse if that would make targetTask its own descendant's child, a
    // cycle.
    if (targetTask.id === fromTask.id || isDescendant(targetTask.id, fromTask.id, childrenOf)) return;
    const newSiblings = childrenOf.get(targetTask.id) || [];
    const reparentPatch = { parentId: targetTask.id, order: newSiblings.length };
    await store.updateTask(fromId, reparentPatch);
    patchTasks((prev) => prev.map((t) => (t.id === fromId ? { ...t, ...reparentPatch } : t)));
    await bump();
  }

  function handleRowDragOver(task, zone) {
    if (positionAware) {
      setDragPreview({ kind: zone, taskId: task.id });
      return;
    }
    setDragOverId(task.id);
  }

  function handleRowDragLeave(task) {
    if (positionAware) {
      setDragPreview((cur) => (cur && cur.kind !== 'end' && cur.taskId === task.id ? null : cur));
      return;
    }
    setDragOverId((cur) => (cur === task.id ? null : cur));
  }

  const showEndPlaceholder = positionAware && dragPreview?.kind === 'end' && dragPreview.sectionId === destSectionId;

  return (
    <div className="task-list">
      {roots.map((t) => (
        <TaskRow
          key={t.id}
          task={t}
          depth={0}
          childrenOf={childrenOf}
          showProject={showProject}
          project={projectById(t.projectId)}
          onComplete={completeTask}
          onDelete={deleteTask}
          onOpen={(task) => openTaskDetail(task.id)}
          onAddSub={(parent) =>
            openAdd({ projectId: parent.projectId, parentId: parent.id, sectionId: parent.sectionId || null })
          }
          variant={variant}
          draggable={positionAware ? draggable : true}
          dragOver={!positionAware && dragOverId === t.id && dragId !== t.id}
          dragId={dragId}
          dragOverId={dragOverId}
          dragPreview={positionAware ? dragPreview : null}
          onDragStartRow={(task) => setDragId(task.id)}
          onDragOverRow={handleRowDragOver}
          onDragLeaveRow={handleRowDragLeave}
          onDropRow={handleDrop}
          onDragEndRow={() => {
            setDragId(null);
            setDragOverId(null);
            setDragPreview(null);
          }}
        />
      ))}

      {positionAware ? (
        <div
          className="task-list-end-zone"
          onDragOver={(e) => {
            if (!draggable) return;
            e.preventDefault();
            setDragPreview({ kind: 'end', sectionId: destSectionId });
          }}
          onDragLeave={() => setDragPreview((cur) => (cur && cur.kind === 'end' ? null : cur))}
          onDrop={(e) => {
            if (!draggable) return;
            e.preventDefault();
            handlePositionDrop();
          }}
        >
          {showEndPlaceholder ? <div className="drop-placeholder" /> : null}
        </div>
      ) : null}
    </div>
  );
}
