// Firestore adapter. Modular SDK. Writes the whole project tree in one batch.
// Mirrors the local adapter method for method so the app and the evals see one
// interface. Reads fetch a collection and filter in memory, which keeps the
// prototype index-free; swap to indexed queries when data grows.
// See docs/architecture.md.

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  serverTimestamp
} from 'firebase/firestore';
import { resolveTree, normalizePriority } from './tree.js';

export function createFirestoreStore(db, uid) {
  const col = (name) => collection(db, 'users', uid, name);
  const ref = (name, id) => doc(db, 'users', uid, name, id);
  const now = () => new Date().toISOString();
  const genId = (name) => doc(col(name)).id;

  async function all(name) {
    const snap = await getDocs(col(name));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }

  return {
    async listProjects() {
      const projects = await all('projects');
      return projects.sort((a, b) => Number(b.isInbox) - Number(a.isInbox) || a.order - b.order);
    },

    async getProject(id) {
      const snap = await getDoc(ref('projects', id));
      return snap.exists() ? { id: snap.id, ...snap.data() } : null;
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
      const id = genId('projects');
      const data = { name, description, color, parentProjectId, view, order, isInbox, createdAt: now(), updatedAt: now() };
      await setDoc(ref('projects', id), data);
      return { id, ...data };
    },

    async updateProject(id, patch) {
      await updateDoc(ref('projects', id), { ...patch, updatedAt: now() });
      return this.getProject(id);
    },

    async deleteProject(id) {
      const [sections, tasks, projects] = await Promise.all([all('sections'), all('tasks'), all('projects')]);
      const batch = writeBatch(db);
      batch.delete(ref('projects', id));
      for (const s of sections) if (s.projectId === id) batch.delete(ref('sections', s.id));
      for (const t of tasks) if (t.projectId === id) batch.delete(ref('tasks', t.id));
      // Promote direct children to the top level rather than deleting them;
      // a project is a bigger container than a section, and cascading into a
      // whole child project's tasks would be a surprising blast radius.
      for (const p of projects) {
        if (p.parentProjectId === id) batch.update(ref('projects', p.id), { parentProjectId: null, updatedAt: now() });
      }
      await batch.commit();
    },

    async listSections(projectId) {
      const sections = await all('sections');
      return sections.filter((s) => s.projectId === projectId).sort((a, b) => a.order - b.order);
    },

    async createSection({ projectId, name, description = '', order = 0 }) {
      const id = genId('sections');
      const data = { projectId, name, description, order, collapsed: false };
      await setDoc(ref('sections', id), data);
      return { id, ...data };
    },

    async updateSection(id, patch) {
      await updateDoc(ref('sections', id), patch);
      const snap = await getDoc(ref('sections', id));
      return snap.exists() ? { id, ...snap.data() } : null;
    },

    async deleteSection(id) {
      const tasks = await all('tasks');
      const batch = writeBatch(db);
      batch.delete(ref('sections', id));
      for (const t of tasks) if (t.sectionId === id) batch.update(ref('tasks', t.id), { sectionId: null });
      await batch.commit();
    },

    // Moves a section, and every task inside it (its direct tasks and their
    // whole sub-task chain, not just the direct ones), to a different
    // project. A section's own projectId changing without also moving its
    // tasks would strand them: ProjectView filters tasks by projectId, so a
    // task left behind on the old projectId would render nowhere real while
    // still nesting under a parent that moved, or show orphaned in a project
    // that no longer has its section. The descendant walk mirrors
    // deleteTask's own cascade, the existing precedent for "find every task
    // under this one" in this codebase.
    async moveSectionToProject(sectionId, projectId) {
      const tasks = await all('tasks');
      const toMove = new Set(tasks.filter((t) => t.sectionId === sectionId).map((t) => t.id));
      let changed = true;
      while (changed) {
        changed = false;
        for (const t of tasks) {
          if (t.parentId && toMove.has(t.parentId) && !toMove.has(t.id)) {
            toMove.add(t.id);
            changed = true;
          }
        }
      }
      const batch = writeBatch(db);
      batch.update(ref('sections', sectionId), { projectId });
      for (const tid of toMove) batch.update(ref('tasks', tid), { projectId, updatedAt: now() });
      await batch.commit();
    },

    async listTasks(filter = {}) {
      let tasks = await all('tasks');
      if (!filter.includeCompleted) tasks = tasks.filter((t) => !t.completed);
      if (filter.projectId) tasks = tasks.filter((t) => t.projectId === filter.projectId);
      if ('parentId' in filter) tasks = tasks.filter((t) => t.parentId === filter.parentId);
      return tasks.sort((a, b) => a.order - b.order);
    },

    async createTask(task) {
      const { taskIds } = await this.createProjectTree({
        project: { id: task.projectId },
        sections: [],
        tasks: [{ ref: 't', ...task }]
      });
      const snap = await getDoc(ref('tasks', taskIds.t));
      return { id: taskIds.t, ...snap.data() };
    },

    async updateTask(id, patch) {
      const next = { ...patch, updatedAt: now() };
      if ('priority' in patch) next.priority = normalizePriority(patch.priority);
      await updateDoc(ref('tasks', id), next);
      const snap = await getDoc(ref('tasks', id));
      return snap.exists() ? { id, ...snap.data() } : null;
    },

    async deleteTask(id) {
      const tasks = await all('tasks');
      const toRemove = new Set([id]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const t of tasks) {
          if (t.parentId && toRemove.has(t.parentId) && !toRemove.has(t.id)) {
            toRemove.add(t.id);
            changed = true;
          }
        }
      }
      const batch = writeBatch(db);
      for (const tid of toRemove) batch.delete(ref('tasks', tid));
      await batch.commit();
    },

    async completeTask(id) {
      return this.updateTask(id, { completed: true, completedAt: now() });
    },

    async listLabels() {
      const labels = await all('labels');
      return labels.sort((a, b) => a.name.localeCompare(b.name));
    },

    async createLabel({ name, color = 'charcoal' }) {
      const id = genId('labels');
      await setDoc(ref('labels', id), { name, color });
      return { id, name, color };
    },

    async updateLabel(id, patch) {
      await updateDoc(ref('labels', id), patch);
      const snap = await getDoc(ref('labels', id));
      return snap.exists() ? { id, ...snap.data() } : null;
    },

    async deleteLabel(id) {
      await deleteDoc(ref('labels', id));
    },

    async listComments(taskId) {
      const comments = await all('comments');
      return comments.filter((c) => c.taskId === taskId).sort((a, b) => a.postedAt.localeCompare(b.postedAt));
    },

    async createComment({ taskId, content }) {
      const c = content.trim();
      if (!c) return null;
      const id = genId('comments');
      const data = { taskId, content: c, postedAt: now() };
      await setDoc(ref('comments', id), data);
      return { id, ...data };
    },

    async ensureInbox() {
      const projects = await all('projects');
      const existing = projects.find((p) => p.isInbox);
      if (existing) return existing;
      const id = genId('projects');
      const data = {
        name: 'Inbox', description: '', color: 'charcoal', parentProjectId: null, view: 'list', order: -1,
        isInbox: true, createdAt: now(), updatedAt: now()
      };
      await setDoc(ref('projects', id), data);
      return { id, ...data };
    },

    async createProjectTree(tree) {
      const { projectId, projectDoc, sectionDocs, taskDocs, maps } = resolveTree(
        tree,
        () => genId('tasks'),
        now()
      );
      const batch = writeBatch(db);
      if (projectDoc) {
        const { id, ...data } = projectDoc;
        batch.set(ref('projects', id), data);
      }
      for (const s of sectionDocs) {
        const { id, ...data } = s;
        batch.set(ref('sections', id), data);
      }
      for (const t of taskDocs) {
        const { id, ...data } = t;
        batch.set(ref('tasks', id), data);
      }
      await batch.commit();
      return { projectId, sectionIds: maps.sections, taskIds: maps.tasks };
    }
  };
}

// Exported so a future migration can stamp server timestamps if desired.
export const _serverTimestamp = serverTimestamp;
