// Negative contract cases. These assert that the validator rejects responses
// that drift out of the contract. They run alongside the positive fixtures in
// scripts/eval-offline.mjs and never call the model. See docs/llm-pipeline.md.

const base = {
  decision: 'tasks',
  reasoning: 'valid baseline',
  targetProjectId: null,
  project: null,
  tasks: [{ content: 'A task', priority: 1, due: null, subtasks: [] }],
  needsClarification: false,
  clarificationQuestion: null
};

export const negativeCases = [
  {
    id: 'neg-out-of-contract-field',
    describe: 'extra top-level field is rejected',
    response: { ...base, surprise: true },
    existingProjectIds: []
  },
  {
    id: 'neg-empty-reasoning',
    describe: 'empty reasoning is rejected',
    response: { ...base, reasoning: '   ' },
    existingProjectIds: []
  },
  {
    id: 'neg-tasks-with-project',
    describe: 'decision "tasks" must not carry a synthesized project',
    response: { ...base, decision: 'tasks', project: { name: 'Sneaky' } },
    existingProjectIds: []
  },
  {
    id: 'neg-route-unknown-project',
    describe: 'routing to a project id that does not exist is rejected',
    response: { ...base, decision: 'project', targetProjectId: '9999' },
    existingProjectIds: ['2331', '2332']
  },
  {
    id: 'neg-bad-priority',
    describe: 'priority outside 1-4 is rejected',
    response: { ...base, tasks: [{ content: 'A task', priority: 7, due: null, subtasks: [] }] },
    existingProjectIds: []
  },
  {
    id: 'neg-subtask-out-of-contract',
    describe: 'out-of-contract field inside a sub-task is rejected',
    response: {
      ...base,
      tasks: [
        {
          content: 'Parent',
          priority: 1,
          due: null,
          subtasks: [{ content: 'Child', priority: 1, due: null, assignee: 'me' }]
        }
      ]
    },
    existingProjectIds: []
  }
];
