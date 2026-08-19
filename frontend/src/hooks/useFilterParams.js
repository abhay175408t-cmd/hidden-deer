import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { EMPTY_FILTERS, FILTER_KEYS, SORT_OPTIONS } from '../lib/productQuery';

const ARRAY_KEYS = FILTER_KEYS;
const NUMERIC_KEYS = ['minPrice', 'maxPrice'];
const ALL_KEYS = [...ARRAY_KEYS, ...NUMERIC_KEYS, 'inStock'];

function parseParamValue(key, value) {
  if (value === null || value === undefined || value === '') return null;
  if (key === 'inStock') return value === 'true';
  if (NUMERIC_KEYS.includes(key)) {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  }
  return value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

function parseFiltersFromSearchParams(searchParams) {
  const filters = { ...EMPTY_FILTERS };
  for (const key of ALL_KEYS) {
    const parsed = parseParamValue(key, searchParams.get(key));
    if (parsed !== null && parsed !== undefined) filters[key] = parsed;
  }
  return filters;
}

function serializeFiltersToSearchParams(filters, searchParams) {
  const next = new URLSearchParams(searchParams);
  for (const key of ALL_KEYS) next.delete(key);
  for (const key of ARRAY_KEYS) {
    const values = Array.isArray(filters[key]) ? filters[key].filter(Boolean) : [];
    if (values.length > 0) next.set(key, values.join(','));
  }
  for (const key of NUMERIC_KEYS) {
    const value = filters[key];
    if (value !== null && value !== undefined && value !== '') next.set(key, String(value));
  }
  if (filters.inStock === true) next.set('inStock', 'true');
  else if (filters.inStock === false) next.set('inStock', 'false');
  return next;
}

/**
 * URL-backed filter state for the category listing page.
 *
 * The URL search params are the single source of truth for the *applied*
 * filters (what the API is queried with), so reloads, back/forward and shared
 * links all preserve the exact filter state:
 *
 *   /category/shirts?color=black,white&fit=oversized&sort=price_asc
 *
 * The sidebar edits a *staged* draft; only Apply Filters (or Clear All)
 * commits it to the URL. Sort applies immediately. Staged edits are preserved
 * across in-page URL changes but reset when the route (category) changes.
 */
export default function useFilterParams() {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const pathnameRef = useRef(location.pathname);
  const stagedRef = useRef(false);
  const [draftFilters, setDraftFilters] = useState(() =>
    parseFiltersFromSearchParams(searchParams)
  );

  const appliedFilters = useMemo(
    () => parseFiltersFromSearchParams(searchParams),
    [searchParams]
  );

  const sort = useMemo(() => {
    const value = searchParams.get('sort');
    return SORT_OPTIONS.includes(value) ? value : 'newest';
  }, [searchParams]);

  // Reset staged edits when the route (category) changes; otherwise re-sync the
  // draft from the URL only when there are no unsaved edits pending.
  useEffect(() => {
    if (pathnameRef.current !== location.pathname) {
      pathnameRef.current = location.pathname;
      stagedRef.current = false;
    }
    if (stagedRef.current) return;
    setDraftFilters(parseFiltersFromSearchParams(searchParams));
  }, [location.pathname, searchParams]);

  const stage = useCallback((updater) => {
    stagedRef.current = true;
    setDraftFilters((prev) => updater(prev));
  }, []);

  const toggleValue = useCallback(
    (key, value) => {
      stage((prev) => {
        const current = Array.isArray(prev[key]) ? prev[key] : [];
        const next = current.includes(value)
          ? current.filter((v) => v !== value)
          : [...current, value];
        return { ...prev, [key]: next };
      });
    },
    [stage]
  );

  const setNumeric = useCallback(
    (key, value) => {
      stage((prev) => ({ ...prev, [key]: value === '' ? null : Number(value) }));
    },
    [stage]
  );

  const setInStock = useCallback(
    (value) => {
      stage((prev) => ({ ...prev, inStock: value }));
    },
    [stage]
  );

  const applyFilters = useCallback(() => {
    stagedRef.current = false;
    const next = serializeFiltersToSearchParams(draftFilters, searchParams);
    setSearchParams(next, { replace: true });
  }, [draftFilters, searchParams, setSearchParams]);

  const clearAll = useCallback(() => {
    stagedRef.current = false;
    const next = new URLSearchParams(searchParams);
    for (const key of ALL_KEYS) next.delete(key);
    setSearchParams(next, { replace: true });
    setDraftFilters({ ...EMPTY_FILTERS });
  }, [searchParams, setSearchParams]);

  const setSort = useCallback(
    (value) => {
      const next = new URLSearchParams(searchParams);
      if (SORT_OPTIONS.includes(value)) next.set('sort', value);
      else next.delete('sort');
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  const activeFilterCount = useMemo(() => {
    let count = 0;
    for (const key of ARRAY_KEYS) {
      const values = appliedFilters[key];
      if (Array.isArray(values) && values.length > 0) count += values.length;
    }
    if (appliedFilters.minPrice !== null && appliedFilters.minPrice !== undefined) count += 1;
    if (appliedFilters.maxPrice !== null && appliedFilters.maxPrice !== undefined) count += 1;
    if (appliedFilters.inStock === true || appliedFilters.inStock === false) count += 1;
    return count;
  }, [appliedFilters]);

  return {
    filters: appliedFilters,
    draftFilters,
    sort,
    toggleValue,
    setNumeric,
    setInStock,
    stage,
    applyFilters,
    clearAll,
    setSort,
    hasActiveFilters: activeFilterCount > 0,
    activeFilterCount,
  };
}