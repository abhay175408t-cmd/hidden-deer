import { useAdminAuth } from '../../auth/AdminAuthContext';
import './AdminSettingsPage.css';

function shortId(value) {
  if (!value) return '—';
  return value.length > 12 ? `${value.slice(0, 12)}…` : value;
}

function AdminSettingsPage() {
  const { user } = useAdminAuth();

  const apiBaseUrl =
    import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
  const environment = import.meta.env.PROD ? 'Production' : 'Development';

  return (
    <section className="admin-settings" aria-labelledby="admin-settings-heading">
      <div className="admin-settings__header">
        <h1 id="admin-settings-heading" className="admin-settings__title">
          Settings
        </h1>
      </div>

      <div className="admin-settings__section">
        <h2 className="admin-settings__section-title">Admin profile</h2>
        <p className="admin-settings__section-note">
          Read-only information from the authenticated session (
          <code className="admin-settings__code">GET /auth/me</code>). The
          backend exposes no profile update endpoint.
        </p>
        <dl className="admin-settings__list">
          <div className="admin-settings__row">
            <dt>Name</dt>
            <dd>{user?.name || '—'}</dd>
          </div>
          <div className="admin-settings__row">
            <dt>Email</dt>
            <dd>{user?.email || '—'}</dd>
          </div>
          <div className="admin-settings__row">
            <dt>Role</dt>
            <dd>
              <span className="admin-settings__role">
                {user?.role ? 'Administrator' : '—'}
              </span>
            </dd>
          </div>
          <div className="admin-settings__row">
            <dt>Admin ID</dt>
            <dd>
              <span
                className="admin-settings__mono"
                title={user?.id}
              >
                {shortId(user?.id)}
              </span>
            </dd>
          </div>
        </dl>
      </div>

      <div className="admin-settings__section">
        <h2 className="admin-settings__section-title">System</h2>
        <p className="admin-settings__section-note">
          Non-sensitive runtime information only. No secrets are displayed.
        </p>
        <dl className="admin-settings__list">
          <div className="admin-settings__row">
            <dt>API endpoint</dt>
            <dd>
              <span className="admin-settings__mono">{apiBaseUrl}</span>
            </dd>
          </div>
          <div className="admin-settings__row">
            <dt>Build</dt>
            <dd>{environment}</dd>
          </div>
          <div className="admin-settings__row">
            <dt>Session</dt>
            <dd>HttpOnly cookie — no token is stored in the browser</dd>
          </div>
        </dl>
      </div>

      <div className="admin-settings__section">
        <h2 className="admin-settings__section-title">Not available</h2>
        <p className="admin-settings__section-note">
          The backend exposes no endpoint for these, so no controls are shown
          instead of fake ones:
        </p>
        <ul className="admin-settings__unavailable">
          <li>Edit profile / update admin name or email</li>
          <li>Change password</li>
          <li>Admin notification preferences</li>
          <li>Store configuration (name, currency, tax, shipping, logo)</li>
        </ul>
      </div>
    </section>
  );
}

export default AdminSettingsPage;