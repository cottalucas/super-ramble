import { useState } from 'react';
import { priorityClass } from './PriorityPicker.jsx';
import { IconCheck, IconCaret, IconPlus, IconHash, IconDots } from './Icons.jsx';
import Popover from './Popover.jsx';
import { dueMeta, isOverdue } from '../lib/date.js';
import { colorHex } from '../lib/colors.js';

// One task and its nested sub-tasks. The checkbox completes. Priority sets the
// ring color. The meta line carries due time in green, label chips, and the
// project name when shown outside its project. See docs/design-system.md.
export default function TaskRow({ task, depth = 0, childrenOf, showProject = false, project, onComplete, onAddSub, onDelete }) {
  const kids = childrenOf.get(task.id) || [];
  const [expanded, setExpanded] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);

  const depthCls = depth === 1 ? 'sub' : depth >= 2 ? 'sub2' : '';
  const meta = dueMeta(task.due);
  const overdue = isOverdue(task.due);

  return (
    <>
      <div className={`task-row ${depthCls} ${task.completed ? 'done' : ''}`}>
        <button
          type="button"
          className={`checkbox ${priorityClass(task.priority)}`}
          aria-label="Complete task"
          onClick={() => onComplete(task)}
        >
          <IconCheck className="check" />
        </button>

        <div className="task-main">
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
            <button type="button" className="task-toggle" onClick={() => setExpanded((v) => !v)}>
              <IconCaret width={12} height={12} style={{ transform: expanded ? 'none' : 'rotate(-90deg)' }} />
              {kids.length} sub-task{kids.length > 1 ? 's' : ''}
            </button>
          ) : null}
        </div>

        <div className="task-row-actions">
          {depth < 2 ? (
            <button type="button" className="icon-btn" title="Add sub-task" onClick={() => onAddSub(task)}>
              <IconPlus width={15} height={15} className="icon" />
            </button>
          ) : null}
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
                    onDelete(task);
                  }}
                >
                  Delete
                </button>
              </Popover>
            ) : null}
          </div>
        </div>
      </div>

      {expanded
        ? kids.map((k) => (
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
