import axios from 'axios';

// Single reusable API client for the whole frontend.
// The backend authenticates with a JWT in an HttpOnly cookie, so:
//  - withCredentials: true is REQUIRED so the browser sends/accepts cookies
//  - no Authorization header is ever set (no token is stored on the client)
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// The backend returns a consistent envelope:
//   success: { success, message, data }
//   error:   { success, message, code, errors, requestId, timestamp }
// This interceptor surfaces those fields on every rejected request so
// components can render backend messages without parsing raw responses.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const payload = error.response?.data;
    error.apiMessage = payload?.message || error.message || 'Something went wrong';
    error.apiCode = payload?.code;
    error.apiErrors = payload?.errors;
    error.requestId = payload?.requestId;
    return Promise.reject(error);
  }
);

// Helper: unwrap the backend envelope payload from a successful response.
// Usage: const { data } = await api.get('/products'); const products = unwrap(data);
export function unwrap(response) {
  return response?.data?.data;
}

export default api;