import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './auth/AuthContext.jsx';
import { createStore } from './store/index.js';
import { getLayout, setLayout } from './lib/layout.js';
import { getAuthToken } from './lib/authToken.js';
import { getTodoistStatus } from './todoist/index.js';

const DataContext = createContext(null);

// Holds the store plus the data the whole shell reads: projects, labels, the
// Inbox id. A revision counter bumps after every mutation so views re-fetch
// their tasks. One write path, one refresh path. Layout (List/Board) also
// lives here, not in each view: it is one global preference, so changing it
// in any view must be visible in every other view immediately, not only
// after a remount. See docs/roadmap.md (Phase 2.8).
export function AppDataProvider({ children }) {
  const { user, isLocal } = useAuth();
  const store = useMemo(() => createStore(user.uid, { local: isLocal }), [user.uid, isLocal]);

  const [projects, setProjects] = useState([]);
  const [labels, setLabels] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [inboxId, setInboxId] = useState(null);
  const [ready, setReady] = useState(false);
  const [revision, setRevision] = useState(0);
  const [toast, setToast] = useState(null);
  const [quickAdd, setQuickAdd] = useState({ open: false, defaults: {} });
  const [taskDetailId, setTaskDetailId] = useState(null);
  const [layout, setLayoutState] = useState(() => getLayout());
  const [todoistConnected, setTodoistConnected] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState(null);

  const setLayoutPref = useCallback((next) => {
    setLayout(next);
    setLayoutState(next === 'board' ? 'board' : 'list');
  }, []);

  const reload = useCallback(async () => {
    const [ps, ls, ts] = await Promise.all([
      store.listProjects(),
      store.listLabels(),
      store.listTasks()
    ]);
    setProjects(ps);
    setLabels(ls);
    setTasks(ts);
    const inbox = ps.find((p) => p.isInbox);
    setInboxId(inbox ? inbox.id : null);
  }, [store]);

  // Bump after any write so task lists re-fetch and nav counts refresh.
  // lastSyncedAt is set here, not in the initial-mount reload() below: this
  // is the one call every write path already shares, so it is the correct
  // place to mark "a write just happened," where the bootstrap read is not.
  const bump = useCallback(async () => {
    await reload();
    setRevision((r) => r + 1);
    setLastSyncedAt(Date.now());
  }, [reload]);

  // Optimistic local patches for a drag-drop's already-known result, so a
  // reorder/reparent reflects on screen immediately instead of waiting on
  // bump()'s full reload() (a real Firestore round trip against the
  // Firestore adapter, not local-store). The real write has already
  // happened by the time a caller uses these; bump() still runs afterward
  // and is still the source of truth, this only removes the visible wait
  // for what the caller already knows the result is. See
  // docs/resolution-log.md, 2026-07-10 (the drag-and-drop reliability fix).
  const patchProjects = useCallback((updater) => {
    setProjects((prev) => updater(prev));
  }, []);
  const patchTasks = useCallback((updater) => {
    setTasks((prev) => updater(prev));
  }, []);

  const flash = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  }, []);

  // The token itself is never client-readable (firestore.rules denies
  // users/{uid}/todoistAuth entirely), so this is the only way Settings and
  // Super Ramble's preview know whether a connection already exists.
  // Local preview has no real Firebase Auth user to call the Function with,
  // so it's always "not connected" there rather than a failed fetch.
  const refreshTodoistStatus = useCallback(async () => {
    if (isLocal) {
      setTodoistConnected(false);
      return;
    }
    try {
      const { connected } = await getTodoistStatus(() => getAuthToken(isLocal));
      setTodoistConnected(Boolean(connected));
    } catch {
      setTodoistConnected(false);
    }
  }, [isLocal]);

  useEffect(() => {
    let alive = true;
    (async () => {
      await store.ensureInbox();
      if (!alive) return;
      await reload();
      await refreshTodoistStatus();
      setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, [store, reload, refreshTodoistStatus]);

  const openAdd = useCallback((defaults = {}) => setQuickAdd({ open: true, defaults }), []);
  const closeAdd = useCallback(() => setQuickAdd({ open: false, defaults: {} }), []);

  const openTaskDetail = useCallback((taskId) => setTaskDetailId(taskId), []);
  const closeTaskDetail = useCallback(() => setTaskDetailId(null), []);

  // Shared task actions so every view and row uses the same write+refresh path.
  const completeTask = useCallback(
    async (task) => {
      await store.completeTask(task.id);
      await bump();
    },
    [store, bump]
  );
  const deleteTask = useCallback(
    async (task) => {
      await store.deleteTask(task.id);
      await bump();
    },
    [store, bump]
  );

  const value = {
    store,
    projects,
    labels,
    tasks,
    inboxId,
    ready,
    revision,
    bump,
    flash,
    quickAdd,
    openAdd,
    closeAdd,
    taskDetailId,
    openTaskDetail,
    closeTaskDetail,
    completeTask,
    deleteTask,
    layout,
    setLayoutPref,
    todoistConnected,
    refreshTodoistStatus,
    lastSyncedAt,
    patchProjects,
    patchTasks,
    projectById: (id) => projects.find((p) => p.id === id) || null
  };

  return (
    <DataContext.Provider value={value}>
      {children}
      {toast ? <div className="toast">{toast}</div> : null}
    </DataContext.Provider>
  );
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within AppDataProvider');
  return ctx;
}
