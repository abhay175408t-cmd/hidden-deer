import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import api from '../api/axios';
import { buildProductParams, serializeFilters } from '../lib/productQuery';

/**
 * Paginated product fetching with scroll-based lazy loading.
 *
 * Loads the first batch immediately; further batches load as a sentinel
 * element (ref via `sentinelRef`) approaches the viewport. Products are
 * appended, never replaced, while the filter state stays the same.
 *
 * Accepts the full filter state ({ color, size, brand, pattern, fit,
 * material, collar, sleeves, deliveryTime, minPrice, maxPrice, inStock }).
 * When the filter state or sort changes, the list resets to page 1 and the
 * first batch reloads.
 */
const BATCH_SIZE = 8;
const EMPTY_FILTERS = {};

export default function useInfiniteProducts({ category, filters = EMPTY_FILTERS, sort = 'newest' } = {}) {
  const [products, setProducts] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const sentinelRef = useRef(null);
  const activeRef = useRef(true);
  const busyRef = useRef(false);
  const paramsRef = useRef({ category, filters, sort });

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
        const { category, filters, sort } = paramsRef.current;
        const params = buildProductParams({ category, filters, sort, page, limit: BATCH_SIZE });
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
    []
  );

  // Content-based signature: a freshly-created-but-identical filters object
  // (e.g. a default {} built each render) must not retrigger a reload.
  const signature = useMemo(
    () => [category, sort, JSON.stringify(serializeFilters(filters))].join('\u0000'),
    [category, sort, filters]
  );

  // Reset + first batch. useLayoutEffect flushes the reset before paint so a
  // category/filter switch never flashes the previous results.
  useLayoutEffect(() => {
    paramsRef.current = { category, filters, sort };
    activeRef.current = true;
    busyRef.current = false;
    setProducts([]);
    setPagination(null);
    loadPage(1, false);
    return () => {
      activeRef.current = false;
    };
  }, [signature, loadPage]);

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