import ProductCard from '../ProductCard/ProductCard';
import './ProductGrid.css';

/**
 * Responsive product grid for the category listing. Handles the first-load
 * skeleton, error and empty states, and the infinite-scroll sentinel.
 */
export default function ProductGrid({ products, loading, loadingMore, error, sentinelRef, onRetry }) {
  if (error) {
    return (
      <div className="product-grid__state" role="alert">
        <p>{error}</p>
        <button type="button" className="product-grid__retry" onClick={onRetry}>
          Retry
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="product-grid" aria-hidden="true">
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="product-grid__skeleton" />
        ))}
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="product-grid__state" role="status">
        <p>No pieces match these filters. Try widening your search.</p>
      </div>
    );
  }

  return (
    <>
      <div className="product-grid">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
      {loadingMore && (
        <div className="product-grid__more" aria-hidden="true">
          <span className="product-grid__more-line" />
        </div>
      )}
      {sentinelRef && (
        <div className="product-grid__sentinel" ref={sentinelRef} aria-hidden="true" />
      )}
    </>
  );
}