import { useState } from 'react';
import { useData } from '../AppData.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import Popover from './Popover.jsx';
import ConfirmDialog from './ConfirmDialog.jsx';
import AddProjectModal from './AddProjectModal.jsx';
import SettingsModal from './SettingsModal.jsx';
import QuickAddModal from './QuickAddModal.jsx';
import SuperRambleModal from './SuperRambleModal.jsx';
import {
  IconInbox,
  IconToday,
  IconUpcoming,
  IconPlus,
  IconDots,
  IconCaret,
  IconSidebarToggle,
  IconSparkle
} from './Icons.jsx';
import { isToday, isOverdue, timeAgo } from '../lib/date.js';
import { colorHex } from '../lib/colors.js';
import { buildProjectChildrenMap } from '../lib/projectTree.js';
import { getProjectsPanelCollapsed, setProjectsPanelCollapsed } from '../lib/projectsPanel.js';
import { validParentCandidates } from './AddProjectModal.jsx';

// One project row, and its children recursively underneath. No fixed depth
// limit; whatever depth exists renders, indented per level. Collapse state is
// local to the sidebar, not persisted: projects carry no collapsed field,
// only sections do. See docs/architecture.md and docs/roadmap.md.
//
// Draggable, position-aware: pointer in the row's top half previews "insert
// as a sibling immediately before this row" (reparenting too, if the row
// belongs to a different parent than the dragged project), bottom half
// previews "nest as this row's new last child," mirroring the same
// top/bottom-half convention ProjectView's own task list already uses
// (TaskRow.jsx, TaskList.jsx). Reopened from an earlier siblings-only
// decision; see docs/resolution-log.md, 2026-07-10, for why and for the
// pointer to the entry this supersedes.
function ProjectNode({
  project,
  depth,
  childrenOf,
  taskCounts,
  isActive,
  onNavigate,
  collapsedIds,
  onToggleCollapse,
  menuFor,
  onToggleMenu,
  onCloseMenu,
  onAddSection,
  onAddAbove,
  onAddBelow,
  onEdit,
  onDeleteRequest,
  dragProjectId,
  dragPreview,
  onDragStartProject,
  onDragOverProject,
  onDragLeaveProject,
  onDropProject,
  onDragEndProject
}) {
  const kids = childrenOf.get(project.id) || [];
  const collapsed = collapsedIds.has(project.id);
  const count = taskCounts[project.id] || 0;
  const indent = 8 + depth * 18;
  // Drawn as classes on the row itself (box-shadow/background), not a
  // mounted/unmounted sibling element: see TaskRow.jsx's own comment and
  // docs/resolution-log.md, 2026-07-10, for why an inserted placeholder
  // div caused real, sporadic drops to silently no-op.
  const dropBefore = dragPreview?.kind === 'before' && dragPreview.projectId === project.id;
  const dropNest = dragPreview?.kind === 'nest' && dragPreview.projectId === project.id;

  return (
    <>
      <div
        className={`nav-item ${isActive('project', project.id) ? 'active' : ''} ${
          dropBefore ? 'drop-before' : ''
        } ${dropNest ? 'drop-nest' : ''}`}
        style={{ cursor: 'pointer', paddingLeft: indent }}
        draggable
        onDragStart={(e) => {
          e.stopPropagation();
          onDragStartProject(project);
        }}
        onDragOver={(e) => {
          if (!dragProjectId || dragProjectId === project.id) return;
          e.preventDefault();
          e.stopPropagation();
          const rect = e.currentTarget.getBoundingClientRect();
          const inBottomHalf = e.clientY >= rect.top + rect.height / 2;
          onDragOverProject(project, inBottomHalf ? 'nest' : 'before');
        }}
        onDragLeave={() => onDragLeaveProject(project.id)}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onDropProject(project);
        }}
        onDragEnd={onDragEndProject}
      >
        {kids.length ? (
          <button
            type="button"
            className="icon-btn project-caret"
            onClick={(e) => {
              e.stopPropagation();
              onToggleCollapse(project.id);
            }}
          >
            <IconCaret width={14} height={14} style={{ transform: collapsed ? 'rotate(-90deg)' : 'none' }} />
          </button>
        ) : (
          <span className="project-caret-spacer" />
        )}
        <span
          className="project-hash"
          style={{ color: colorHex(project.color) }}
          onClick={() => onNavigate({ type: 'project', projectId: project.id })}
        >
          #
        </span>
        <span style={{ flex: 1 }} onClick={() => onNavigate({ type: 'project', projectId: project.id })}>
          {project.name}
        </span>
        {count ? <span className="count">{count}</span> : null}
        <span className="nav-row-actions popover-wrap">
          <button type="button" className="icon-btn" title="Project options" onClick={() => onToggleMenu(project.id)}>
            <IconDots width={15} height={15} />
          </button>
          {menuFor === project.id ? (
            <Popover onClose={onCloseMenu}>
              <button type="button" className="popover-item" onClick={() => onAddAbove(project)}>
                Add project above
              </button>
              <button type="button" className="popover-item" onClick={() => onAddBelow(project)}>
                Add project below
              </button>
              <button type="button" className="popover-item" onClick={() => onEdit(project)}>
                Edit
              </button>
              <button type="button" className="popover-item" onClick={() => onAddSection(project)}>
                Add section
              </button>
              <button type="button" className="popover-item" onClick={() => onDeleteRequest(project)}>
                Delete
              </button>
            </Popover>
          ) : null}
        </span>
      </div>

      {!collapsed
        ? kids.map((child) => (
            <ProjectNode
              key={child.id}
              project={child}
              depth={depth + 1}
              childrenOf={childrenOf}
              taskCounts={taskCounts}
              isActive={isActive}
              onNavigate={onNavigate}
              collapsedIds={collapsedIds}
              onToggleCollapse={onToggleCollapse}
              menuFor={menuFor}
              onToggleMenu={onToggleMenu}
              onCloseMenu={onCloseMenu}
              onAddSection={onAddSection}
              onAddAbove={onAddAbove}
              onAddBelow={onAddBelow}
              onEdit={onEdit}
              onDeleteRequest={onDeleteRequest}
              dragProjectId={dragProjectId}
              dragPreview={dragPreview}
              onDragStartProject={onDragStartProject}
              onDragOverProject={onDragOverProject}
              onDragLeaveProject={onDragLeaveProject}
              onDropProject={onDropProject}
              onDragEndProject={onDragEndProject}
            />
          ))
        : null}
    </>
  );
}

// Sidebar nav, top to bottom: Add task, Inbox, Today, Upcoming, and a nested
// Projects list. See docs/roadmap.md.
export default function Sidebar({ view, onNavigate, onToggleSidebar, mobile = false }) {
  const { store, projects, tasks, inboxId, bump, flash, lastSyncedAt, patchProjects } = useData();
  const { user, isLocal, signOut } = useAuth();

  const [addTaskOpen, setAddTaskOpen] = useState(false);
  const [superRambleOpen, setSuperRambleOpen] = useState(false);
  const [projectModal, setProjectModal] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [menuFor, setMenuFor] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [collapsedIds, setCollapsedIds] = useState(() => new Set());
  const [dragProjectId, setDragProjectId] = useState(null);
  const [dragPreview, setDragPreview] = useState(null);
  const [projectsCollapsed, setProjectsCollapsedState] = useState(() => getProjectsPanelCollapsed());
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);

  async function doSignOut() {
    setConfirmSignOut(false);
    setAvatarMenuOpen(false);
    await signOut();
  }

  const userProjects = projects.filter((p) => !p.isInbox);
  const inboxCount = tasks.filter((t) => t.projectId === inboxId && !t.parentId).length;
  const todayCount = tasks.filter((t) => !t.parentId && (isToday(t.due) || isOverdue(t.due))).length;
  const rootTaskCount = tasks.filter((t) => !t.parentId && !t.completed).length;
  const syncedLabel = timeAgo(lastSyncedAt);

  const childrenOf = buildProjectChildrenMap(userProjects);
  const rootProjects = childrenOf.get(null) || [];
  const taskCounts = {};
  for (const p of userProjects) {
    taskCounts[p.id] = tasks.filter((t) => t.projectId === p.id && !t.parentId).length;
  }

  const isActive = (type, projectId) =>
    view.type === type && (type !== 'project' || view.projectId === projectId);

  function toggleCollapse(projectId) {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  }

  // "My Projects" as a whole, separate from any single project's own
  // ProjectNode caret above: persisted, unlike collapsedIds, which resets
  // on reload by design (projects carry no collapsed field, only sections
  // do). See docs/design-system.md.
  function toggleProjectsCollapsed() {
    const next = !projectsCollapsed;
    setProjectsPanelCollapsed(next);
    setProjectsCollapsedState(next);
  }

  // Reorders new/added-above/added-below projects into place, and drag
  // reorders. Reads a fresh project list rather than trusting the possibly
  // stale `projects` closure, since this runs after a write that just
  // changed it. Siblings only: never touches parentProjectId.
  async function reorderSiblings(parentProjectId, orderedIds) {
    const all = await store.listProjects();
    const siblings = all.filter((p) => !p.isInbox && (p.parentProjectId || null) === (parentProjectId || null));
    const byId = new Map(siblings.map((p) => [p.id, p]));
    await Promise.all(
      orderedIds.map((id, i) => {
        const p = byId.get(id);
        return p && p.order !== i ? store.updateProject(id, { order: i }) : null;
      })
    );
  }

  function openAddProject() {
    setProjectModal({ mode: 'add', parentProjectId: null });
  }

  function openAddAbove(project) {
    setMenuFor(null);
    const siblings = childrenOf.get(project.parentProjectId || null) || [];
    const insertIndex = siblings.findIndex((p) => p.id === project.id);
    setProjectModal({ mode: 'add', parentProjectId: project.parentProjectId || null, insertIndex });
  }

  function openAddBelow(project) {
    setMenuFor(null);
    const siblings = childrenOf.get(project.parentProjectId || null) || [];
    const insertIndex = siblings.findIndex((p) => p.id === project.id) + 1;
    setProjectModal({ mode: 'add', parentProjectId: project.parentProjectId || null, insertIndex });
  }

  function openEditProject(project) {
    setMenuFor(null);
    setProjectModal({ mode: 'edit', project });
  }

  async function handleProjectSaved(saved) {
    const modal = projectModal;
    if (modal?.mode === 'add' && typeof modal.insertIndex === 'number') {
      const siblings = (childrenOf.get(modal.parentProjectId || null) || [])
        .filter((p) => p.id !== saved.id)
        .map((p) => p.id);
      siblings.splice(modal.insertIndex, 0, saved.id);
      await reorderSiblings(modal.parentProjectId, siblings);
    }
    await bump();
    if (modal?.mode === 'add') onNavigate({ type: 'project', projectId: saved.id });
  }

  // A project can become target's own child only if target is not that
  // project's own descendant (or the project itself): the exact cycle guard
  // AddProjectModal.jsx's Parent project field already enforces for a
  // click-through reparent, reused here rather than re-derived for a drag
  // one. destParentId === null (root level) is always valid, nothing can be
  // its own ancestor at the top.
  function canReparentTo(fromId, destParentId) {
    if (!destParentId) return true;
    return validParentCandidates(userProjects, fromId).some((p) => p.id === destParentId);
  }

  function handleProjectDragLeave(id) {
    setDragPreview((cur) => (cur && cur.projectId === id ? null : cur));
  }

  // Position-aware, reopened from the earlier siblings-only decision (see
  // docs/resolution-log.md, 2026-07-10, for why). Top half of any project
  // row previews "before" (insert as a sibling immediately before it,
  // reparenting too when it belongs to a different parent than the dragged
  // project); bottom half previews "nest" (become that row's new last
  // child), regardless of parent. The same-parent "before" case is byte-
  // for-byte the reorder this app has always done, still through
  // reorderSiblings; only a different-parent "before" and any "nest" are new.
  async function handleProjectDrop(target) {
    const fromId = dragProjectId;
    const preview = dragPreview;
    setDragProjectId(null);
    setDragPreview(null);
    if (!fromId || !preview || fromId === target.id) return;
    const fromProject = userProjects.find((p) => p.id === fromId);
    if (!fromProject) return;
    const fromParentKey = fromProject.parentProjectId || null;

    if (preview.kind === 'nest') {
      if (!canReparentTo(fromId, target.id)) return;
      const all = await store.listProjects();
      const children = all.filter((p) => !p.isInbox && (p.parentProjectId || null) === target.id);
      const newOrder = children.length;
      await store.updateProject(fromId, { parentProjectId: target.id, order: newOrder });
      // Optimistic: the write above already landed, reflect it on screen
      // now instead of waiting on bump()'s full reload(). See
      // docs/resolution-log.md, 2026-07-10.
      patchProjects((prev) =>
        prev.map((p) => (p.id === fromId ? { ...p, parentProjectId: target.id, order: newOrder } : p))
      );
      await bump();
      return;
    }

    // preview.kind === 'before'
    const destParentId = target.parentProjectId || null;
    if (destParentId === fromParentKey) {
      const siblings = (childrenOf.get(destParentId) || []).map((p) => p.id);
      const from = siblings.indexOf(fromId);
      const to = siblings.indexOf(target.id);
      if (from === -1 || to === -1) return;
      const [moved] = siblings.splice(from, 1);
      siblings.splice(to, 0, moved);
      await reorderSiblings(destParentId, siblings);
      const orderById = new Map(siblings.map((id, i) => [id, i]));
      patchProjects((prev) => prev.map((p) => (orderById.has(p.id) ? { ...p, order: orderById.get(p.id) } : p)));
      await bump();
      return;
    }

    // Different parent: reparent and position immediately before target,
    // mirroring TaskList.jsx's own unified before-vs-nest model (a "before"
    // drop already reparents across sections there too) rather than leaving
    // cross-parent "before" as a second, narrower no-op alongside "nest".
    if (!canReparentTo(fromId, destParentId)) return;
    const all = await store.listProjects();
    const destSiblings = all
      .filter((p) => !p.isInbox && (p.parentProjectId || null) === destParentId && p.id !== fromId)
      .sort((a, b) => a.order - b.order);
    const targetIndex = destSiblings.findIndex((p) => p.id === target.id);
    destSiblings.splice(targetIndex === -1 ? destSiblings.length : targetIndex, 0, fromProject);
    const patchesById = new Map();
    await Promise.all(
      destSiblings.map((p, i) => {
        const patch = {};
        if (p.order !== i) patch.order = i;
        if (p.id === fromId) patch.parentProjectId = destParentId;
        if (Object.keys(patch).length) patchesById.set(p.id, patch);
        return Object.keys(patch).length ? store.updateProject(p.id, patch) : null;
      })
    );
    patchProjects((prev) => prev.map((p) => (patchesById.has(p.id) ? { ...p, ...patchesById.get(p.id) } : p)));
    await bump();
  }

  async function confirmDeleteProject() {
    const p = deleteTarget;
    setDeleteTarget(null);
    await store.deleteProject(p.id);
    await bump();
    flash('Project deleted');
    if (isActive('project', p.id)) onNavigate({ type: 'today' });
  }

  return (
    <aside className={`sidebar ${mobile ? 'sidebar-mobile' : ''}`}>
      <div className="sidebar-head">
        <span className="sidebar-head-trigger-wrap popover-wrap">
          <button type="button" className="sidebar-head-trigger" onClick={() => setAvatarMenuOpen((v) => !v)}>
            <span className="avatar">{(user.displayName || 'You').slice(0, 1).toUpperCase()}</span>
            <span style={{ flex: 1 }}>{user.displayName || 'You'}</span>
            <IconCaret width={14} height={14} className="sidebar-head-caret" />
          </button>
          {avatarMenuOpen ? (
            <Popover onClose={() => setAvatarMenuOpen(false)}>
              <div className="avatar-menu-header">
                {user.displayName || 'You'} &middot; {rootTaskCount} task{rootTaskCount === 1 ? '' : 's'}
              </div>
              <hr className="nav-divider" style={{ margin: '4px 8px' }} />
              <div className="avatar-menu-synced">{syncedLabel ? `Synced ${syncedLabel}` : 'Not synced yet'}</div>
              <button
                type="button"
                className="avatar-menu-item"
                onClick={() => {
                  setAvatarMenuOpen(false);
                  setSettingsOpen(true);
                }}
              >
                Settings
              </button>
              {!isLocal ? (
                <button
                  type="button"
                  className="avatar-menu-item"
                  onClick={() => {
                    setAvatarMenuOpen(false);
                    setConfirmSignOut(true);
                  }}
                >
                  Log out
                </button>
              ) : null}
            </Popover>
          ) : null}
        </span>
        <button type="button" className="sidebar-toggle" title="Hide sidebar" onClick={onToggleSidebar}>
          <IconSidebarToggle width={16} height={16} />
        </button>
      </div>

      <button type="button" className="nav-item nav-add" onClick={() => setAddTaskOpen(true)}>
        <span className="icon" style={{ color: 'var(--ds-red)' }}>
          <IconPlus />
        </span>
        Add task
      </button>

      <button type="button" className="nav-item" onClick={() => setSuperRambleOpen(true)}>
        <IconSparkle />
        Super Ramble
      </button>

      <hr className="nav-divider" />

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
        My Projects
        <button type="button" className="nav-section-add" title="Add project" onClick={openAddProject}>
          +
        </button>
        <button
          type="button"
          className="icon-btn nav-section-caret"
          title={projectsCollapsed ? 'Show My Projects' : 'Hide My Projects'}
          onClick={toggleProjectsCollapsed}
        >
          <IconCaret width={14} height={14} style={{ transform: projectsCollapsed ? 'rotate(-90deg)' : 'none' }} />
        </button>
      </div>

      {!projectsCollapsed && rootProjects.map((p) => (
        <ProjectNode
          key={p.id}
          project={p}
          depth={0}
          childrenOf={childrenOf}
          taskCounts={taskCounts}
          isActive={isActive}
          onNavigate={onNavigate}
          collapsedIds={collapsedIds}
          onToggleCollapse={toggleCollapse}
          menuFor={menuFor}
          onToggleMenu={(id) => setMenuFor((cur) => (cur === id ? null : id))}
          onCloseMenu={() => setMenuFor(null)}
          onAddSection={(proj) => {
            setMenuFor(null);
            onNavigate({ type: 'project', projectId: proj.id, addSection: true });
          }}
          onAddAbove={openAddAbove}
          onAddBelow={openAddBelow}
          onEdit={openEditProject}
          onDeleteRequest={(proj) => {
            setMenuFor(null);
            setDeleteTarget(proj);
          }}
          dragProjectId={dragProjectId}
          dragPreview={dragPreview}
          onDragStartProject={(proj) => setDragProjectId(proj.id)}
          onDragOverProject={(proj, zone) => setDragPreview({ kind: zone, projectId: proj.id })}
          onDragLeaveProject={handleProjectDragLeave}
          onDropProject={handleProjectDrop}
          onDragEndProject={() => {
            setDragProjectId(null);
            setDragPreview(null);
          }}
        />
      ))}

      {projectModal ? (
        <AddProjectModal
          project={projectModal.mode === 'edit' ? projectModal.project : null}
          initialParentId={projectModal.mode === 'add' ? projectModal.parentProjectId : null}
          onClose={() => setProjectModal(null)}
          onSaved={handleProjectSaved}
        />
      ) : null}

      {addTaskOpen ? <QuickAddModal onClose={() => setAddTaskOpen(false)} /> : null}

      {settingsOpen ? <SettingsModal onClose={() => setSettingsOpen(false)} /> : null}

      {superRambleOpen ? <SuperRambleModal onClose={() => setSuperRambleOpen(false)} /> : null}

      {deleteTarget ? (
        <ConfirmDialog
          title={`Delete "${deleteTarget.name}"?`}
          message="This removes its sections and tasks. Projects nested under it move to the top level."
          confirmLabel="Delete project"
          onConfirm={confirmDeleteProject}
          onCancel={() => setDeleteTarget(null)}
        />
      ) : null}

      {confirmSignOut ? (
        <ConfirmDialog
          title="Sign out?"
          message="Signing out doesn't delete anything. Sign in again anytime to see your tasks."
          confirmLabel="Sign out"
          onConfirm={doSignOut}
          onCancel={() => setConfirmSignOut(false)}
        />
      ) : null}
    </aside>
  );
}
