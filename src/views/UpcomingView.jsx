import { useEffect, useRef, useState } from 'react';
import { useData } from '../AppData.jsx';
import TaskRow from '../components/TaskRow.jsx';
import TaskList from '../components/TaskList.jsx';
import Board from '../components/Board.jsx';
import LayoutControl from '../components/LayoutControl.jsx';
import InlineTaskAdd from '../components/InlineTaskAdd.jsx';
import { IconPlus, IconCaret } from '../components/Icons.jsx';
import {
  addDays,
  toISODate,
  formatDayHeader,
  formatMonthYear,
  relativeLabel,
  DOW_SHORT,
  isOverdue,
  isToday,
  rescheduleDue
} from '../lib/date.js';
import { groupTasks } from '../lib/group.js';

const WINDOW = 7; // one week
const emptyChildren = new Map();

function bySortOrder(a, b) {
  return a.order - b.order;
}

// Upcoming. Both layouts read one seven-day window, today plus the next six
// days, paged by weekOffset: List renders it as a vertical agenda (Overdue
// first, anchored to today so it only shows when weekOffset is 0, then one
// section per day), Board renders the identical days as columns. Neither
// layout snaps to a Monday-start calendar week; the window always starts on
// today at weekOffset 0, and shifts by seven days per page either way, since
// both layouts read the same `days` array. See docs/roadmap.md (Phase 2.8)
// and docs/resolution-log.md.
export default function UpcomingView() {
  const { store, tasks, bump, openAdd, openTaskDetail, completeTask, deleteTask, inboxId, projectById, layout, setLayoutPref } =
    useData();
  const [weekOffset, setWeekOffset] = useState(0);
  const [groupMode, setGroupMode] = useState('none');
  const [sortMode, setSortMode] = useState('manual');
  const [dragTaskId, setDragTaskId] = useState(null);
  // `{ sectionKey, taskId }`, `taskId` null meaning "append at the end of
  // this day's list." Same shape and same reasoning as Board.jsx's own
  // dragPreview: drawn as `.drop-before` on the hovered row (TaskRow's own
  // dragPreview prop) or `.drop-placeholder` in a fixed end-zone past the
  // last row, never a mounted/unmounted placeholder among real rows. This
  // day/agenda section never nests a row under another, so a row's bottom
  // half means "insert after this row," never "nest." Replaces the old
  // whole-section `.drag-over-section` dashed outline. See
  // docs/resolution-log.md, 2026-07-10 and 2026-07-15.
  const [dragPreview, setDragPreview] = useState(null);
  // Which day's "+ Add task" line, if any, is expanded inline right now: null
  // or an ISO date string. See docs/design-system.md.
  const [addingTaskFor, setAddingTaskFor] = useState(null);
  const boardScroller = useRef(null);

  const today = new Date();
  const windowStart = addDays(today, weekOffset * 7);
  const days = Array.from({ length: WINDOW }, (_, i) => addDays(windowStart, i));

  // Paging (weekOffset changing) should always show the new week's first
  // day, not wherever the horizontal scroll happened to be left.
  useEffect(() => {
    boardScroller.current?.scrollTo({ left: 0 });
  }, [weekOffset, layout]);

  const overdueTasks =
    layout === 'list' && weekOffset === 0 ? tasks.filter((t) => isOverdue(t.due) && !isToday(t.due)).sort(bySortOrder) : [];

  const listsByKey = new Map();
  listsByKey.set('overdue', overdueTasks);
  for (const d of days) {
    const iso = toISODate(d);
    // On the week that contains today, a past day already inside this window
    // (e.g. Friday when today is Saturday) would otherwise show its tasks
    // twice: once here and once in the Overdue rollup above. Exclude those.
    // Board's window always starts at today, so this never applies there.
    let dayTasks = tasks.filter((t) => t.due?.date === iso);
    if (layout === 'list' && weekOffset === 0) {
      dayTasks = dayTasks.filter((t) => !(isOverdue(t.due) && !isToday(t.due)));
    }
    listsByKey.set(iso, dayTasks.sort(bySortOrder));
  }

  // Group by, when not None, replaces the whole day/Overdue structure with
  // virtual groups computed over every task currently in the visible window,
  // the same pattern ProjectView uses for Inbox and Project. Gathered from
  // listsByKey so it always matches whatever window (List's week or Board's
  // paged seven days) is currently showing.
  const windowRaw = [...listsByKey.values()].flat();
  const virtualGroups = groupMode !== 'none' ? groupTasks(windowRaw, groupMode, sortMode) : null;

  function sectionKeyFor(t) {
    if (isOverdue(t.due) && !isToday(t.due)) return 'overdue';
    return t.due?.date || null;
  }

  async function handleReorderColumn(colKey, reordered) {
    await Promise.all(reordered.map((t, i) => (t.order === i ? null : store.updateTask(t.id, { order: i }))));
    await bump();
  }

  // Grouped cross-column drop: same semantics ProjectView and TodayView use
  // for Priority/Date/Date added. Reschedule-by-day is Group None's own
  // mechanism (handleDrop below); grouping replaces it with this instead.
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

  function handleRowDragOver(sectionKey, task, zone) {
    const list = listsByKey.get(sectionKey) || [];
    if (zone === 'nest') {
      const idx = list.findIndex((t) => t.id === task.id);
      const next = idx === -1 ? null : list[idx + 1];
      setDragPreview({ sectionKey, taskId: next ? next.id : null });
      return;
    }
    setDragPreview({ sectionKey, taskId: task.id });
  }

  function handleRowDragLeave(sectionKey, task) {
    setDragPreview((cur) => (cur && cur.sectionKey === sectionKey && cur.taskId === task.id ? null : cur));
  }

  // Hover never writes; only a drop reads the last dragPreview, the same
  // rule TaskList.jsx's own handlePositionDrop and Board.jsx's own
  // handleDrop already follow. Covers both a drop on a specific row and a
  // drop past the last row or into an empty day (dragPreview.taskId null),
  // replacing the old handleDrop/handleDropOnSection split.
  async function handleDrop() {
    const fromId = dragTaskId;
    const preview = dragPreview;
    setDragTaskId(null);
    setDragPreview(null);
    if (!fromId || !preview || fromId === preview.taskId) return;

    const fromTask = tasks.find((t) => t.id === fromId);
    if (!fromTask) return;

    const fromKey = sectionKeyFor(fromTask);
    const targetKey = preview.sectionKey;

    if (fromKey === targetKey) {
      // Same section: reorder that list only, same mechanics as phase 2.6.
      // Sort by has to be Manual for a reorder to mean anything, the same
      // rule TaskList already applies elsewhere; cross-day reschedule below
      // stays available regardless, since it writes a different field.
      if (sortMode !== 'manual') return;
      const list = listsByKey.get(targetKey) || [];
      const ids = list.map((t) => t.id);
      const from = ids.indexOf(fromId);
      if (from === -1) return;
      const reordered = [...list];
      const [moved] = reordered.splice(from, 1);
      const targetIndex = preview.taskId ? reordered.findIndex((t) => t.id === preview.taskId) : reordered.length;
      reordered.splice(targetIndex === -1 ? reordered.length : targetIndex, 0, moved);
      await Promise.all(
        reordered.map((t, i) => (t.order === i ? null : store.updateTask(t.id, { order: i })))
      );
      await bump();
      return;
    }

    if (targetKey === 'overdue') {
      // Overdue is a rollup of many dates, not one day; dropping a dated task
      // onto it is not a defined reschedule target. Only same-section
      // reordering (handled above) applies to Overdue.
      return;
    }

    // Cross-day: reschedule, keeping time of day if the task had one.
    await store.updateTask(fromId, { due: rescheduleDue(fromTask.due, targetKey) });
    await bump();
  }

  function renderRow(t, sectionKey) {
    return (
      <TaskRow
        key={t.id}
        task={t}
        depth={0}
        childrenOf={emptyChildren}
        showProject
        project={projectById(t.projectId)}
        onComplete={completeTask}
        onDelete={deleteTask}
        onOpen={(task) => openTaskDetail(task.id)}
        onAddSub={(parent) =>
          openAdd({ projectId: parent.projectId, parentId: parent.id, sectionId: parent.sectionId || null })
        }
        variant="card"
        draggable
        dragPreview={dragPreview?.sectionKey === sectionKey && dragPreview.taskId === t.id ? { kind: 'before', taskId: t.id } : null}
        onDragStartRow={(task) => setDragTaskId(task.id)}
        onDragOverRow={(task, zone) => handleRowDragOver(sectionKey, task, zone)}
        onDragLeaveRow={(task) => handleRowDragLeave(sectionKey, task)}
        onDropRow={handleDrop}
        onDragEndRow={() => {
          setDragTaskId(null);
          setDragPreview(null);
        }}
      />
    );
  }

  function daySection(d, extraCls = '') {
    const iso = toISODate(d);
    const dayTasks = listsByKey.get(iso) || [];
    return (
      <div
        key={iso}
        className={extraCls}
        onDragOver={(e) => {
          if (!dragTaskId) return;
          e.preventDefault();
          setDragPreview({ sectionKey: iso, taskId: null });
        }}
        onDragLeave={() => setDragPreview((cur) => (cur && cur.sectionKey === iso && cur.taskId === null ? null : cur))}
        onDrop={(e) => {
          if (!dragTaskId) return;
          e.preventDefault();
          handleDrop();
        }}
      >
        {layout === 'board' ? (
          <div className="day-col-head">
            {DOW_SHORT[d.getDay()]} {formatDayHeader(d)} <span className="soft">{relativeLabel(iso)}</span>
          </div>
        ) : (
          <div className="date-header">
            {DOW_SHORT[d.getDay()]} {formatDayHeader(d)} <span className="soft">{relativeLabel(iso)}</span>
          </div>
        )}
        {dayTasks.length ? <div className="task-list">{dayTasks.map((t) => renderRow(t, iso))}</div> : null}
        <div className="task-list-end-zone">
          {dragPreview?.sectionKey === iso && dragPreview.taskId === null ? <div className="drop-placeholder" /> : null}
        </div>
        {addingTaskFor === iso ? (
          <InlineTaskAdd
            defaults={{
              projectId: inboxId,
              due: { date: iso, datetime: null, string: relativeLabel(iso), isRecurring: false }
            }}
            onCancel={() => setAddingTaskFor(null)}
            onDone={() => setAddingTaskFor(null)}
          />
        ) : (
          <button type="button" className="add-line" onClick={() => setAddingTaskFor(iso)}>
            <span className="plus">
              <IconPlus width={14} height={14} />
            </span>
            Add task
          </button>
        )}
      </div>
    );
  }

  const todayIso = toISODate(today);

  return (
    <div className="content-inner" style={layout === 'board' ? { maxWidth: 'none', paddingRight: 24 } : undefined}>
      <div className="view-header">
        <h1 className="view-title">Upcoming</h1>
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

      {/* Second row, always present in both layouts, so the Today navigation
          never shifts the title row above it. The "‹ Today ›" nav is the
          same weekOffset state and the same control in both layouts. List
          additionally gets a month/year label on the left, matching the
          reference's three-row header; Board's header shape is unchanged,
          just the nav, since it has no day-strip to label a month for. */}
      <div className="week-strip">
        {layout === 'list' ? (
          <div className="upcoming-month-label">
            {formatMonthYear(days[0])}
            <IconCaret className="caret" width={16} height={16} />
          </div>
        ) : null}
        <div className="week-strip-nav">
          <button type="button" className="icon-btn" title="Previous week" onClick={() => setWeekOffset((w) => w - 1)}>
            ‹
          </button>
          <button type="button" className="btn btn-quiet" onClick={() => setWeekOffset(0)}>
            Today
          </button>
          <button type="button" className="icon-btn" title="Next week" onClick={() => setWeekOffset((w) => w + 1)}>
            ›
          </button>
        </div>
      </div>

      {/* Third row, List only: one pill per day in the same `days` window,
          today's shown as a solid filled block, not tinted text. */}
      {layout === 'list' ? (
        <div className="week-strip-days">
          {days.map((d) => {
            const iso = toISODate(d);
            return (
              <div key={iso} className={`week-strip-day ${iso === todayIso ? 'current' : ''}`}>
                {DOW_SHORT[d.getDay()]} {d.getDate()}
              </div>
            );
          })}
        </div>
      ) : null}

      {groupMode !== 'none' ? (
        layout === 'board' ? (
          <Board
            columns={virtualGroups.map((g) => ({ ...g, showProject: true }))}
            onReorder={handleReorderColumn}
            onCrossColumnDrop={handleCrossColumnDropGrouped}
            projectById={projectById}
            actions={{
              completeTask,
              deleteTask,
              onOpen: (task) => openTaskDetail(task.id),
              onAddSub: (parent) =>
                openAdd({ projectId: parent.projectId, parentId: parent.id, sectionId: parent.sectionId || null })
            }}
          />
        ) : (
          virtualGroups.map((g) => (
            <div key={String(g.key)} className="section">
              <div className="section-head-row">
                <div className="section-head">
                  {g.label}
                  <span className="count">{g.tasks.length || ''}</span>
                </div>
              </div>
              <TaskList roots={g.tasks} childrenOf={emptyChildren} showProject variant="card" draggable={sortMode === 'manual'} />
            </div>
          ))
        )
      ) : layout === 'list' ? (
        <>
          {overdueTasks.length ? (
            <div className="agenda-section section-overdue">
              <div className="date-header">Overdue</div>
              <div className="task-list">{overdueTasks.map((t) => renderRow(t, 'overdue'))}</div>
            </div>
          ) : null}

          {days.map((d) => daySection(d, 'agenda-section'))}
        </>
      ) : (
        <div className="upcoming-board-scroll" ref={boardScroller}>
          {days.map((d) => daySection(d, 'day-col'))}
        </div>
      )}
    </div>
  );
}
