import { useAdminAuth } from '../../auth/AdminAuthContext';
import './AdminPlaceholderPage.css';

// Temporary protected placeholder for /admin and /admin/dashboard. Exists only
// to prove route protection works; the real Admin Layout (A2) and Dashboard
// (A3) replace this in later phases.
export default function AdminPlaceholderPage() {
  const { user, logout } = useAdminAuth();

  const handleLogout = async () => {
    await logout();
    // state clears in the context; RequireAdmin redirects to /admin/login
  };

  return (
    <main className="admin-placeholder">
      <span className="admin-placeholder__brand">HIDDEN DEER</span>
      <h1 className="admin-placeholder__title">
        Admin Dashboard — Coming in A2/A3
      </h1>
      {user && (
        <p className="admin-placeholder__user">
          Signed in as {user.name} ({user.email})
        </p>
      )}
      <button
        type="button"
        className="admin-placeholder__logout"
        onClick={handleLogout}
      >
        Sign out
      </button>
    </main>
  );
}
