// Shared project-hierarchy helpers, pure and I/O-free like the rest of lib/.
// Both the sidebar nav and any project picker need the same shape: projects
// grouped under their parentProjectId, and a depth-first flattening so a
// sub-project always renders nested under its real parent instead of flat
// and indistinguishable from an unrelated top-level project of the same name.

export function buildProjectChildrenMap(projects) {
  const map = new Map();
  for (const p of projects) {
    const key = p.parentProjectId || null;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(p);
  }
  for (const arr of map.values()) arr.sort((a, b) => a.order - b.order);
  return map;
}

// Depth-first order: `{ project, depth }` pairs, each project immediately
// followed by its own children. `projects` should exclude Inbox; a caller
// that shows Inbox does so separately, since Inbox is never a child or a
// parent.
export function flattenProjectTree(projects) {
  const childrenOf = buildProjectChildrenMap(projects);
  const out = [];
  function walk(list, depth) {
    for (const p of list) {
      out.push({ project: p, depth });
      walk(childrenOf.get(p.id) || [], depth + 1);
    }
  }
  walk(childrenOf.get(null) || [], 0);
  return out;
}
