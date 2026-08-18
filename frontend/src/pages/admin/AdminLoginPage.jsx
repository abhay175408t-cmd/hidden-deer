import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../../auth/AdminAuthContext';
import './AdminLoginPage.css';

// Map backend/network failures to simple, human messages (never stack traces).
function loginErrorMessage(error) {
  if (!error.response) {
    return 'Unable to connect to the server. Please try again.';
  }
  const { status } = error.response;
  if (status === 401) return 'Invalid email or password.';
  if (status === 403) return 'You do not have admin access.';
  if (status >= 500) return 'Server error. Please try again later.';
  return error.apiMessage || 'Unable to log in. Please try again.';
}

export default function AdminLoginPage() {
  const { user, loading, isAdmin, login, logout } = useAdminAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Already an authenticated admin on the login page -> straight to the
  // protected area (no reason to log in again).
  if (!loading && isAdmin) {
    return <Navigate to="/admin/dashboard" replace />;
  }

  // While the session is being restored, avoid flashing the form before the
  // redirect decision above.
  if (loading) {
    return (
      <main className="admin-login">
        <p className="admin-login__checking" role="status">
          DEER — checking session…
        </p>
      </main>
    );
  }

  // Notices for users bounced here by RequireAdmin (never shown on a plain
  // visit to /admin/login, since navigation state is not persisted).
  const bouncedNotice =
    location.state?.reason === 'not-admin'
      ? 'You do not have admin access.'
      : location.state?.reason === 'expired'
        ? 'Your admin session has expired. Please log in again.'
        : null;

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submitting) return;

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setError('Please enter your email and password.');
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      const me = await login({ email: trimmedEmail, password });

      if (me?.role === 'admin') {
        navigate('/admin/dashboard', { replace: true });
        return;
      }

      // Customer account: not allowed into the admin area. Log out so the
      // customer session is not left active from the admin login page.
      await logout();
      setError('You do not have admin access.');
    } catch (loginError) {
      setError(loginErrorMessage(loginError));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="admin-login">
      <form
        className="admin-login__card"
        onSubmit={handleSubmit}
        noValidate
        aria-label="Admin sign in"
      >
        <Link to="/" className="admin-login__brand" aria-label="DEER — back to storefront">
          DEER
        </Link>

        <p className="admin-login__eyebrow">Admin</p>
        <h1 className="admin-login__title">Sign in</h1>
        <p className="admin-login__subtitle">
          Restricted to Deer administrators.
        </p>

        {bouncedNotice && (
          <p className="admin-login__notice" role="status">
            {bouncedNotice}
          </p>
        )}

        {error && (
          <p className="admin-login__error" role="alert">
            {error}
          </p>
        )}

        <div className="admin-login__field">
          <label className="admin-login__label" htmlFor="admin-email">
            Email
          </label>
          <input
            id="admin-email"
            className="admin-login__input"
            type="email"
            name="email"
            autoComplete="email"
            placeholder="you@deer.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            autoFocus
            aria-invalid={error ? 'true' : undefined}
          />
        </div>

        <div className="admin-login__field">
          <label className="admin-login__label" htmlFor="admin-password">
            Password
          </label>
          <input
            id="admin-password"
            className="admin-login__input"
            type="password"
            name="password"
            autoComplete="current-password"
            placeholder="Your password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            aria-invalid={error ? 'true' : undefined}
          />
        </div>

        <button
          className="admin-login__submit"
          type="submit"
          disabled={submitting}
        >
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  );
}
