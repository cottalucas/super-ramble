import { useEffect, useState } from 'react';
import { useData } from '../AppData.jsx';
import Popover from './Popover.jsx';
import { IconHash, IconInbox } from './Icons.jsx';
import { flattenProjectTree } from '../lib/projectTree.js';

// Shared project and section picker. Used by Quick-add and the task detail
// rail, so there is one project-picking experience everywhere a task can move.
//
// Real projects render depth-first and indented (flattenProjectTree), the
// same order and shape the sidebar nav already uses, so a sub-project always
// appears nested under its real parent instead of flat and indistinguishable
// from an unrelated top-level project sharing its name. See
// docs/resolution-log.md.
export default function ProjectPicker({ projectId, sectionId, onChange }) {
  const { store, projects, projectById } = useData();
  const [open, setOpen] = useState(false);
  const [sections, setSections] = useState([]);
  const project = projectById(projectId);
  const inbox = projects.find((p) => p.isInbox);
  const projectRows = flattenProjectTree(projects.filter((p) => !p.isInbox));

  useEffect(() => {
    if (!projectId) return;
    store.listSections(projectId).then(setSections);
  }, [store, projectId]);

  return (
    <div className="popover-wrap">
      <button type="button" className="chip active project-picker-trigger" onClick={() => setOpen((v) => !v)}>
        {project?.isInbox ? <IconInbox width={14} height={14} className="icon" /> : <IconHash width={14} height={14} className="icon" />}
        <span className="project-picker-label">{project ? project.name : 'Inbox'}</span>
      </button>
      {open ? (
        <Popover onClose={() => setOpen(false)}>
          {inbox ? (
            <button
              type="button"
              className="popover-item"
              onClick={() => {
                onChange({ projectId: inbox.id, sectionId: null });
                setOpen(false);
              }}
            >
              <IconInbox width={16} height={16} className="icon" />
              {inbox.name}
            </button>
          ) : null}
          {projectRows.map(({ project: p, depth }) => (
            <button
              key={p.id}
              type="button"
              className="popover-item"
              style={{ paddingLeft: 10 + depth * 16 }}
              onClick={() => {
                onChange({ projectId: p.id, sectionId: null });
                setOpen(false);
              }}
            >
              <IconHash width={16} height={16} className="icon" />
              {p.name}
            </button>
          ))}
          {sections.length ? (
            <>
              <div className="nav-section-label" style={{ padding: '8px 10px 2px' }}>
                Sections
              </div>
              {sections.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className="popover-item"
                  onClick={() => {
                    onChange({ projectId, sectionId: s.id });
                    setOpen(false);
                  }}
                >
                  {s.name}
                  <span className="when">{sectionId === s.id ? '✓' : ''}</span>
                </button>
              ))}
            </>
          ) : null}
        </Popover>
      ) : null}
    </div>
  );
}
