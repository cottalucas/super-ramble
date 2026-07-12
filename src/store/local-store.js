// localStorage adapter. Used in local preview and when Firebase config is
// missing, so the app boots and persists across reloads without keys. Mirrors
// the Firestore adapter method for method. See docs/architecture.md.

import { resolveTree, normalizePriority } from './tree.js';

const genId = () =>
  globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;

function emptyDb() {
  return { projects: {}, sections: {}, tasks: {}, labels: {}, comments: {} };
}

export function createLocalStore(uid) {
  const key = `super-ramble:${uid}`;

  function load() {
    try {
      const raw = localStorage.getItem(key);
      // Spread onto emptyDb() so a bucket added after a user's local data was
      // first written (comments, here) still loads as {} instead of
      // undefined, rather than only existing for a brand new key.
      return raw ? { ...emptyDb(), ...JSON.parse(raw) } : emptyDb();
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

    async createProject({
      name,
      description = '',
      color = 'charcoal',
      parentProjectId = null,
      view = 'list',
      order = 0,
      isInbox = false
    }) {
      const db = load();
      const id = genId();
      db.projects[id] = {
        id, name, description, color, parentProjectId, view, order, isInbox, createdAt: now(), updatedAt: now()
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
      // Promote direct children to the top level rather than deleting them;
      // a project is a bigger container than a section, and cascading into a
      // whole child project's tasks would be a surprising blast radius.
      for (const p of Object.values(db.projects)) {
        if (p.parentProjectId === id) db.projects[p.id] = { ...p, parentProjectId: null, updatedAt: now() };
      }
      save(db);
    },

    async listSections(projectId) {
      return Object.values(load().sections)
        .filter((s) => s.projectId === projectId)
        .sort((a, b) => a.order - b.order);
    },

    async createSection({ projectId, name, description = '', order = 0 }) {
      const db = load();
      const id = genId();
      db.sections[id] = { id, projectId, name, description, order, collapsed: false };
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

    // Moves a section and its whole task subtree (direct tasks plus every
    // descendant reachable through parentId) to a different project. See the
    // Firestore adapter's identical method for why the cascade is needed:
    // leaving a moved section's tasks on the old projectId would strand them.
    async moveSectionToProject(sectionId, projectId) {
      const db = load();
      if (!db.sections[sectionId]) return null;
      const allTasks = Object.values(db.tasks);
      const toMove = new Set(allTasks.filter((t) => t.sectionId === sectionId).map((t) => t.id));
      let changed = true;
      while (changed) {
        changed = false;
        for (const t of allTasks) {
          if (t.parentId && toMove.has(t.parentId) && !toMove.has(t.id)) {
            toMove.add(t.id);
            changed = true;
          }
        }
      }
      db.sections[sectionId] = { ...db.sections[sectionId], projectId };
      for (const tid of toMove) db.tasks[tid] = { ...db.tasks[tid], projectId, updatedAt: now() };
      save(db);
      return db.sections[sectionId];
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

    async listComments(taskId) {
      return Object.values(load().comments)
        .filter((c) => c.taskId === taskId)
        .sort((a, b) => a.postedAt.localeCompare(b.postedAt));
    },

    async createComment({ taskId, content }) {
      const c = content.trim();
      if (!c) return null;
      const db = load();
      const id = genId();
      db.comments[id] = { id, taskId, content: c, postedAt: now() };
      save(db);
      return db.comments[id];
    },

    async ensureInbox() {
      const db = load();
      const existing = Object.values(db.projects).find((p) => p.isInbox);
      if (existing) return existing;
      const id = genId();
      db.projects[id] = {
        id, name: 'Inbox', description: '', color: 'charcoal', parentProjectId: null, view: 'list', order: -1,
        isInbox: true, createdAt: now(), updatedAt: now()
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
