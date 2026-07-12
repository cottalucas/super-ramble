import { useEffect, useRef, useState } from 'react';
import { useData } from '../AppData.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import DatePicker from './DatePicker.jsx';
import PriorityPicker, { priorityClass } from './PriorityPicker.jsx';
import LabelPicker from './LabelPicker.jsx';
import ProjectPicker from './ProjectPicker.jsx';
import ConfirmDialog from './ConfirmDialog.jsx';
import Popover from './Popover.jsx';
import TaskList from './TaskList.jsx';
import { buildChildrenMap } from './TaskRow.jsx';
import { IconCheck, IconX, IconDots, IconCaret } from './Icons.jsx';
import { formatDayHeader, formatTime, relativeLabel } from '../lib/date.js';

const SAVE_DEBOUNCE_MS = 500;

function autoResize(el) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
}

// The task detail view. Opened by clicking any task row in Inbox, Today,
// Upcoming, or Project. Edits save through store.updateTask: content and
// description debounce, everything else saves on change. See docs/roadmap.md.
export default function TaskDetail({ taskId, onClose }) {
  const { store, tasks, labels, bump, flash, completeTask, deleteTask } = useData();
  const { user } = useAuth();
  const task = tasks.find((t) => t.id === taskId);

  const [content, setContent] = useState(task?.content || '');
  const [description, setDescription] = useState(task?.description || '');
  const [newSub, setNewSub] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [commentsCollapsed, setCommentsCollapsed] = useState(false);
  const contentTimer = useRef(null);
  const descTimer = useRef(null);
  const contentRef = useRef(null);
  const descRef = useRef(null);
  const commentRef = useRef(null);
  const commentSubmittingRef = useRef(false);

  useEffect(() => {
    setContent(task?.content || '');
    setDescription(task?.description || '');
    setCommentsCollapsed(false);
  }, [task?.id]);

  useEffect(() => {
    if (!task?.id) return;
    store.listComments(task.id).then(setComments);
  }, [task?.id]);

  useEffect(() => {
    autoResize(contentRef.current);
    autoResize(descRef.current);
    autoResize(commentRef.current);
  }, [task?.id, content, description, newComment]);

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!task) return null;

  const childrenOf = buildChildrenMap(tasks);
  const subtasks = childrenOf.get(task.id) || [];

  async function saveField(patch) {
    await store.updateTask(task.id, patch);
    await bump();
  }

  function onContentChange(v) {
    setContent(v);
    clearTimeout(contentTimer.current);
    contentTimer.current = setTimeout(() => saveField({ content: v }), SAVE_DEBOUNCE_MS);
  }

  function onDescriptionChange(v) {
    setDescription(v);
    clearTimeout(descTimer.current);
    descTimer.current = setTimeout(() => saveField({ description: v }), SAVE_DEBOUNCE_MS);
  }

  async function addSubtask() {
    const c = newSub.trim();
    if (!c) return;
    await store.createTask({
      projectId: task.projectId,
      sectionId: task.sectionId,
      parentId: task.id,
      content: c,
      description: '',
      priority: 4,
      due: null,
      labels: []
    });
    setNewSub('');
    await bump();
  }

  // commentSubmittingRef, not just clearing newComment before the await:
  // a ref mutation is a plain synchronous assignment, visible to every call
  // that reads it immediately, including a second call fired from the very
  // same synchronous burst of keydown events before React has re-rendered
  // (verified live: rapid, back-to-back Enter keydowns all fire against the
  // same render's closure before any state update commits, so a version of
  // this fix that only cleared newComment via setState let all of them
  // through, since every closure still read the pre-clear value; five rapid
  // Enters posted five identical comments). The ref catches that case
  // directly: the first call sets it true before its own await starts,
  // every call after it, however tightly bunched, sees true immediately and
  // bails, no render needed in between.
  async function addComment() {
    const c = newComment.trim();
    if (!c || commentSubmittingRef.current) return;
    commentSubmittingRef.current = true;
    setNewComment('');
    try {
      await store.createComment({ taskId: task.id, content: c });
      setComments(await store.listComments(task.id));
    } finally {
      commentSubmittingRef.current = false;
    }
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-detail" role="dialog" aria-label="Task detail">
        <div className="detail-header-actions">
          <span className="popover-wrap">
            <button type="button" className="icon-btn" title="Task options" onClick={() => setMenuOpen((v) => !v)}>
              <IconDots width={15} height={15} />
            </button>
            {menuOpen ? (
              <Popover onClose={() => setMenuOpen(false)}>
                <button
                  type="button"
                  className="popover-item popover-item-danger"
                  onClick={() => {
                    setMenuOpen(false);
                    setConfirmDelete(true);
                  }}
                >
                  Delete task
                </button>
              </Popover>
            ) : null}
          </span>
          <button type="button" className="detail-close" onClick={onClose} aria-label="Close">
            <IconX width={16} height={16} />
          </button>
        </div>

        <div className="detail-body">
          <div className="detail-main">
            <div className="detail-head">
              <button
                type="button"
                className={`checkbox ${priorityClass(task.priority)}`}
                aria-label="Complete task"
                onClick={() => completeTask(task)}
              >
                <IconCheck className="check" />
              </button>
              <textarea
                ref={contentRef}
                className="detail-content"
                rows={1}
                value={content}
                onChange={(e) => onContentChange(e.target.value)}
              />
            </div>

            <textarea
              ref={descRef}
              className="modal-desc detail-desc"
              placeholder="Description"
              rows={2}
              value={description}
              onChange={(e) => onDescriptionChange(e.target.value)}
            />

            {subtasks.length ? <TaskList roots={subtasks} childrenOf={childrenOf} /> : null}

            <div className="add-line detail-add-sub">
              <input
                placeholder="Add sub-task"
                value={newSub}
                onChange={(e) => setNewSub(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addSubtask()}
              />
            </div>

            {comments.length ? (
              <>
                <button
                  type="button"
                  className="comment-header"
                  onClick={() => setCommentsCollapsed((v) => !v)}
                >
                  <IconCaret width={14} height={14} style={{ transform: commentsCollapsed ? 'rotate(-90deg)' : 'none' }} />
                  Comments {comments.length}
                </button>
                {!commentsCollapsed ? (
                  <div className="comment-list">
                    {comments.map((c) => (
                      <div className="comment-row" key={c.id}>
                        <span className="comment-avatar">{(user.displayName || 'You').slice(0, 1).toUpperCase()}</span>
                        <div className="comment-body">
                          <div>{c.content}</div>
                          <div className="comment-meta">
                            {[relativeLabel(c.postedAt.slice(0, 10)), formatTime(new Date(c.postedAt))]
                              .filter(Boolean)
                              .join(' ')}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </>
            ) : null}

            <div className="comment-add">
              <span className="comment-avatar">{(user.displayName || 'You').slice(0, 1).toUpperCase()}</span>
              <div className="comment-add-box">
                <textarea
                  ref={commentRef}
                  rows={1}
                  placeholder="Comment"
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      addComment();
                    }
                  }}
                />
                {newComment.trim() ? (
                  <div className="comment-add-actions">
                    <button type="button" className="btn btn-ghost" onClick={() => setNewComment('')}>
                      Cancel
                    </button>
                    <button type="button" className="btn btn-primary" onClick={addComment}>
                      Comment
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="detail-rail">
            <div className="detail-field">
              <span className="detail-field-label">Project</span>
              <ProjectPicker
                projectId={task.projectId}
                sectionId={task.sectionId}
                onChange={({ projectId, sectionId }) => saveField({ projectId, sectionId })}
              />
            </div>
            <div className="detail-field">
              <span className="detail-field-label">Date</span>
              <DatePicker value={task.due} onChange={(due) => saveField({ due })} />
            </div>
            <div className="detail-field">
              <span className="detail-field-label">Priority</span>
              <PriorityPicker value={task.priority} onChange={(priority) => saveField({ priority })} />
            </div>
            <div className="detail-field">
              <span className="detail-field-label">Labels</span>
              <LabelPicker
                value={task.labels || []}
                labels={labels}
                onChange={(next) => saveField({ labels: next })}
                onCreateLabel={async (name) => {
                  await store.createLabel({ name });
                  await bump();
                }}
                onDeleteLabel={async (id) => {
                  await store.deleteLabel(id);
                  await bump();
                }}
              />
            </div>
            <hr className="detail-rail-divider" />

            <div className="detail-meta">
              <div className="detail-meta-line">
                Added {formatDayHeader(task.createdAt)}, {formatTime(new Date(task.createdAt))}
              </div>
              {task.updatedAt && task.updatedAt !== task.createdAt ? (
                <div className="detail-meta-line">
                  Updated {formatDayHeader(task.updatedAt)}, {formatTime(new Date(task.updatedAt))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {confirmDelete ? (
        <ConfirmDialog
          title={`Delete "${task.content}"?`}
          message={subtasks.length ? `This removes ${subtasks.length} sub-task${subtasks.length > 1 ? 's' : ''} too.` : undefined}
          confirmLabel="Delete task"
          onConfirm={async () => {
            setConfirmDelete(false);
            onClose();
            await deleteTask(task);
            flash('Task deleted');
          }}
          onCancel={() => setConfirmDelete(false)}
        />
      ) : null}
    </div>
  );
}
