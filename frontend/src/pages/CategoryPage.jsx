import { useMemo, useState } from 'react';
import { Link, useOutletContext, useParams } from 'react-router-dom';
import { SlidersHorizontal, X } from 'lucide-react';
import useCategoryFilters from '../hooks/useCategoryFilters';
import useFilterParams from '../hooks/useFilterParams';
import useInfiniteProducts from '../hooks/useInfiniteProducts';
import FilterSidebar from '../components/customer/FilterSidebar/FilterSidebar';
import ProductGrid from '../components/customer/ProductGrid/ProductGrid';
import './CategoryPage.css';

const SORT_LABELS = {
  newest: 'Newest',
  popular: 'Most Popular',
  price_asc: 'Price: Low to High',
  price_desc: 'Price: High to Low',
  rating_desc: 'Top Rated',
  name_asc: 'Name: A to Z',
  name_desc: 'Name: Z to A',
  discount_desc: 'Biggest Discount',
};

/**
 * Snitch-style category product listing.
 *
 * URL is the single source of truth for filters and sort
 * (e.g. /category/shirts?color=black,white&fit=oversized&sort=price_asc), so
 * reloads, back/forward and shared links preserve the full state.
 * Sidebar edits are staged until "Apply Filters" commits them to the URL.
 * Grid uses scroll-based lazy loading.
 */
export default function CategoryPage() {
  const { categorySlug } = useParams();
  const { categories, categoriesLoading } = useOutletContext();
  const [filtersOpen, setFiltersOpen] = useState(false);

  const {
    filters,
    draftFilters,
    sort,
    toggleValue,
    setNumeric,
    setInStock,
    applyFilters,
    clearAll,
    setSort,
    activeFilterCount,
  } = useFilterParams();

  const { filters: metadata, loading: metadataLoading, error: metadataError, retry: retryMetadata } =
    useCategoryFilters(categorySlug);

  const {
    products,
    pagination,
    loading,
    loadingMore,
    error,
    sentinelRef,
    retry,
  } = useInfiniteProducts({ category: categorySlug, filters, sort });

  const categoryMeta = useMemo(() => {
    if (metadata?.category) return metadata.category;
    return categories.find((category) => category.slug === categorySlug) || null;
  }, [metadata, categories, categorySlug]);

  const resultCount = typeof pagination?.total === 'number' ? pagination.total : null;

  const handleApply = () => {
    applyFilters();
    setFiltersOpen(false);
  };

  const handleClear = () => {
    clearAll();
    setFiltersOpen(false);
  };

  if (!categoriesLoading && !categories.some((category) => category.slug === categorySlug)) {
    return (
      <div className="category-page__state" role="status">
        <h1 className="category-page__state-title">Category not found</h1>
        <p>The collection you are looking for does not exist.</p>
        <Link className="category-page__state-link" to="/">
          ← Back to home
        </Link>
      </div>
    );
  }

  return (
    <div className="category-page">
      <header className="category-page__topbar">
        <div className="category-page__heading">
          <p className="category-page__crumbs">
            <Link to="/">Shop</Link>
            <span aria-hidden="true">/</span>
            <span>{categoryMeta?.name || 'Loading…'}</span>
          </p>
          <h1 className="category-page__title">{categoryMeta?.name || 'Collection'}</h1>
          {resultCount !== null && (
            <p className="category-page__count">
              Showing {resultCount} item{resultCount === 1 ? '' : 's'}
            </p>
          )}
        </div>

        <div className="category-page__controls">
          <button
            type="button"
            className="category-page__filter-btn"
            onClick={() => setFiltersOpen(true)}
            aria-haspopup="dialog"
          >
            <SlidersHorizontal size={16} strokeWidth={1.5} aria-hidden="true" />
            Filters
            {activeFilterCount > 0 && (
              <span className="category-page__filter-count">{activeFilterCount}</span>
            )}
          </button>
          <label className="category-page__sort">
            <span className="category-page__sort-label">Sort</span>
            <select
              className="category-page__select"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              aria-label="Sort products"
            >
              {Object.entries(SORT_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      <div className="category-page__layout">
        <aside className="category-page__sidebar">
          <FilterSidebar
            metadata={metadata}
            draft={draftFilters}
            onToggle={toggleValue}
            onPriceChange={setNumeric}
            onInStock={setInStock}
            onApply={handleApply}
            onClear={handleClear}
            loading={metadataLoading}
            resultCount={resultCount}
            activeCount={activeFilterCount}
          />
        </aside>

        <section className="category-page__grid" aria-live="polite" aria-busy={loading}>
          <ProductGrid
            products={products}
            loading={loading}
            loadingMore={loadingMore}
            error={error}
            sentinelRef={sentinelRef}
            onRetry={retry}
          />
        </section>
      </div>

      {metadataError && !metadataLoading && (
        <div className="category-page__meta-error" role="alert">
          <span>{metadataError}</span>
          <button type="button" onClick={retryMetadata}>
            Retry
          </button>
        </div>
      )}

      {filtersOpen && (
        <div className="category-page__drawer" role="dialog" aria-modal="true" aria-label="Filters">
          <div className="category-page__drawer-backdrop" onClick={() => setFiltersOpen(false)} />
          <div className="category-page__drawer-panel">
            <div className="category-page__drawer-head">
              <h2 className="category-page__drawer-title">Filters</h2>
              <button
                type="button"
                className="category-page__drawer-close"
                onClick={() => setFiltersOpen(false)}
                aria-label="Close filters"
              >
                <X size={18} strokeWidth={1.5} aria-hidden="true" />
              </button>
            </div>
            <FilterSidebar
              metadata={metadata}
              draft={draftFilters}
              onToggle={toggleValue}
              onPriceChange={setNumeric}
              onInStock={setInStock}
              onApply={handleApply}
              onClear={handleClear}
              loading={metadataLoading}
              resultCount={resultCount}
              activeCount={activeFilterCount}
            />
          </div>
        </div>
      )}
    </div>
  );
}