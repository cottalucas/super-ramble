import { useState } from 'react';
import { AuthProvider, useAuth } from './auth/AuthContext.jsx';
import { AppDataProvider, useData } from './AppData.jsx';
import Sidebar from './components/Sidebar.jsx';
import QuickAddModal from './components/QuickAddModal.jsx';
import TodayView from './views/TodayView.jsx';
import UpcomingView from './views/UpcomingView.jsx';
import ProjectView from './views/ProjectView.jsx';

// The signed-in shell: sidebar plus the active view. A signed-in user lands on
// Today. See docs/roadmap.md.
function Shell() {
  const { ready, quickAdd, openAdd, closeAdd } = useData();
  const [view, setView] = useState({ type: 'today' });

  if (!ready) {
    return <div className="auth"><p>Loading your tasks.</p></div>;
  }

  return (
    <div className="app">
      <Sidebar view={view} onNavigate={setView} onAddTask={() => openAdd({})} />
      <main className="content">
        {view.type === 'today' ? <TodayView /> : null}
        {view.type === 'upcoming' ? <UpcomingView /> : null}
        {view.type === 'project' ? <ProjectView view={view} /> : null}
      </main>
      {quickAdd.open ? <QuickAddModal defaults={quickAdd.defaults} onClose={closeAdd} /> : null}
    </div>
  );
}

function Gate() {
  const { user, loading, signIn } = useAuth();

  if (loading) {
    return <div className="auth"><p>Loading.</p></div>;
  }

  if (!user) {
    return (
      <div className="auth">
        <h1>Super Ramble</h1>
        <p>Brain-dump in, structured projects out. Sign in to start.</p>
        <button type="button" className="btn btn-primary" onClick={signIn}>
          Continue with Google
        </button>
      </div>
    );
  }

  return (
    <AppDataProvider>
      <Shell />
    </AppDataProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}
