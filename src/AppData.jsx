import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './auth/AuthContext.jsx';
import { createStore } from './store/index.js';

const DataContext = createContext(null);

// Holds the store plus the data the whole shell reads: projects, labels, the
// Inbox id. A revision counter bumps after every mutation so views re-fetch
// their tasks. One write path, one refresh path.
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
  const bump = useCallback(async () => {
    await reload();
    setRevision((r) => r + 1);
  }, [reload]);

  const flash = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      await store.ensureInbox();
      if (!alive) return;
      await reload();
      setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, [store, reload]);

  const openAdd = useCallback((defaults = {}) => setQuickAdd({ open: true, defaults }), []);
  const closeAdd = useCallback(() => setQuickAdd({ open: false, defaults: {} }), []);

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
    completeTask,
    deleteTask,
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
