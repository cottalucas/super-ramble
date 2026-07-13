import { useEffect, useRef, useState } from 'react';
import { useData } from '../AppData.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { structureTranscript, ContractError } from '../pipeline/structure.js';
import { toProjectTree, flattenTasks, toDue, updateTaskAtRef } from '../pipeline/write.js';
import { getAuthToken } from '../lib/authToken.js';
import { createTodoistClient } from '../todoist/index.js';
import TaskRow, { buildChildrenMap } from './TaskRow.jsx';
import VoiceRecorder from './VoiceRecorder.jsx';

// TaskList itself was a poor fit for this preview: it hard-wires useData()
// (real completeTask/deleteTask/openAdd/openTaskDetail, all calling the real
// store) and native-drag reorder state, none of which is safe or meaningful
// against a tree that has no ids yet and has not been written. TaskRow is the
// actual per-row renderer underneath it, and it already recurses through a
// childrenOf map keyed by parentId, so the smallest real adaptation was
// giving TaskRow an editable prop (see TaskRow.jsx) and building a throwaway
// childrenOf map keyed by local refs instead of real ids. Same row rendering,
// same due/priority/indent rules, no parallel renderer.
//
// `editedStructured` is the in-memory working copy (SuperRambleModal's
// `edited` state), never the original response: this always renders what
// Confirm would actually write. `onRemove`/`onContentChange` receive back
// exactly the row object TaskRow was given, whose `id` is one of
// flattenTasks's own refs (`t{i}`/`t{i}s{j}`), so the caller can hand it
// straight to `updateTaskAtRef` without this component needing to know
// anything about that scheme itself.
function TreePreview({ editedStructured, onRemove, onContentChange }) {
  const flat = flattenTasks(editedStructured);
  const rows = flat.map((t, i) => ({
    id: t.ref,
    parentId: t.parentRef || null,
    sectionId: t.sectionRef || null,
    content: t.content,
    priority: t.priority,
    due: toDue(t.due),
    completed: false,
    labels: [],
    order: i
  }));
  const childrenOf = buildChildrenMap(rows);
  const roots = rows.filter((t) => !t.parentId);
  const sections = editedStructured.sections || [];
  const noSectionRoots = roots.filter((t) => !t.sectionId);

  if (!roots.length) {
    return <p className="sr-empty">No tasks in this one.</p>;
  }

  return (
    <div className="sr-tree">
      {sections.map((s) => {
        const secRoots = roots.filter((t) => t.sectionId === s.ref);
        if (!secRoots.length) return null;
        return (
          <div key={s.ref} className="section">
            <div className="section-head-row">
              <div className="section-head">
                {s.name}
                <span className="count">{secRoots.length}</span>
              </div>
            </div>
            {secRoots.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                depth={0}
                childrenOf={childrenOf}
                editable
                onRemove={onRemove}
                onContentChange={onContentChange}
              />
            ))}
          </div>
        );
      })}
      {noSectionRoots.map((t) => (
        <TaskRow
          key={t.id}
          task={t}
          depth={0}
          childrenOf={childrenOf}
          editable
          onRemove={onRemove}
          onContentChange={onContentChange}
        />
      ))}
    </div>
  );
}

// Teaching content for the wait, not a spinner with jokes: the same ground
// the old static sr-tips list covered, cycled a few seconds at a time so a
// several-second wait has something useful in it. Keyed by index so each
// swap remounts the <p>, retriggering the plain CSS fade (.sr-loading-tip)
// rather than needing a JS animation library.
const LOADING_TIPS = [
  'Name an existing project and your tasks land there instead of a new one.',
  'Say what depends on what. Steps become sub-tasks under their parent.',
  'How you phrase urgency and dates carries through to priority and due date.'
];

function LoadingTips() {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setIndex((i) => (i + 1) % LOADING_TIPS.length), 3400);
    return () => clearInterval(id);
  }, []);
  return (
    <p key={index} className="sr-loading-tip">
      {LOADING_TIPS[index]}
    </p>
  );
}

// The Super Ramble entry point: paste or type a brain-dump, send it to
// /api/structure, review the proposed structure, and only write it on
// Confirm. Nothing reaches store.createProjectTree before that click. See
// docs/brief.md ("the model proposes, the human commits") and
// docs/llm-pipeline.md.
export default function SuperRambleModal({ onClose }) {
  const { store, projects, inboxId, bump, flash, todoistConnected } = useData();
  const { isLocal } = useAuth();

  const [text, setText] = useState('');
  const [state, setState] = useState('input'); // input | recording | loading | preview | error
  const [structured, setStructured] = useState(null);
  // `edited` is the working copy the preview actually renders and Confirm
  // actually writes: a deep clone of `structured`, seeded once per proposal,
  // mutated only through removeTask/editTaskContent/editProjectName below.
  // `structured` itself is never touched, so the trace's own persisted
  // response always reflects exactly what the model produced, edits or not.
  // `editLog` tracks removals and content edits as they happen, not by
  // diffing at Confirm time: flattenTasks's refs (`t{i}`/`t{i}s{j}`) are
  // positional, so they shift as soon as anything is removed, and a diff
  // against the shifted state could no longer tell "the task that used to
  // be at t2" from "whatever now happens to be at t2". Capturing at the
  // moment of each action sidesteps that entirely.
  const [edited, setEdited] = useState(null);
  const [editLog, setEditLog] = useState({ removedTasks: [], contentEdits: [] });
  const [errorMsg, setErrorMsg] = useState('');
  const [confirming, setConfirming] = useState(false);
  // Always defaults off, on every fresh proposal: this is a second real
  // external write, and confirm-before-write is the app's whole premise, so
  // there is no "leave it on" persisted preference. See docs/brief.md.
  const [pushToTodoist, setPushToTodoist] = useState(false);
  // traceIdRef always holds the latest callModel attempt's traceId (there can
  // be one corrective retry inside structureTranscript); traceId (state) is
  // set once structureTranscript resolves, so confirm/cancel read the trace
  // that actually produced the proposal being shown, not a stale closure.
  const traceIdRef = useRef(null);
  const [traceId, setTraceId] = useState(null);

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape' && state !== 'loading' && state !== 'recording' && !confirming) onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, state, confirming]);

  const canSubmit = text.trim().length > 0 && state !== 'loading';

  // The recorded, transcribed text lands in the same textarea state as typed
  // text, exactly like typing: appended with a blank-line separator if the
  // field already has content, replacing it if empty. Nothing auto-submits;
  // "Make tasks" behaves exactly as it does for typed input. See
  // docs/llm-pipeline.md, Stage 1.
  function handleVoiceTranscript(transcript) {
    setText((prev) => (prev.trim() ? `${prev.replace(/\s+$/, '')}\n\n${transcript}` : transcript));
  }

  // Recording gets its own full modal-body state, the same pattern loading/
  // error/preview already use, instead of a widget layered over the
  // textarea. VoiceRecorder stays mounted the whole time state is 'input' or
  // 'recording' (see its own variant prop); this only ever flips which
  // variant it renders. Guards against stomping a state the user already
  // moved past (closed, or somehow submitted) while a stray active-change
  // fires late.
  function handleVoiceActiveChange(active) {
    setState((s) => {
      if (active) return 'recording';
      return s === 'recording' ? 'input' : s;
    });
  }

  async function callModel({ transcript, existingProjects, priorErrors }) {
    const token = await getAuthToken(isLocal);
    const res = await fetch('/api/structure', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({ transcript, existingProjects, priorErrors: priorErrors || null })
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Request failed (${res.status}).`);
    }
    const body = await res.json();
    traceIdRef.current = body.traceId ?? null;
    return body.structured;
  }

  // Best-effort telemetry: records the user's own confirmed/cancelled/
  // confirmed_with_edits decision on the trace the proposal came from.
  // `edits` is only ever sent alongside "confirmed_with_edits", never
  // "confirmed" or "cancelled": a plain confirm with no edits stays exactly
  // the two-field POST it always was. Never awaited at its call site and
  // never surfaces an error; a failed outcome POST must not block or
  // interrupt the write (confirm) or the close (cancel).
  function recordOutcome(id, outcome, edits) {
    if (!id) return;
    (async () => {
      try {
        const token = await getAuthToken(isLocal);
        await fetch('/api/structure/outcome', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(token ? { authorization: `Bearer ${token}` } : {})
          },
          body: JSON.stringify({ traceId: id, outcome, ...(edits ? { edits } : {}) })
        });
      } catch {
        // Telemetry only. Silently swallowed on purpose.
      }
    })();
  }

  async function submit() {
    const transcript = text.trim();
    if (!transcript) return;
    setState('loading');
    setErrorMsg('');
    try {
      const existingProjects = projects.filter((p) => !p.isInbox).map((p) => ({ id: p.id, name: p.name }));
      const result = await structureTranscript({ transcript, existingProjects, callModel });
      setStructured(result);
      // Deep clone, not a reference: edits below must never touch `result`
      // itself, since that is exactly what gets persisted to the trace.
      // JSON.parse(JSON.stringify(...)) is sufficient here, the response is
      // already plain JSON-shaped data with no functions or dates in it.
      setEdited(JSON.parse(JSON.stringify(result)));
      setEditLog({ removedTasks: [], contentEdits: [] });
      setTraceId(traceIdRef.current);
      setState('preview');
    } catch (err) {
      setErrorMsg(
        err instanceof ContractError
          ? 'Could not build a clean structure from that, even after a retry.'
          : err.message || 'Something went wrong.'
      );
      setState('error');
    }
  }

  function backToEdit() {
    setState('input');
    setStructured(null);
    setEdited(null);
    setEditLog({ removedTasks: [], contentEdits: [] });
    setErrorMsg('');
  }

  // Removing a task removes its own sub-tasks too: they live nested inside
  // it in this shape (structured.tasks[].subtasks[]), so updateTaskAtRef's
  // splice already takes them with it, the same cascade store.deleteTask
  // gives a real task via its parentId walk, just via a different data
  // shape. Any pending content edit on the removed ref is dropped from the
  // log too, since there is no task left for it to describe.
  function removeTask(task) {
    setEdited((prev) => ({ ...prev, tasks: updateTaskAtRef(prev.tasks, task.id, () => null) }));
    setEditLog((log) => ({
      removedTasks: [...log.removedTasks, { content: task.content, priority: task.priority, sectionRef: task.sectionId ?? null }],
      contentEdits: log.contentEdits.filter((e) => e.ref !== task.id)
    }));
  }

  // `task.content` here is always the value before this keystroke: React
  // hasn't applied the state update this onChange triggers yet, so the
  // first edit on a given ref genuinely captures the untouched original.
  // Every edit after that only updates newContent, originalContent stays
  // whatever the first edit saw.
  function editTaskContent(task, newContent) {
    setEdited((prev) => ({
      ...prev,
      tasks: updateTaskAtRef(prev.tasks, task.id, (t) => ({ ...t, content: newContent }))
    }));
    setEditLog((log) => {
      const existing = log.contentEdits.find((e) => e.ref === task.id);
      if (existing) {
        return { ...log, contentEdits: log.contentEdits.map((e) => (e.ref === task.id ? { ...e, newContent } : e)) };
      }
      return { ...log, contentEdits: [...log.contentEdits, { ref: task.id, originalContent: task.content, newContent }] };
    });
  }

  function editProjectName(newName) {
    setEdited((prev) => ({ ...prev, project: { ...prev.project, name: newName } }));
  }

  // The Todoist push is a second, independent write, not sync: it runs
  // after the local write succeeds, on the same Confirm click, but its own
  // failure never rolls back or blocks the local write that already
  // landed. If the local write itself fails, nothing is attempted against
  // Todoist at all, the same fail-closed order the rest of this app follows.
  //
  // Builds from `edited`, never `structured`: anything removed is simply
  // absent from `edited.tasks` (toProjectTree needs no changes of its own
  // to honor that, it already only ever reads whatever tasks/project it is
  // given), so a removed task never reaches the local write or a Todoist
  // push. `structured` (the model's real, untouched output) is what already
  // got persisted to the trace at request time; this only ever affects what
  // gets written now and what the outcome POST below reports about it.
  async function confirm() {
    if (!edited || confirming) return;
    setConfirming(true);
    const tree = toProjectTree(edited, { inboxId });
    try {
      await store.createProjectTree(tree);
    } catch {
      setConfirming(false);
      flash('Could not save. Try Confirm again.');
      return;
    }

    let todoistError = null;
    if (pushToTodoist) {
      try {
        await createTodoistClient({ getAuthToken: () => getAuthToken(isLocal) }).createTree(tree);
      } catch (err) {
        todoistError = err.message || 'Could not push to Todoist.';
      }
    }

    await bump();
    const isNewProject = structured.decision === 'project' && !structured.targetProjectId;
    // Diffed once, here, rather than tracked incrementally like removals and
    // content edits: there is exactly one project-name field, so there is no
    // positional-ref problem for a diff to trip over.
    const projectNameChange =
      isNewProject && edited.project?.name !== structured.project?.name
        ? { from: structured.project.name, to: edited.project.name }
        : null;
    // Edits that ended up back at their original value (typed, then typed
    // back) are not worth reporting as a real edit; filtered before hasEdits
    // is computed, not after, so that case alone does not flip the outcome
    // to confirmed_with_edits with an otherwise-empty edits object.
    const contentEdits = editLog.contentEdits
      .filter((e) => e.originalContent !== e.newContent)
      .map(({ originalContent, newContent }) => ({ originalContent, newContent }));
    const hasEdits = editLog.removedTasks.length > 0 || contentEdits.length > 0 || Boolean(projectNameChange);
    if (hasEdits) {
      recordOutcome(traceId, 'confirmed_with_edits', {
        removedTasks: editLog.removedTasks,
        projectNameChange,
        contentEdits
      });
    } else {
      recordOutcome(traceId, 'confirmed');
    }
    if (todoistError) {
      flash(`Saved. Todoist push failed: ${todoistError}`);
    } else {
      flash(isNewProject ? (pushToTodoist ? 'Project created, and pushed to Todoist' : 'Project created') : 'Tasks added');
    }
    onClose();
  }

  return (
    <div
      className="overlay"
      onMouseDown={(e) => e.target === e.currentTarget && state !== 'loading' && state !== 'recording' && onClose()}
    >
      <div className="modal modal-super-ramble" role="dialog" aria-label="Super Ramble">
        {state === 'input' || state === 'recording' ? (
          <>
            <div className="modal-body sr-body">
              {/* VoiceRecorder stays mounted across both states; only its
                  variant changes. Unmounting it on the state swap would tear
                  down an active MediaRecorder/stream mid-recording. */}
              <VoiceRecorder
                variant={state === 'recording' ? 'full' : 'compact'}
                onActiveChange={handleVoiceActiveChange}
                onTranscript={handleVoiceTranscript}
                getAuthToken={() => getAuthToken(isLocal)}
              />
              {state === 'input' ? (
                <>
                  <textarea
                    autoFocus
                    className="sr-textarea"
                    placeholder="Ramble about a project, or list loose tasks. Type it, paste it, or record it, however it comes out."
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                  />
                  <ul className="sr-tips">
                    <li>Name an existing project and your tasks land there instead of a new one.</li>
                    <li>Say what depends on what. Steps become sub-tasks under their parent.</li>
                    <li>This runs on a slower, more careful model. It can take several seconds.</li>
                  </ul>
                </>
              ) : null}
            </div>
            {state === 'input' ? (
              <div className="modal-footer">
                <div className="right">
                  <button type="button" className="btn btn-ghost" onClick={() => onClose()}>
                    Cancel
                  </button>
                  <button type="button" className="btn btn-primary" disabled={!canSubmit} onClick={submit}>
                    Make tasks
                  </button>
                </div>
              </div>
            ) : null}
          </>
        ) : null}

        {state === 'loading' ? (
          <div className="modal-body sr-body">
            <p className="sr-loading">Turning what you said into tasks.</p>
            <LoadingTips />
          </div>
        ) : null}

        {state === 'error' ? (
          <>
            <div className="modal-body sr-body">
              <p className="sr-error">{errorMsg}</p>
            </div>
            <div className="modal-footer">
              <div className="right">
                <button type="button" className="btn btn-ghost" onClick={() => onClose()}>
                  Close
                </button>
                <button type="button" className="btn btn-ghost" onClick={backToEdit}>
                  Edit and try again
                </button>
              </div>
            </div>
          </>
        ) : null}

        {state === 'preview' && structured
          ? (() => {
              if (structured.needsClarification) {
                return (
                  <>
                    <div className="modal-body sr-body">
                      <p className="sr-reasoning">{structured.reasoning}</p>
                      <p className="sr-clarify">{structured.clarificationQuestion}</p>
                    </div>
                    <div className="modal-footer">
                      <div className="right">
                        <button type="button" className="btn btn-ghost" onClick={() => onClose()}>
                          Close
                        </button>
                        <button type="button" className="btn btn-ghost" onClick={backToEdit}>
                          Add more detail
                        </button>
                      </div>
                    </div>
                  </>
                );
              }
              const isNewProject = structured.decision === 'project' && !structured.targetProjectId;
              // Hidden entirely outside this one case: routing into an
              // existing project, loose tasks, and "not connected" all skip
              // a second real external write nobody asked for here. See
              // docs/roadmap.md, phase 3 part 8.
              const showTodoistToggle = isNewProject && todoistConnected;
              return (
                <>
                  <div className="modal-body sr-body sr-preview-body">
                    <p className="sr-reasoning">{structured.reasoning}</p>
                    <p className="sr-confidence">Confidence {Math.round(structured.confidence * 100)}%</p>
                    {isNewProject ? (
                      <input
                        type="text"
                        className="sr-project-name-input"
                        aria-label="Project name"
                        value={edited.project.name}
                        onChange={(e) => editProjectName(e.target.value)}
                      />
                    ) : null}
                    <TreePreview editedStructured={edited} onRemove={removeTask} onContentChange={editTaskContent} />
                  </div>
                  <div className="modal-footer">
                    {showTodoistToggle ? (
                      <label className="sr-todoist-toggle">
                        <input
                          type="checkbox"
                          checked={pushToTodoist}
                          onChange={(e) => setPushToTodoist(e.target.checked)}
                        />
                        Also create in Todoist
                      </label>
                    ) : null}
                    <div className="right">
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => {
                          recordOutcome(traceId, 'cancelled');
                          onClose();
                        }}
                      >
                        Discard
                      </button>
                      <button type="button" className="btn btn-primary" disabled={confirming} onClick={confirm}>
                        {confirming ? 'Adding...' : 'Confirm'}
                      </button>
                    </div>
                  </div>
                </>
              );
            })()
          : null}
      </div>
    </div>
  );
}
