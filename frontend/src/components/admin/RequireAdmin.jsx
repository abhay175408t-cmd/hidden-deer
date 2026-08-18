import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAdminAuth } from '../../auth/AdminAuthContext';
import './RequireAdmin.css';

// ---------------------------------------------------------------------------
// Admin route guard.
//
// - While the session is being restored (/api/auth/me) show a checking state
//   so we never flash protected content or mis-redirect.
// - Admin  -> render the protected outlet.
// - Other  -> bounce to /admin/login with a reason so the login page can
//             explain: authenticated customers ("no admin access"), users
//             whose token was rejected ("session expired"). Plain visitors
//             just get the login form.
//
// This is a UX layer only. Real authorization is enforced by the backend
// adminOnly middleware.
// ---------------------------------------------------------------------------

export default function RequireAdmin() {
  const { user, loading, isAdmin, sessionExpired } = useAdminAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="admin-guard" role="status" aria-live="polite">
        <span className="admin-guard__brand">DEER</span>
        <span className="admin-guard__message">Checking session…</span>
      </div>
    );
  }

  if (!isAdmin) {
    const reason = user
      ? 'not-admin'
      : sessionExpired
        ? 'expired'
        : null;
    const state = { from: location.pathname, reason };
    return <Navigate to="/admin/login" replace state={state} />;
  }

  return <Outlet />;
}
