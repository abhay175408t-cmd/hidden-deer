import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/axios';

export default function TestPage() {
  const [apiState, setApiState] = useState({ status: 'checking' });

  useEffect(() => {
    let mounted = true;
    api
      .get('/health/ready')
      .then((res) => {
        if (mounted) setApiState({ status: 'ok', data: res.data });
      })
      .catch((err) => {
        if (mounted) {
          setApiState({ status: 'error', message: err.apiMessage || err.message });
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <main className="test-page">
      <h1>Deer Frontend is working</h1>
      <p>React + Vite + React Router + Axios are running.</p>
      <Link to="/">Back to home</Link>

      <section className="api-check">
        <h2>API connection check</h2>
        <p>API URL: {import.meta.env.VITE_API_URL || 'not set'}</p>
        {apiState.status === 'checking' && <p>Checking backend...</p>}
        {apiState.status === 'ok' && <p>Backend reachable: {JSON.stringify(apiState.data)}</p>}
        {apiState.status === 'error' && <p>Backend unreachable: {apiState.message}</p>}
      </section>
    </main>
  );
}