import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import api from '../api/axios';

export default function useProducts({ category, limit = 8 } = {}) {
  const [products, setProducts] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const activeRef = useRef(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (category && category !== 'discover') params.set('category', category);
      params.set('limit', String(limit));
      const res = await api.get('/products', { params });
      const data = res.data?.data;
      if (!activeRef.current) return;
      setProducts(Array.isArray(data?.products) ? data.products : []);
      setPagination(data?.pagination || null);
    } catch (err) {
      if (activeRef.current) {
        setError(err.apiMessage || 'Unable to load products.');
      }
    } finally {
      if (activeRef.current) setLoading(false);
    }
  }, [category, limit]);

  // useLayoutEffect: the reset (loading + cleared products) flushes before
  // paint, so a category switch never flashes the previous category's content.
  useLayoutEffect(() => {
    activeRef.current = true;
    setProducts([]);
    setPagination(null);
    load();
    return () => {
      activeRef.current = false;
    };
  }, [load]);

  return { products, pagination, loading, error, retry: load };
}