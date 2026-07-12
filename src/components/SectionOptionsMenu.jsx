import { useState } from 'react';
import { useData } from '../AppData.jsx';
import Popover from './Popover.jsx';
import { IconDots, IconHash, IconInbox } from './Icons.jsx';
import { flattenProjectTree } from '../lib/projectTree.js';

// A section's own options menu: Edit, Move to a different project, Delete.
// Used by both List layout's section head (ProjectView.jsx) and Board
// layout's column head (Board.jsx), so a section gets the same menu
// regardless of which layout is showing it. Reported directly against a
// live screenshot: the menu only had Delete before this; Edit and Move to
// were missing. See docs/resolution-log.md.
//
// "Move to..." swaps the popover's own content to a project list instead of
// opening a second, nested Popover: simpler than anchoring a submenu, and
// this menu is small enough that one panel swapping content reads fine.
// Mirrors ProjectPicker's project list (Inbox first, then every other real
// project depth-first via flattenProjectTree), minus the section list,
// since a section cannot itself contain a section, and minus the picker's
// own project (moving a section to the project it is already in is a no-op,
// not a real option).
export default function SectionOptionsMenu({ section, onEdit, onMoveTo, onDelete }) {
  const { projects } = useData();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState('menu');

  function close() {
    setOpen(false);
    setMode('menu');
  }

  const inbox = projects.find((p) => p.isInbox);
  const projectRows = flattenProjectTree(projects.filter((p) => !p.isInbox)).filter(
    ({ project }) => project.id !== section.projectId
  );
  const hasTargets = (inbox && inbox.id !== section.projectId) || projectRows.length > 0;

  return (
    <span className="popover-wrap section-menu">
      <button type="button" className="icon-btn" title="Section options" onClick={() => setOpen((v) => !v)}>
        <IconDots width={15} height={15} />
      </button>
      {open ? (
        <Popover onClose={close}>
          {mode === 'menu' ? (
            <>
              <button
                type="button"
                className="popover-item"
                onClick={() => {
                  close();
                  onEdit(section);
                }}
              >
                Edit
              </button>
              <button type="button" className="popover-item" onClick={() => setMode('move')}>
                Move to...
              </button>
              <button
                type="button"
                className="popover-item popover-item-danger"
                onClick={() => {
                  close();
                  onDelete(section);
                }}
              >
                Delete section
              </button>
            </>
          ) : (
            <>
              <button type="button" className="popover-item" onClick={() => setMode('menu')}>
                &lsaquo; Back
              </button>
              {inbox && inbox.id !== section.projectId ? (
                <button
                  type="button"
                  className="popover-item"
                  onClick={() => {
                    close();
                    onMoveTo(section, inbox.id);
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
                    close();
                    onMoveTo(section, p.id);
                  }}
                >
                  <IconHash width={16} height={16} className="icon" />
                  {p.name}
                </button>
              ))}
              {!hasTargets ? (
                <div className="popover-item" style={{ opacity: 0.6, cursor: 'default' }}>
                  No other projects
                </div>
              ) : null}
            </>
          )}
        </Popover>
      ) : null}
    </span>
  );
}
