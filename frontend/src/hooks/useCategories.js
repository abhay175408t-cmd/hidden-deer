import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../api/axios';

export default function useCategories() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const activeRef = useRef(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/categories');
      const data = res.data?.data?.categories;
      if (!activeRef.current) return;
      setCategories(Array.isArray(data) ? data : []);
    } catch (err) {
      if (activeRef.current) {
        setError(err.apiMessage || 'Unable to load categories.');
      }
    } finally {
      if (activeRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    activeRef.current = true;
    load();
    return () => {
      activeRef.current = false;
    };
  }, [load]);

  return { categories, loading, error, retry: load };
}