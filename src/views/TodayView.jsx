import { useData } from '../AppData.jsx';
import TaskList from '../components/TaskList.jsx';
import { IconToday } from '../components/Icons.jsx';
import { isToday, isOverdue, formatDayHeader } from '../lib/date.js';

// Today: tasks due today under a "30 Jun . Today" header, with an overdue
// rollover section above when there is any. List layout. See docs/roadmap.md.
export default function TodayView() {
  const { tasks } = useData();
  const empty = new Map();

  const overdue = tasks.filter((t) => isOverdue(t.due) && !isToday(t.due));
  const today = tasks.filter((t) => isToday(t.due));

  const todayHeader = formatDayHeader(new Date());
  const nothing = overdue.length === 0 && today.length === 0;

  return (
    <div className="content-inner">
      <div className="view-header">
        <h1 className="view-title">Today</h1>
      </div>

      {nothing ? (
        <div className="empty">
          <IconToday width={40} height={40} className="icon" />
          <h3>Nothing due today</h3>
          <p>Enjoy the calm, or add a task with the red Add task button.</p>
        </div>
      ) : (
        <>
          {overdue.length ? (
            <div className="section-overdue" style={{ marginBottom: 18 }}>
              <div className="date-header">Overdue</div>
              <TaskList roots={overdue} childrenOf={empty} showProject />
            </div>
          ) : null}

          {today.length ? (
            <div>
              <div className="date-header">
                {todayHeader} <span className="soft">. Today</span>
              </div>
              <TaskList roots={today} childrenOf={empty} showProject />
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
