import { useEffect, useState } from 'react';
import { useData } from '../AppData.jsx';
import TaskList from '../components/TaskList.jsx';
import { buildChildrenMap } from '../components/TaskRow.jsx';
import { IconPlus, IconCaret, IconInbox } from '../components/Icons.jsx';
import { colorHex } from '../lib/colors.js';

// Project view, also used for Inbox. Title, optional collapsible sections,
// tasks, and sub-tasks nested under their parent. List layout, with a clean
// seam for a Board layout later. See docs/roadmap.md.
export default function ProjectView({ view }) {
  const { store, tasks, projectById, openAdd, bump, revision } = useData();
  const project = projectById(view.projectId);

  const [sections, setSections] = useState([]);
  const [addingSection, setAddingSection] = useState(Boolean(view.addSection));
  const [sectionName, setSectionName] = useState('');

  useEffect(() => {
    if (!view.projectId) return;
    store.listSections(view.projectId).then(setSections);
  }, [store, view.projectId, revision]);

  useEffect(() => {
    setAddingSection(Boolean(view.addSection));
  }, [view.addSection, view.projectId]);

  if (!project) {
    return (
      <div className="content-inner">
        <div className="empty">
          <h3>Project not found</h3>
          <p>Pick a project from the sidebar.</p>
        </div>
      </div>
    );
  }

  const projectTasks = tasks.filter((t) => t.projectId === project.id);
  const childrenOf = buildChildrenMap(projectTasks);
  const noSectionRoots = projectTasks.filter((t) => !t.parentId && !t.sectionId);

  async function addSection() {
    const name = sectionName.trim();
    if (name) {
      await store.createSection({ projectId: project.id, name, order: sections.length });
      await bump();
    }
    setSectionName('');
    setAddingSection(false);
  }

  async function toggleCollapse(s) {
    await store.updateSection(s.id, { collapsed: !s.collapsed });
    await bump();
  }

  return (
    <div className="content-inner">
      <div className="view-header">
        {project.isInbox ? (
          <IconInbox className="icon" width={20} height={20} style={{ color: 'var(--ds-ink-soft)' }} />
        ) : (
          <span className="project-dot" style={{ background: colorHex(project.color), width: 12, height: 12 }} />
        )}
        <h1 className="view-title">{project.name}</h1>
      </div>

      <TaskList roots={noSectionRoots} childrenOf={childrenOf} />

      <button type="button" className="add-line" onClick={() => openAdd({ projectId: project.id })}>
        <span className="plus">
          <IconPlus width={14} height={14} />
        </span>
        Add task
      </button>

      {sections.map((s) => {
        const roots = projectTasks.filter((t) => !t.parentId && t.sectionId === s.id);
        return (
          <div key={s.id} className="section">
            <button type="button" className={`section-head ${s.collapsed ? 'collapsed' : ''}`} onClick={() => toggleCollapse(s)}>
              <IconCaret className="caret" width={16} height={16} />
              {s.name}
              <span className="count">{roots.length || ''}</span>
            </button>
            {!s.collapsed ? (
              <>
                <TaskList roots={roots} childrenOf={childrenOf} />
                <button type="button" className="add-line" onClick={() => openAdd({ projectId: project.id, sectionId: s.id })}>
                  <span className="plus">
                    <IconPlus width={14} height={14} />
                  </span>
                  Add task
                </button>
              </>
            ) : null}
          </div>
        );
      })}

      {addingSection ? (
        <div style={{ marginTop: 18 }}>
          <input
            autoFocus
            placeholder="Section name"
            value={sectionName}
            onChange={(e) => setSectionName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addSection()}
            onBlur={addSection}
            style={{ width: '100%', padding: '8px', border: '1px solid var(--ds-line)', borderRadius: 6, outline: 'none', fontWeight: 700 }}
          />
        </div>
      ) : (
        <button type="button" className="add-line" style={{ marginTop: 12, opacity: 0.8 }} onClick={() => setAddingSection(true)}>
          <span className="plus">
            <IconPlus width={14} height={14} />
          </span>
          Add section
        </button>
      )}
    </div>
  );
}
