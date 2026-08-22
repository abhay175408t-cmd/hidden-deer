import useProducts from '../../../hooks/useProducts';
import ProductGrid from '../ProductGrid/ProductGrid';
import './SimilarProducts.css';

/**
 * "Complete the look" rail mounted at the foot of the product detail page,
 * directly above the footer.
 *
 * Fetches from the same category as the viewed product via the shared
 * useProducts hook (GET /products?category=<slug>&limit=5), drops the
 * current product from the result set, and renders through ProductGrid so
 * the loading skeletons are identical to the home / category grids.
 * Renders nothing when the category has no other pieces.
 */
export default function SimilarProducts({ product }) {
  const categorySlug = product?.category?.slug || product?.category;
  const { products, loading, error, retry } = useProducts({
    category: categorySlug,
    sort: 'newest',
    limit: 5,
  });

  // Never suggest the piece the customer is already looking at.
  const similar = products.filter((item) => item.id !== product.id);

  if (!categorySlug || (!loading && !error && similar.length === 0)) return null;

  return (
    <section className="similar-products" aria-labelledby="similar-products-title">
      <header className="similar-products__head">
        <p className="similar-products__eyebrow">Complete the look</p>
        <h2 id="similar-products-title" className="similar-products__title">
          Similar pieces
        </h2>
      </header>

      {error ? (
        <div className="product-grid__state" role="alert">
          <p>{error}</p>
          <button type="button" className="product-grid__retry" onClick={retry}>
            Retry
          </button>
        </div>
      ) : (
        <ProductGrid products={similar} loading={loading} />
      )}
    </section>
  );
}
