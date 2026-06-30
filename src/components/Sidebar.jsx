import { useState } from 'react';
import { useData } from '../AppData.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import Popover from './Popover.jsx';
import {
  IconInbox,
  IconToday,
  IconUpcoming,
  IconSearch,
  IconPlus,
  IconDots
} from './Icons.jsx';
import { isToday, isOverdue } from '../lib/date.js';
import { colorHex, COLOR_NAMES } from '../lib/colors.js';

// Sidebar nav, top to bottom: Add task, Search stub, Inbox, Today, Upcoming, and
// the Projects list. Projects is the only project grouping. See docs/roadmap.md.
export default function Sidebar({ view, onNavigate, onAddTask }) {
  const { store, projects, tasks, inboxId, bump, flash } = useData();
  const { user, isLocal, signOut } = useAuth();

  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [renaming, setRenaming] = useState(null);
  const [renameVal, setRenameVal] = useState('');
  const [menuFor, setMenuFor] = useState(null);

  const userProjects = projects.filter((p) => !p.isInbox);
  const inboxCount = tasks.filter((t) => t.projectId === inboxId && !t.parentId).length;
  const todayCount = tasks.filter((t) => !t.parentId && (isToday(t.due) || isOverdue(t.due))).length;

  const isActive = (type, projectId) =>
    view.type === type && (type !== 'project' || view.projectId === projectId);

  async function createProject() {
    const name = newName.trim();
    if (!name) {
      setAdding(false);
      return;
    }
    const color = COLOR_NAMES[(userProjects.length + 3) % COLOR_NAMES.length];
    const created = await store.createProject({ name, color, order: userProjects.length });
    await bump();
    setNewName('');
    setAdding(false);
    onNavigate({ type: 'project', projectId: created.id });
  }

  async function renameProject(p) {
    const name = renameVal.trim();
    if (name && name !== p.name) {
      await store.updateProject(p.id, { name });
      await bump();
    }
    setRenaming(null);
  }

  async function deleteProject(p) {
    if (!window.confirm(`Delete "${p.name}" and its tasks?`)) return;
    await store.deleteProject(p.id);
    await bump();
    flash('Project deleted');
    if (isActive('project', p.id)) onNavigate({ type: 'today' });
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <span className="avatar">{(user.displayName || 'You').slice(0, 1).toUpperCase()}</span>
        <span style={{ flex: 1 }}>{user.displayName || 'You'}</span>
        {!isLocal ? (
          <button type="button" className="icon-btn" title="Sign out" onClick={signOut}>
            ↩
          </button>
        ) : null}
      </div>

      <button type="button" className="nav-item nav-add" onClick={() => onAddTask()}>
        <span className="icon" style={{ color: 'var(--ds-red)' }}>
          <IconPlus />
        </span>
        Add task
      </button>

      <div className="nav-search">
        <IconSearch className="icon" />
        <input placeholder="Search" aria-label="Search" />
      </div>

      <button type="button" className={`nav-item ${isActive('project', inboxId) ? 'active' : ''}`} onClick={() => onNavigate({ type: 'project', projectId: inboxId })}>
        <IconInbox />
        Inbox
        {inboxCount ? <span className="count">{inboxCount}</span> : null}
      </button>
      <button type="button" className={`nav-item ${isActive('today') ? 'active' : ''}`} onClick={() => onNavigate({ type: 'today' })}>
        <IconToday />
        Today
        {todayCount ? <span className="count">{todayCount}</span> : null}
      </button>
      <button type="button" className={`nav-item ${isActive('upcoming') ? 'active' : ''}`} onClick={() => onNavigate({ type: 'upcoming' })}>
        <IconUpcoming />
        Upcoming
      </button>

      <div className="nav-section-label">
        Projects
        <button type="button" title="Add project" onClick={() => setAdding((v) => !v)}>
          +
        </button>
      </div>

      {adding ? (
        <div style={{ padding: '2px 8px 6px' }}>
          <input
            autoFocus
            placeholder="Project name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && createProject()}
            onBlur={createProject}
            style={{ width: '100%', padding: '6px', border: '1px solid var(--ds-line)', borderRadius: 6, outline: 'none' }}
          />
        </div>
      ) : null}

      {userProjects.map((p) => {
        const count = tasks.filter((t) => t.projectId === p.id && !t.parentId).length;
        if (renaming === p.id) {
          return (
            <div key={p.id} style={{ padding: '2px 8px' }}>
              <input
                autoFocus
                value={renameVal}
                onChange={(e) => setRenameVal(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && renameProject(p)}
                onBlur={() => renameProject(p)}
                style={{ width: '100%', padding: '6px', border: '1px solid var(--ds-line)', borderRadius: 6, outline: 'none' }}
              />
            </div>
          );
        }
        return (
          <div key={p.id} className={`nav-item ${isActive('project', p.id) ? 'active' : ''}`} style={{ cursor: 'pointer' }}>
            <span className="project-dot" style={{ background: colorHex(p.color) }} onClick={() => onNavigate({ type: 'project', projectId: p.id })} />
            <span style={{ flex: 1 }} onClick={() => onNavigate({ type: 'project', projectId: p.id })}>
              {p.name}
            </span>
            {count ? <span className="count">{count}</span> : null}
            <span className="nav-row-actions popover-wrap">
              <button type="button" className="icon-btn" title="Project options" onClick={() => setMenuFor(menuFor === p.id ? null : p.id)}>
                <IconDots width={15} height={15} />
              </button>
              {menuFor === p.id ? (
                <Popover onClose={() => setMenuFor(null)}>
                  <button
                    type="button"
                    className="popover-item"
                    onClick={() => {
                      setMenuFor(null);
                      setRenameVal(p.name);
                      setRenaming(p.id);
                    }}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="popover-item"
                    onClick={() => {
                      setMenuFor(null);
                      onNavigate({ type: 'project', projectId: p.id, addSection: true });
                    }}
                  >
                    Add section
                  </button>
                  <button
                    type="button"
                    className="popover-item"
                    onClick={() => {
                      setMenuFor(null);
                      deleteProject(p);
                    }}
                  >
                    Delete
                  </button>
                </Popover>
              ) : null}
            </span>
          </div>
        );
      })}
    </aside>
  );
}
