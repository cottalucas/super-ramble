import { useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { useData } from '../AppData.jsx';
import ConfirmDialog from './ConfirmDialog.jsx';
import { getTheme, setTheme } from '../lib/theme.js';
import { getAuthToken } from '../lib/authToken.js';
import { beginTodoistConnect, disconnectTodoist } from '../todoist/index.js';

const SECTIONS = [
  { key: 'account', label: 'Account' },
  { key: 'theme', label: 'Theme' },
  { key: 'todoist', label: 'Todoist' }
];

// Settings: a two-pane layout, a category list on the left (Account, Theme,
// Todoist) and the selected category's detail on the right, matching a real
// settings screen's chrome instead of one long stacked list. Each category's
// own content (fields, order, isLocal branches, ConfirmDialog flows) is
// unchanged from before this pass; only which one is visible, and the
// chrome around it, changed. See docs/roadmap.md (Phase 2.7, phase 3 part
// 8, phase 2.8 part 2) and docs/resolution-log.md, 2026-07-10.
export default function SettingsModal({ onClose }) {
  const { user, isLocal } = useAuth();
  const { todoistConnected, refreshTodoistStatus } = useData();
  const [activeSection, setActiveSection] = useState('account');
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [theme, setThemeState] = useState(getTheme());
  const [todoistBusy, setTodoistBusy] = useState(false);
  const [todoistError, setTodoistError] = useState('');

  function chooseTheme(next) {
    setTheme(next);
    setThemeState(next);
  }

  async function doDisconnectTodoist() {
    setConfirmDisconnect(false);
    setTodoistBusy(true);
    setTodoistError('');
    try {
      await disconnectTodoist(() => getAuthToken(isLocal));
      await refreshTodoistStatus();
    } catch (err) {
      setTodoistError(err.message || 'Could not disconnect. Try again.');
    } finally {
      setTodoistBusy(false);
    }
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal settings-modal" role="dialog" aria-label="Settings">
        <div className="modal-body settings-body">
          <nav className="settings-nav">
            {SECTIONS.map((s) => (
              <button
                key={s.key}
                type="button"
                className={`settings-nav-item ${activeSection === s.key ? 'active' : ''}`}
                onClick={() => setActiveSection(s.key)}
              >
                {s.label}
              </button>
            ))}
          </nav>

          <div className="settings-detail">
          {activeSection === 'account' ? (
          <section className="settings-section">
            <h3 className="settings-heading">Account</h3>
            {isLocal ? (
              <p className="settings-note">Local preview. No Google account is signed in.</p>
            ) : (
              <>
                <div className="settings-row">
                  <span className="settings-label">Name</span>
                  <span className="settings-value">{user.displayName || 'Not set'}</span>
                </div>
                <div className="settings-row">
                  <span className="settings-label">Email</span>
                  <span className="settings-value">{user.email}</span>
                </div>
              </>
            )}
          </section>
          ) : null}

          {activeSection === 'theme' ? (
          <section className="settings-section">
            <h3 className="settings-heading">Theme</h3>
            <div className="settings-row">
              <span className="settings-label">Appearance</span>
              <div className="settings-theme-toggle">
                <button
                  type="button"
                  className={`chip ${theme === 'light' ? 'active' : ''}`}
                  onClick={() => chooseTheme('light')}
                >
                  Light
                </button>
                <button
                  type="button"
                  className={`chip ${theme === 'dark' ? 'active' : ''}`}
                  onClick={() => chooseTheme('dark')}
                >
                  Dark
                </button>
              </div>
            </div>
          </section>
          ) : null}

          {activeSection === 'todoist' ? (
          <section className="settings-section">
            <h3 className="settings-heading">Todoist</h3>
            {isLocal ? (
              <p className="settings-note">Local preview. Todoist connect needs a real signed-in account.</p>
            ) : (
              <>
                <div className="settings-row settings-row-inline">
                  <div>
                    <span className="settings-label">Status</span>
                    <span className="settings-value">{todoistConnected ? 'Connected' : 'Not connected'}</span>
                  </div>
                  {todoistConnected ? (
                    <button
                      type="button"
                      className="btn btn-quiet"
                      disabled={todoistBusy}
                      onClick={() => setConfirmDisconnect(true)}
                    >
                      Disconnect
                    </button>
                  ) : (
                    <button type="button" className="btn btn-quiet" disabled={todoistBusy} onClick={beginTodoistConnect}>
                      Connect Todoist
                    </button>
                  )}
                </div>
                <p className="settings-note">
                  {todoistConnected
                    ? 'This does not sync. When you confirm a new project in Super Ramble, you can also push it once into your real Todoist account, on a toggle you choose each time.'
                    : 'Connect your real Todoist account. This does not sync anything automatically: when you confirm a new project in Super Ramble, you get the option to also push it once into Todoist, on your explicit choice each time.'}
                </p>
              </>
            )}
            {todoistError ? <p className="settings-note settings-error">{todoistError}</p> : null}
          </section>
          ) : null}
          </div>
        </div>

        <div className="modal-footer">
          <div className="right">
            <button type="button" className="btn btn-primary" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      </div>

      {confirmDisconnect ? (
        <ConfirmDialog
          title="Disconnect Todoist?"
          message="Super Ramble forgets the stored connection and revokes it with Todoist. Tasks already pushed stay in your Todoist account; reconnect any time to push again."
          confirmLabel="Disconnect"
          onConfirm={doDisconnectTodoist}
          onCancel={() => setConfirmDisconnect(false)}
        />
      ) : null}
    </div>
  );
}
