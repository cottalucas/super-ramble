import { useEffect, useRef, useState } from 'react';
import { useData } from '../AppData.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { structureTranscript, ContractError } from '../pipeline/structure.js';
import { toProjectTree, flattenTasks, toDue } from '../pipeline/write.js';
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
// giving TaskRow a readOnly prop (see TaskRow.jsx) and building a throwaway
// childrenOf map keyed by local refs instead of real ids. Same row rendering,
// same due/priority/indent rules, no parallel renderer.
function TreePreview({ structured }) {
  const flat = flattenTasks(structured);
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
  const sections = structured.sections || [];
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
              <TaskRow key={t.id} task={t} depth={0} childrenOf={childrenOf} readOnly />
            ))}
          </div>
        );
      })}
      {noSectionRoots.map((t) => (
        <TaskRow key={t.id} task={t} depth={0} childrenOf={childrenOf} readOnly />
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

  // Best-effort telemetry: records the user's own confirmed/cancelled
  // decision on the trace the proposal came from. Never awaited at its call
  // site and never surfaces an error; a failed outcome POST must not block
  // or interrupt the write (confirm) or the close (cancel).
  function recordOutcome(id, outcome) {
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
          body: JSON.stringify({ traceId: id, outcome })
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
    setErrorMsg('');
  }

  // The Todoist push is a second, independent write, not sync: it runs
  // after the local write succeeds, on the same Confirm click, but its own
  // failure never rolls back or blocks the local write that already
  // landed. If the local write itself fails, nothing is attempted against
  // Todoist at all, the same fail-closed order the rest of this app follows.
  async function confirm() {
    if (!structured || confirming) return;
    setConfirming(true);
    const tree = toProjectTree(structured, { inboxId });
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
    recordOutcome(traceId, 'confirmed');
    const isNewProject = structured.decision === 'project' && !structured.targetProjectId;
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
                    {isNewProject ? <h3 className="sr-project-name">{structured.project.name}</h3> : null}
                    <TreePreview structured={structured} />
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
                        Cancel
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
