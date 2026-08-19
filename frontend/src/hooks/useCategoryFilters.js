import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../api/axios';
import { unwrap } from '../api/axios';

/**
 * Fetch the dynamic, category-scoped filter metadata for the sidebar from
 * GET /api/products/filters?category=<slug>. Returns the raw filters object
 * plus loading/error state and a retry.
 */
export default function useCategoryFilters(categorySlug) {
  const [filters, setFilters] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const activeRef = useRef(true);

  const load = useCallback(async () => {
    if (!categorySlug) {
      setFilters(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/products/filters', {
        params: { category: categorySlug },
      });
      if (!activeRef.current) return;
      setFilters(unwrap(res)?.filters || null);
    } catch (err) {
      if (activeRef.current) {
        setError(err.apiMessage || 'Unable to load filters.');
        setFilters(null);
      }
    } finally {
      if (activeRef.current) setLoading(false);
    }
  }, [categorySlug]);

  useEffect(() => {
    activeRef.current = true;
    setFilters(null);
    setLoading(true);
    load();
    return () => {
      activeRef.current = false;
    };
  }, [load]);

  return { filters, loading, error, retry: load };
}