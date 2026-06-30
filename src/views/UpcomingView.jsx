import { useRef } from 'react';
import { useData } from '../AppData.jsx';
import TaskList from '../components/TaskList.jsx';
import { IconPlus } from '../components/Icons.jsx';
import { addDays, toISODate, formatDayHeader, relativeLabel, DOW_SHORT } from '../lib/date.js';

// Upcoming: a horizontally scrollable seven-day window. Each day is a column
// with its date header, that day's tasks, and an Add task affordance. A Today
// control scrolls back to the start. See docs/roadmap.md.
const WINDOW = 7;

export default function UpcomingView() {
  const { tasks, openAdd, inboxId } = useData();
  const scroller = useRef(null);
  const empty = new Map();

  const days = Array.from({ length: WINDOW }, (_, i) => addDays(new Date(), i));

  return (
    <div className="content-inner" style={{ maxWidth: 'none', paddingRight: 24 }}>
      <div className="view-header">
        <h1 className="view-title">Upcoming</h1>
        <span className="spacer" />
        <button
          type="button"
          className="btn btn-quiet"
          onClick={() => scroller.current?.scrollTo({ left: 0, behavior: 'smooth' })}
        >
          Today
        </button>
      </div>

      <div className="upcoming-scroll" ref={scroller}>
        {days.map((d) => {
          const iso = toISODate(d);
          const dayTasks = tasks.filter((t) => t.due?.date === iso);
          return (
            <div key={iso} className="day-col">
              <div className="day-col-head">
                {DOW_SHORT[d.getDay()]} {formatDayHeader(d)}
                <span className="soft">{relativeLabel(iso)}</span>
              </div>
              {dayTasks.length ? <TaskList roots={dayTasks} childrenOf={empty} showProject /> : null}
              <button
                type="button"
                className="add-line"
                onClick={() => openAdd({ projectId: inboxId, due: { date: iso, datetime: null, string: relativeLabel(iso), isRecurring: false } })}
              >
                <span className="plus">
                  <IconPlus width={14} height={14} />
                </span>
                Add task
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
