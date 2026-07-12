import { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './auth/AuthContext.jsx';
import { AppDataProvider, useData } from './AppData.jsx';
import Sidebar from './components/Sidebar.jsx';
import QuickAddModal from './components/QuickAddModal.jsx';
import TaskDetail from './components/TaskDetail.jsx';
import TodayView from './views/TodayView.jsx';
import UpcomingView from './views/UpcomingView.jsx';
import ProjectView from './views/ProjectView.jsx';
import { IconSidebarToggle, IconMic, IconSparkle, IconCheck } from './components/Icons.jsx';
import { getSidebarHidden, setSidebarHidden } from './lib/sidebar.js';
import { getView, setView as persistView } from './lib/view.js';
import { getAuthToken } from './lib/authToken.js';
import { hasTodoistOAuthReturn, consumeTodoistOAuthReturn, exchangeTodoistCode } from './todoist/index.js';

// Below this width the sidebar can't sit as a fixed-width flex sibling
// without squeezing the content column unusably; it becomes an overlay
// instead. See docs/design-system.md's "Responsive" section.
const PHONE_BREAKPOINT_QUERY = '(max-width: 640px)';

// The signed-in shell: sidebar plus the active view. A signed-in user lands on
// whichever view they had open at their last visit, restored from
// localStorage the same way theme and layout survive a refresh; a fresh
// visitor lands on Today, the stored default. The sidebar's visibility is a
// persisted preference too; hiding it gives the content column full width.
// See docs/roadmap.md (Phase 2.8).
//
// That persisted preference is a desktop choice and must survive a phone
// visit unchanged: at phone width the sidebar becomes a closed-by-default
// overlay instead, tracked by its own in-memory mobileOpen state, never
// written to localStorage. isPhone and mobileOpen together decide how the
// sidebar renders; sidebarHidden alone still decides it at every other
// width, exactly as before.
function Shell() {
  const { ready, projectById, quickAdd, closeAdd, taskDetailId, closeTaskDetail, flash, refreshTodoistStatus } = useData();
  const { isLocal } = useAuth();
  const [view, setViewState] = useState(() => getView());
  const [sidebarHidden, setSidebarHiddenState] = useState(() => getSidebarHidden());
  const [isPhone, setIsPhone] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(PHONE_BREAKPOINT_QUERY).matches
  );
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(PHONE_BREAKPOINT_QUERY);
    function onChange(e) {
      setIsPhone(e.matches);
    }
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  // The app has no client-side router, so the Todoist OAuth redirect lands
  // back on this same root URL with either ?code&state (approved) or
  // ?error=...&state (declined, or Todoist itself rejected the authorize
  // request) in the query string. Check once on mount, not tied to `ready`:
  // consumeTodoistOAuthReturn strips the query params synchronously the
  // moment it runs, so a refresh (or StrictMode's double effect firing in
  // dev) never re-triggers anything. Skipped entirely in local preview,
  // which has no real Firebase Auth token to send. See docs/architecture.md
  // and src/todoist/index.js.
  //
  // Three distinct outcomes get three distinct, honest messages, not one
  // generic "Todoist denied" for all of them (the actual reported bug: a
  // failure in *our own* exchange call was surfacing as if the user had
  // declined). A real decline (error=access_denied) is the only case that
  // says anything about what the user did; everything else describes what
  // this app or Todoist failed to do.
  useEffect(() => {
    if (isLocal || !hasTodoistOAuthReturn()) return;
    const result = consumeTodoistOAuthReturn();
    if (!result) {
      flash('Could not connect Todoist. Try Connect again from Settings.');
      return;
    }
    if (result.error) {
      flash(
        result.error === 'access_denied'
          ? "Todoist connection cancelled. You didn't approve it."
          : 'Could not connect Todoist. Try again from Settings.'
      );
      return;
    }
    (async () => {
      try {
        await exchangeTodoistCode(result.code, () => getAuthToken(isLocal));
        await refreshTodoistStatus();
        flash('Todoist connected.');
      } catch (err) {
        flash(err.message || 'Connecting to Todoist failed. Try again.');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isPhone || !mobileOpen) return;
    function onKey(e) {
      if (e.key === 'Escape') setMobileOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isPhone, mobileOpen]);

  // A restored view can point at a project deleted since the last visit;
  // once data is ready, check and fall back to Today rather than showing a
  // broken view. Not routing: there is no URL to validate, just the one
  // stored preference.
  useEffect(() => {
    if (!ready) return;
    if (view.type === 'project' && !projectById(view.projectId)) {
      navigate({ type: 'today' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  function navigate(next) {
    setViewState(next);
    persistView(next);
  }

  if (!ready) {
    return <div className="auth"><p>Loading your tasks.</p></div>;
  }

  // On a phone, "toggle" only ever flips the in-memory overlay; the
  // persisted desktop preference is untouched. Off a phone, it's the
  // existing persisted show/hide.
  function toggleSidebar() {
    if (isPhone) {
      setMobileOpen((v) => !v);
      return;
    }
    const next = !sidebarHidden;
    setSidebarHidden(next);
    setSidebarHiddenState(next);
  }

  function navigateAndCloseMobile(next) {
    navigate(next);
    if (isPhone) setMobileOpen(false);
  }

  const sidebarVisible = isPhone ? mobileOpen : !sidebarHidden;

  return (
    <div className="app">
      {!sidebarVisible ? (
        <button type="button" className="sidebar-reveal" title="Show sidebar" onClick={toggleSidebar}>
          <IconSidebarToggle width={18} height={18} />
        </button>
      ) : (
        <>
          {isPhone ? <div className="sidebar-backdrop" onClick={() => setMobileOpen(false)} /> : null}
          <Sidebar
            view={view}
            onNavigate={isPhone ? navigateAndCloseMobile : navigate}
            onToggleSidebar={toggleSidebar}
            mobile={isPhone}
          />
        </>
      )}
      <main className="content">
        {view.type === 'today' ? <TodayView /> : null}
        {view.type === 'upcoming' ? <UpcomingView /> : null}
        {view.type === 'project' ? <ProjectView view={view} /> : null}
      </main>
      {quickAdd.open ? <QuickAddModal defaults={quickAdd.defaults} onClose={closeAdd} /> : null}
      {taskDetailId ? <TaskDetail taskId={taskDetailId} onClose={closeTaskDetail} /> : null}
    </div>
  );
}

// Maps a Firebase Auth error code to a plain, specific line instead of
// dumping the raw error object on screen. Unknown codes fall back to one
// generic line rather than exposing SDK internals. See
// docs/design-system.md's "Landing / signed-out gate" section.
function authErrorMessage(err) {
  const code = err?.code || '';
  if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') return 'Wrong email or password.';
  if (code === 'auth/user-not-found') return 'No account with that email.';
  if (code === 'auth/email-already-in-use') return 'An account with that email already exists.';
  if (code === 'auth/weak-password') return 'Choose a password with at least 6 characters.';
  if (code === 'auth/invalid-email') return "That email address doesn't look right.";
  if (code === 'auth/operation-not-allowed') return 'Email sign-in is not turned on yet. Use Google for now.';
  return 'Something went wrong. Try again.';
}

function Gate() {
  const { user, loading, signIn, signInWithEmail, signUpWithEmail, resetPassword } = useAuth();
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [resetSent, setResetSent] = useState(false);
  const [busy, setBusy] = useState(false);

  if (loading) {
    return <div className="auth"><p>Loading.</p></div>;
  }

  if (!user) {
    function switchMode(next) {
      setMode(next);
      setError('');
      setResetSent(false);
    }

    async function onSubmit(e) {
      e.preventDefault();
      setError('');
      setResetSent(false);
      if (mode === 'signup' && password !== confirmPassword) {
        setError("Passwords don't match.");
        return;
      }
      setBusy(true);
      try {
        if (mode === 'login') await signInWithEmail(email, password);
        else await signUpWithEmail(email, password);
      } catch (err) {
        setError(authErrorMessage(err));
      } finally {
        setBusy(false);
      }
    }

    async function onForgotPassword() {
      setError('');
      setResetSent(false);
      if (!email) {
        setError('Enter your email above first.');
        return;
      }
      setBusy(true);
      try {
        await resetPassword(email);
        setResetSent(true);
      } catch (err) {
        setError(authErrorMessage(err));
      } finally {
        setBusy(false);
      }
    }

    return (
      <div className="landing">
        <div className="landing-signin">
          <span className="landing-wordmark">Super Ramble</span>
          <p className="landing-signin-lede">
            {mode === 'login' ? 'Sign in to pick up where you left off.' : 'Set up your account to get started.'}
          </p>

          <div className="landing-signin-card">
            <button type="button" className="btn btn-primary landing-google-btn" onClick={signIn}>
              Continue with Google
            </button>

            <div className="landing-divider">
              <span>or</span>
            </div>

            <form className="landing-form" onSubmit={onSubmit}>
              <input
                type="email"
                className="form-input"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
              <input
                type="password"
                className="form-input"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                required
              />
              {mode === 'signup' ? (
                <input
                  type="password"
                  className="form-input"
                  placeholder="Confirm password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                />
              ) : null}

              {mode === 'login' ? (
                <button type="button" className="landing-forgot" onClick={onForgotPassword} disabled={busy}>
                  Forgot your password?
                </button>
              ) : null}

              {error ? <p className="landing-form-error">{error}</p> : null}
              {resetSent ? <p className="landing-form-note">Check your email for a reset link.</p> : null}

              <button type="submit" className="btn btn-primary" disabled={busy}>
                {mode === 'login' ? 'Log in' : 'Sign up'}
              </button>
            </form>

            <button type="button" className="landing-toggle-mode" onClick={() => switchMode(mode === 'login' ? 'signup' : 'login')}>
              {mode === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Log in'}
            </button>
          </div>

          <p className="landing-footer">
            Built by{' '}
            <a href="https://lucascotta.ch" target="_blank" rel="noreferrer">
              Lucas Cotta
            </a>
          </p>
        </div>

        <div className="landing-value">
          <p className="landing-lede">
            Capturing tasks is solved. A brain-dump turns into separate tasks fast. But a brain-dump is
            often a project waiting to be structured, not a flat list, and building that structure by hand
            still takes real effort.
          </p>
          <p className="landing-lede">
            Super Ramble reads your ramble against your own projects, decides whether it is loose tasks or
            a full project, and proposes a scaffold: sections, tasks, and sub-tasks, with priorities and
            dates filled in. You review it and confirm. Nothing writes until you do.
          </p>
          <div className="landing-accent" aria-hidden="true">
            <span className="landing-accent-icon landing-accent-1">
              <IconMic width={26} height={26} />
            </span>
            <span className="landing-accent-arrow">&rarr;</span>
            <span className="landing-accent-icon landing-accent-2">
              <IconSparkle width={26} height={26} />
            </span>
            <span className="landing-accent-arrow">&rarr;</span>
            <span className="landing-accent-icon landing-accent-3">
              <IconCheck width={26} height={26} />
            </span>
          </div>
        </div>
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
