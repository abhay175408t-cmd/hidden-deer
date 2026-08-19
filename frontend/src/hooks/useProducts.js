import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import api from '../api/axios';
import { buildProductParams, serializeFilters } from '../lib/productQuery';

const EMPTY_FILTERS = {};

/**
 * One-shot product fetch for a category + filter state. Returns the first
 * page plus pagination info. For scroll-based loading use useInfiniteProducts.
 */
export default function useProducts({ category, filters = EMPTY_FILTERS, sort = 'newest', limit = 8 } = {}) {
  const [products, setProducts] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const activeRef = useRef(true);
  const paramsRef = useRef({ category, filters, sort, limit });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { category, filters, sort, limit } = paramsRef.current;
      const params = buildProductParams({ category, filters, sort, limit });
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
  }, []);

  // Content-based signature: a freshly-created-but-identical filters object
  // (e.g. a default {} built each render) must not retrigger a reload.
  const signature = useMemo(
    () => [category, sort, limit, JSON.stringify(serializeFilters(filters))].join('\u0000'),
    [category, sort, limit, filters]
  );

  // useLayoutEffect: the reset (loading + cleared products) flushes before
  // paint, so a filter/category switch never flashes stale content.
  useLayoutEffect(() => {
    paramsRef.current = { category, filters, sort, limit };
    activeRef.current = true;
    setProducts([]);
    setPagination(null);
    load();
    return () => {
      activeRef.current = false;
    };
  }, [signature, load]);

  return { products, pagination, loading, error, retry: load };
}