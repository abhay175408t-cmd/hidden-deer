import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import api from '../api/axios';

// ---------------------------------------------------------------------------
// Admin authentication state.
//
// The backend authenticates with a JWT stored in an HttpOnly cookie, so no
// token ever lives on the client (no localStorage/sessionStorage/state, no
// Authorization headers). The existing axios client sends the cookie via
// withCredentials. This context only tracks the current user + role derived
// from GET /api/auth/me and drives the admin route guard.
// ---------------------------------------------------------------------------

const AdminAuthContext = createContext(null);

export default function AdminAuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  // True when a session token was REJECTED (expired/invalid), as opposed to
  // never being present. The backend uses stable messages to distinguish the
  // two 401 cases; only the former means "you had a session and lost it".
  const [sessionExpired, setSessionExpired] = useState(false);

  // Re-read the session from the backend. Never assumes "logged out" just
  // because React state is empty — the cookie may still be valid.
  const refreshSession = useCallback(async () => {
    try {
      const res = await api.get('/auth/me');
      setSessionExpired(false);
      const me = res?.data?.user ?? null;
      setUser(me);
      return me;
    } catch (error) {
      setSessionExpired(
        error?.response?.status === 401 &&
          error.apiMessage === 'Not authorized, invalid or expired token'
      );
      setUser(null);
      return null;
    }
  }, []);

  // Restore the session once when the app mounts.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const me = await refreshSession();
        if (active) setUser(me);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [refreshSession]);

  // POST /api/auth/login, then re-check the session via /api/auth/me so the
  // role decision is always made from the authoritative backend response.
  // Falls back to the login response user if the follow-up /me hiccups.
  const login = useCallback(
    async ({ email, password }) => {
      const res = await api.post('/auth/login', { email, password });
      const loginUser = res?.data?.user ?? null;
      const me = await refreshSession();
      return me ?? loginUser;
    },
    [refreshSession]
  );

  // POST /api/auth/logout. The backend clears the HttpOnly cookie; JavaScript
  // never touches it. State is cleared regardless of the request outcome.
  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch (error) {
      // Cookie clearing is the backend's job; local state must clear anyway.
    }
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      isAuthenticated: Boolean(user),
      isAdmin: user?.role === 'admin',
      sessionExpired,
      login,
      logout,
      refreshSession,
    }),
    [user, loading, sessionExpired, login, logout, refreshSession]
  );

  return (
    <AdminAuthContext.Provider value={value}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const context = useContext(AdminAuthContext);
  if (!context) {
    throw new Error('useAdminAuth must be used within an AdminAuthProvider');
  }
  return context;
}
