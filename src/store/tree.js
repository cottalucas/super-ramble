// Pure ref-resolution for createProjectTree. Shared by both store adapters so
// the local and Firestore paths build the same documents. No I/O here.
//
// Input shape (see docs/architecture.md and docs/llm-pipeline.md):
//   project:  { id } to route into an existing project, or { name, color, ... }
//   sections: [{ ref?, id?, name, order? }]
//   tasks:    [{ ref?, content, description?, priority?, due?, labels?,
//                order?, parentRef?, parentId?, sectionRef?, sectionId? }]
//
// The caller passes genId() so each adapter controls id generation (Firestore
// doc ids vs uuids). Returns plain documents ready to persist, plus the ref maps.

export function resolveTree({ project, sections = [], tasks = [] }, genId, now) {
  const timestamp = now || new Date().toISOString();

  // Project: reuse an existing id, or mint a new project document.
  const routingExisting = Boolean(project && project.id);
  const projectId = routingExisting ? project.id : genId();
  const projectDoc = routingExisting
    ? null
    : {
        id: projectId,
        name: project.name,
        description: project.description || '',
        color: project.color || 'charcoal',
        parentProjectId: project.parentProjectId || null,
        view: project.view || 'list',
        order: typeof project.order === 'number' ? project.order : 0,
        isInbox: Boolean(project.isInbox),
        createdAt: timestamp,
        updatedAt: timestamp
      };

  // Sections: mint ids for new ones, map their local refs.
  const sectionRefMap = new Map();
  const sectionDocs = [];
  sections.forEach((s, i) => {
    const existing = Boolean(s.id);
    const id = existing ? s.id : genId();
    if (s.ref) sectionRefMap.set(s.ref, id);
    if (!existing) {
      sectionDocs.push({
        id,
        projectId,
        name: s.name,
        description: s.description || '',
        order: typeof s.order === 'number' ? s.order : i,
        collapsed: false
      });
    }
  });

  // Tasks: pre-mint every id so parentRef can point at a sibling created in the
  // same batch, regardless of order. Then resolve refs to ids in a second pass.
  const taskRefMap = new Map();
  tasks.forEach((t) => {
    const id = genId();
    t.__id = id;
    if (t.ref) taskRefMap.set(t.ref, id);
  });

  const taskDocs = tasks.map((t, i) => {
    const sectionId = t.sectionId ?? (t.sectionRef ? sectionRefMap.get(t.sectionRef) ?? null : null);
    const parentId = t.parentId ?? (t.parentRef ? taskRefMap.get(t.parentRef) ?? null : null);
    return {
      id: t.__id,
      projectId,
      sectionId,
      parentId,
      content: t.content,
      description: t.description || '',
      priority: normalizePriority(t.priority),
      due: t.due ?? null,
      labels: Array.isArray(t.labels) ? t.labels : [],
      completed: false,
      completedAt: null,
      order: typeof t.order === 'number' ? t.order : i,
      createdAt: timestamp,
      updatedAt: timestamp
    };
  });

  // Validate the tree is internally consistent before any write.
  for (const t of taskDocs) {
    if (t.parentId && !taskDocs.some((x) => x.id === t.parentId)) {
      // parentId may reference an existing task outside this batch; that is fine.
      // A parentRef that did not resolve would have produced null, caught here.
    }
  }
  for (const t of tasks) {
    if (t.parentRef && !taskRefMap.has(t.parentRef)) {
      throw new Error(`orphan sub-task: parentRef "${t.parentRef}" has no matching task`);
    }
    if (t.sectionRef && !sectionRefMap.has(t.sectionRef)) {
      throw new Error(`task references unknown sectionRef "${t.sectionRef}"`);
    }
  }

  return {
    projectId,
    projectDoc,
    sectionDocs,
    taskDocs,
    maps: {
      sections: Object.fromEntries(sectionRefMap),
      tasks: Object.fromEntries(taskRefMap)
    }
  };
}

export function normalizePriority(p) {
  const n = Number(p);
  if (Number.isInteger(n) && n >= 1 && n <= 4) return n;
  return 4;
}
