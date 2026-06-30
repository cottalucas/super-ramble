import TaskRow from './TaskRow.jsx';
import { useData } from '../AppData.jsx';

// Renders a set of root tasks with their nested sub-tasks. Wires every row to
// the shared complete/delete/add-sub actions, so there is one write path.
export default function TaskList({ roots, childrenOf, showProject = false }) {
  const { completeTask, deleteTask, openAdd, projectById } = useData();
  return (
    <div className="task-list">
      {roots.map((t) => (
        <TaskRow
          key={t.id}
          task={t}
          depth={0}
          childrenOf={childrenOf}
          showProject={showProject}
          project={projectById(t.projectId)}
          onComplete={completeTask}
          onDelete={deleteTask}
          onAddSub={(parent) =>
            openAdd({ projectId: parent.projectId, parentId: parent.id, sectionId: parent.sectionId || null })
          }
        />
      ))}
    </div>
  );
}
