// localStorage adapter. Used in local preview and when Firebase config is
// missing, so the app boots and persists across reloads without keys. Mirrors
// the Firestore adapter method for method. See docs/architecture.md.

import { resolveTree, normalizePriority } from './tree.js';

const genId = () =>
  globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;

function emptyDb() {
  return { projects: {}, sections: {}, tasks: {}, labels: {} };
}

export function createLocalStore(uid) {
  const key = `super-ramble:${uid}`;

  function load() {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : emptyDb();
    } catch {
      return emptyDb();
    }
  }

  function save(data) {
    localStorage.setItem(key, JSON.stringify(data));
  }

  const now = () => new Date().toISOString();
  const sortByOrder = (a, b) => a.order - b.order || a.createdAt?.localeCompare(b.createdAt || '');

  return {
    async listProjects() {
      const db = load();
      return Object.values(db.projects).sort((a, b) => Number(b.isInbox) - Number(a.isInbox) || a.order - b.order);
    },

    async getProject(id) {
      return load().projects[id] || null;
    },

    async createProject({ name, color = 'charcoal', view = 'list', order = 0, isInbox = false }) {
      const db = load();
      const id = genId();
      db.projects[id] = {
        id, name, color, view, order, isInbox, createdAt: now(), updatedAt: now()
      };
      save(db);
      return db.projects[id];
    },

    async updateProject(id, patch) {
      const db = load();
      if (!db.projects[id]) return null;
      db.projects[id] = { ...db.projects[id], ...patch, updatedAt: now() };
      save(db);
      return db.projects[id];
    },

    async deleteProject(id) {
      const db = load();
      delete db.projects[id];
      for (const s of Object.values(db.sections)) if (s.projectId === id) delete db.sections[s.id];
      for (const t of Object.values(db.tasks)) if (t.projectId === id) delete db.tasks[t.id];
      save(db);
    },

    async listSections(projectId) {
      return Object.values(load().sections)
        .filter((s) => s.projectId === projectId)
        .sort((a, b) => a.order - b.order);
    },

    async createSection({ projectId, name, order = 0 }) {
      const db = load();
      const id = genId();
      db.sections[id] = { id, projectId, name, order, collapsed: false };
      save(db);
      return db.sections[id];
    },

    async updateSection(id, patch) {
      const db = load();
      if (!db.sections[id]) return null;
      db.sections[id] = { ...db.sections[id], ...patch };
      save(db);
      return db.sections[id];
    },

    async deleteSection(id) {
      const db = load();
      delete db.sections[id];
      // Tasks in a deleted section fall back to no section, they are not removed.
      for (const t of Object.values(db.tasks)) {
        if (t.sectionId === id) db.tasks[t.id] = { ...t, sectionId: null };
      }
      save(db);
    },

    async listTasks(filter = {}) {
      let tasks = Object.values(load().tasks);
      if (!filter.includeCompleted) tasks = tasks.filter((t) => !t.completed);
      if (filter.projectId) tasks = tasks.filter((t) => t.projectId === filter.projectId);
      if ('parentId' in filter) tasks = tasks.filter((t) => t.parentId === filter.parentId);
      return tasks.sort(sortByOrder);
    },

    async createTask(task) {
      // Route through the one write path, exactly like the UI and the pipeline.
      const { taskIds } = await this.createProjectTree({
        project: { id: task.projectId },
        sections: [],
        tasks: [{ ref: 't', ...task }]
      });
      return load().tasks[taskIds.t];
    },

    async updateTask(id, patch) {
      const db = load();
      if (!db.tasks[id]) return null;
      const next = { ...db.tasks[id], ...patch, updatedAt: now() };
      if ('priority' in patch) next.priority = normalizePriority(patch.priority);
      db.tasks[id] = next;
      save(db);
      return next;
    },

    async deleteTask(id) {
      const db = load();
      delete db.tasks[id];
      // Remove descendants so no orphan sub-tasks remain.
      let changed = true;
      while (changed) {
        changed = false;
        for (const t of Object.values(db.tasks)) {
          if (t.parentId && !db.tasks[t.parentId]) {
            delete db.tasks[t.id];
            changed = true;
          }
        }
      }
      save(db);
    },

    async completeTask(id) {
      return this.updateTask(id, { completed: true, completedAt: now() });
    },

    async listLabels() {
      return Object.values(load().labels).sort((a, b) => a.name.localeCompare(b.name));
    },

    async createLabel({ name, color = 'charcoal' }) {
      const db = load();
      const id = genId();
      db.labels[id] = { id, name, color };
      save(db);
      return db.labels[id];
    },

    async updateLabel(id, patch) {
      const db = load();
      if (!db.labels[id]) return null;
      db.labels[id] = { ...db.labels[id], ...patch };
      save(db);
      return db.labels[id];
    },

    async deleteLabel(id) {
      const db = load();
      delete db.labels[id];
      save(db);
    },

    async ensureInbox() {
      const db = load();
      const existing = Object.values(db.projects).find((p) => p.isInbox);
      if (existing) return existing;
      const id = genId();
      db.projects[id] = {
        id, name: 'Inbox', color: 'charcoal', view: 'list', order: -1, isInbox: true,
        createdAt: now(), updatedAt: now()
      };
      save(db);
      return db.projects[id];
    },

    async createProjectTree(tree) {
      const db = load();
      const { projectId, projectDoc, sectionDocs, taskDocs, maps } = resolveTree(tree, genId, now());
      if (projectDoc) db.projects[projectId] = projectDoc;
      for (const s of sectionDocs) db.sections[s.id] = s;
      for (const t of taskDocs) db.tasks[t.id] = t;
      save(db);
      return { projectId, sectionIds: maps.sections, taskIds: maps.tasks };
    }
  };
}
