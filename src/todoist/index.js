// Todoist client contract. Stubbed for phase 2. The target is the Todoist REST
// API v1 at developer.todoist.com, the unified API, base URL
// https://api.todoist.com/api/v1. Not the archived v6 Sync API. Live OAuth and
// the batched create are wired in phase 3. The shape mirrors the store's
// createProjectTree so the pipeline writes through one contract either way.
// See docs/architecture.md.

export function createTodoistClient() {
  return {
    async readProjects() {
      // STUB: POST /api/v1/sync resource_types=["projects"].
      return [];
    },

    async readLabels() {
      // STUB: POST /api/v1/sync resource_types=["labels"].
      return [];
    },

    async createTree(/* tree */) {
      // STUB: one batched POST /api/v1/sync. project_add (temp_id), item_add per
      // task, parent_id per sub-task. Returns temp_id_mapping.
      return { stub: true, tempIdMapping: {} };
    }
  };
}
