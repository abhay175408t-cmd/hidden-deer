import { useLayoutEffect, useRef } from 'react';
import { gsap } from '../../../lib/gsap';
import useInfiniteProducts from '../../../hooks/useInfiniteProducts';
import ProductCard from '../ProductCard/ProductCard';
import './ProductSection.css';

/**
 * NEW AND POPULAR — the main product discovery section.
 *
 * - Category filter chips (ALL + backend categories), driven by the same
 *   state as the top category navigation, so both stay in sync.
 * - Products come from GET /products (page/limit/category/sort — all
 *   backend-supported params).
 * - Scroll-based lazy loading: batches append as a sentinel nears the
 *   viewport (IntersectionObserver). No "Load More" button needed.
 * - Cards use the shared DualImageHover transition (lazy detail fetch).
 */
export default function ProductSection({ categories, activeCategory, onSelectCategory }) {
  const rootRef = useRef(null);
  const revealedRef = useRef(false);
  const { products, pagination, loading, loadingMore, error, sentinelRef, retry } =
    useInfiniteProducts({ category: activeCategory, sort: 'newest' });

  const isDiscover = activeCategory === 'discover';
  const activeMeta = isDiscover
    ? null
    : categories.find((category) => category.slug === activeCategory);

  // Run the staggered reveal once, when the first batch has rendered.
  useLayoutEffect(() => {
    if (revealedRef.current || loading || products.length === 0) return undefined;
    revealedRef.current = true;
    const context = gsap.context(() => {
      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: reduce)', () => {
        gsap.set('[data-reveal]', { clearProps: 'opacity,transform' });
      });
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        gsap.fromTo(
          '[data-reveal="title"]',
          { y: 28, opacity: 0 },
          {
            y: 0,
            opacity: 1,
            duration: 0.7,
            ease: 'power2.out',
            scrollTrigger: { trigger: rootRef.current, start: 'top 82%', once: true },
          }
        );
        gsap.fromTo(
          '[data-reveal="card"]',
          { y: 22, opacity: 0 },
          {
            y: 0,
            opacity: 1,
            duration: 0.6,
            stagger: 0.045,
            ease: 'power2.out',
            scrollTrigger: { trigger: rootRef.current, start: 'top 82%', once: true },
          }
        );
      });
      return () => mm.revert();
    }, rootRef);
    return () => context.revert();
  }, [loading, products.length]);

  const chips = [
    { key: 'discover', label: 'All' },
    ...categories.map((category) => ({ key: category.slug, label: category.name })),
  ];

  return (
    <section className="ps" ref={rootRef} id="new-and-popular" aria-labelledby="ps-title">
      <header className="ps__head">
        <div data-reveal="title">
          <p className="ps__eyebrow">{isDiscover ? 'The Deer Edit' : activeMeta?.name || 'The Deer Edit'}</p>
          <h2 id="ps-title" className="ps__title">
            {isDiscover ? 'New and Popular' : `${activeMeta?.name || 'Collection'} — New Season`}
          </h2>
        </div>
        <div className="ps__filters" role="group" aria-label="Filter products by category">
          {chips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              className={`ps__chip${activeCategory === chip.key ? ' ps__chip--active' : ''}`}
              aria-pressed={activeCategory === chip.key}
              onClick={() => onSelectCategory(chip.key)}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </header>

      {error ? (
        <div className="ps__state" role="alert">
          <p>{error}</p>
          <button type="button" className="ps__retry" onClick={retry}>
            Retry
          </button>
        </div>
      ) : loading ? (
        <div className="ps__grid" aria-hidden="true">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="ps__skeleton" />
          ))}
        </div>
      ) : products.length === 0 ? (
        <div className="ps__state" role="status">
          <p>Nothing in this edit yet. Check back soon.</p>
        </div>
      ) : (
        <>
          <div className="ps__grid">
            {products.map((product) => (
              <div key={product.id} data-reveal="card">
                <ProductCard product={product} />
              </div>
            ))}
          </div>
          {loadingMore && (
            <div className="ps__more" aria-hidden="true">
              <span className="ps__more-line" />
            </div>
          )}
          {pagination?.hasNextPage && !loadingMore && (
            <div className="ps__sentinel" ref={sentinelRef} aria-hidden="true" />
          )}
        </>
      )}
    </section>
  );
}