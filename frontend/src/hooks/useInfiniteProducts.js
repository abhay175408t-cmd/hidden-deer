import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import api from '../api/axios';

/**
 * Paginated product fetching with scroll-based lazy loading.
 *
 * Loads the first batch immediately; further batches load as a sentinel
 * element (ref via `sentinelRef`) approaches the viewport. Products are
 * appended, never replaced, while the filter (category) stays the same.
 *
 * Uses only backend-supported params: page, limit, category, sort.
 */
const BATCH_SIZE = 8;

export default function useInfiniteProducts({ category, sort = 'newest' } = {}) {
  const [products, setProducts] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const sentinelRef = useRef(null);
  const activeRef = useRef(true);
  const busyRef = useRef(false);

  const loadPage = useCallback(
    async (page, append) => {
      if (busyRef.current && append) return;
      busyRef.current = true;
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
        setError(null);
      }
      try {
        const params = new URLSearchParams();
        if (category && category !== 'discover') params.set('category', category);
        params.set('page', String(page));
        params.set('limit', String(BATCH_SIZE));
        params.set('sort', sort);
        const res = await api.get('/products', { params });
        const data = res.data?.data;
        if (!activeRef.current) return;
        const items = Array.isArray(data?.products) ? data.products : [];
        setProducts((prev) => (append ? [...prev, ...items] : items));
        setPagination(data?.pagination || null);
      } catch (err) {
        if (activeRef.current) {
          setError(err.apiMessage || 'Unable to load products.');
        }
      } finally {
        busyRef.current = false;
        if (activeRef.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [category, sort]
  );

  // Reset + first batch. useLayoutEffect flushes the reset before paint so a
  // category switch never flashes the previous category's products.
  useLayoutEffect(() => {
    activeRef.current = true;
    busyRef.current = false;
    setProducts([]);
    setPagination(null);
    loadPage(1, false);
    return () => {
      activeRef.current = false;
    };
  }, [loadPage]);

  // Scroll-based lazy loading: fetch the next batch when the sentinel nears.
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return undefined;
    const node = sentinelRef.current;
    if (!node) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        const pag = pagination;
        if (!entries.some((entry) => entry.isIntersecting)) return;
        if (!pag || !pag.hasNextPage || loading || loadingMore) return;
        loadPage(pag.page + 1, true);
      },
      { rootMargin: '600px 0px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [pagination, loading, loadingMore, loadPage]);

  return { products, pagination, loading, loadingMore, error, sentinelRef, retry: () => loadPage(1, false) };
}
