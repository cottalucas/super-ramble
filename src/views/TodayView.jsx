import { useState } from 'react';
import { useData } from '../AppData.jsx';
import TaskList from '../components/TaskList.jsx';
import Board from '../components/Board.jsx';
import LayoutControl from '../components/LayoutControl.jsx';
import { IconToday } from '../components/Icons.jsx';
import { isToday, isOverdue, formatDayHeader, todayISO, rescheduleDue } from '../lib/date.js';
import { sortTasks } from '../lib/sort.js';
import { groupTasks } from '../lib/group.js';

const empty = new Map();

// Today: tasks due today under a "30 Jun . Today" header, with an overdue
// rollover section above when there is any. Group by (None, Priority, Date,
// Date added) and Sort by live in the same Display popover Inbox and
// Project use. Group None keeps the fixed Overdue/Today split; any other
// Group replaces it with virtual groups computed over every relevant task
// (overdue plus due today), the same pattern ProjectView uses. Board layout
// is a fixed two-column Overdue/Today board when Group is None, or one
// column per virtual group otherwise. See docs/roadmap.md (Phase 2.8).
export default function TodayView() {
  const { tasks, store, bump, completeTask, deleteTask, openTaskDetail, openAdd, projectById, layout, setLayoutPref } = useData();
  const [groupMode, setGroupMode] = useState('none');
  const [sortMode, setSortMode] = useState('manual');
  const [dragId, setDragId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);
  // Shared across every TaskList instance below (Overdue/Today, or each
  // virtual group), the same reason ProjectView lifts it: a drop from a
  // different group needs a live dragId to reparent against.
  const sharedDrag = { dragId, setDragId, dragOverId, setDragOverId };

  const overdueRaw = tasks.filter((t) => isOverdue(t.due) && !isToday(t.due));
  const todayRaw = tasks.filter((t) => isToday(t.due));
  const overdue = sortTasks(overdueRaw, sortMode);
  const today = sortTasks(todayRaw, sortMode);
  // Today passes an empty childrenOf to every TaskList (it never nests
  // sub-tasks, every bucket is flat), so TaskList's own lookup can't find a
  // task dragged from a different group on its own; this fills that gap
  // without touching childrenOf or the flat rendering it controls.
  const allTodayTasks = [...overdueRaw, ...todayRaw];

  const virtualGroups = groupMode !== 'none' ? groupTasks(allTodayTasks, groupMode, sortMode) : null;

  const todayHeader = formatDayHeader(new Date());
  const nothing = overdue.length === 0 && today.length === 0;

  async function handleReorderColumn(colKey, reordered) {
    await Promise.all(reordered.map((t, i) => (t.order === i ? null : store.updateTask(t.id, { order: i }))));
    await bump();
  }

  // Group None: dropping on Today reschedules an overdue task forward, the
  // same rule phase 2.7 already applies in Upcoming. Overdue is a rollup of
  // many dates, not one settable date, so dropping there is a no-op.
  async function handleCrossColumnDropFixed(taskId, fromColKey, toColKey) {
    if (toColKey !== 'today') return;
    const t = tasks.find((x) => x.id === taskId);
    if (!t) return;
    await store.updateTask(taskId, { due: rescheduleDue(t.due, todayISO()) });
    await bump();
  }

  // Grouped: same semantics ProjectView uses for Priority/Date/Date added.
  async function handleCrossColumnDropGrouped(taskId, fromColKey, toColKey) {
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
    // groupMode === 'createdAt': no-op, not a drag-writable field.
  }

  const boardActions = {
    completeTask,
    deleteTask,
    onOpen: (task) => openTaskDetail(task.id),
    onAddSub: (parent) => openAdd({ projectId: parent.projectId, parentId: parent.id, sectionId: parent.sectionId || null })
  };

  return (
    <div className="content-inner" style={layout === 'board' ? { maxWidth: 'none', paddingRight: 24 } : undefined}>
      <div className="view-header">
        <h1 className="view-title">Today</h1>
        <span className="spacer" />
        {nothing ? null : (
          <LayoutControl
            layout={layout}
            onLayoutChange={setLayoutPref}
            groupMode={groupMode}
            onGroupChange={setGroupMode}
            sortMode={sortMode}
            onSortChange={setSortMode}
          />
        )}
      </div>

      {nothing ? (
        <div className="empty">
          <IconToday width={40} height={40} className="icon" />
          <h3>Nothing due today</h3>
          <p>Enjoy the calm, or add a task with the red Add task button.</p>
        </div>
      ) : layout === 'board' ? (
        groupMode === 'none' ? (
          <Board
            columns={[
              { key: 'overdue', label: 'Overdue', tasks: overdue, showProject: true },
              { key: 'today', label: `${todayHeader} . Today`, tasks: today, showProject: true }
            ]}
            onReorder={handleReorderColumn}
            onCrossColumnDrop={handleCrossColumnDropFixed}
            projectById={projectById}
            actions={boardActions}
          />
        ) : (
          <Board
            columns={virtualGroups.map((g) => ({ ...g, showProject: true }))}
            onReorder={handleReorderColumn}
            onCrossColumnDrop={handleCrossColumnDropGrouped}
            projectById={projectById}
            actions={boardActions}
          />
        )
      ) : groupMode === 'none' ? (
        <>
          {overdue.length ? (
            <div className="section-overdue" style={{ marginBottom: 18 }}>
              <div className="date-header">Overdue</div>
              <TaskList roots={overdue} childrenOf={empty} showProject variant="card" draggable sharedDrag={sharedDrag} extraTasks={allTodayTasks} />
            </div>
          ) : null}

          {today.length ? (
            <div>
              <div className="date-header">
                {todayHeader} <span className="soft">. Today</span>
              </div>
              <TaskList roots={today} childrenOf={empty} showProject variant="card" draggable sharedDrag={sharedDrag} extraTasks={allTodayTasks} />
            </div>
          ) : null}
        </>
      ) : (
        <>
          {virtualGroups.map((g) => (
            <div key={String(g.key)} className="section">
              <div className="section-head-row">
                <div className="section-head">
                  {g.label}
                  <span className="count">{g.tasks.length || ''}</span>
                </div>
              </div>
              <TaskList roots={g.tasks} childrenOf={empty} showProject variant="card" draggable={sortMode === 'manual'} sharedDrag={sharedDrag} extraTasks={allTodayTasks} />
            </div>
          ))}
        </>
      )}
    </div>
  );
}
