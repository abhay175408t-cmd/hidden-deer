import { useLayoutEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { gsap } from '../../../lib/gsap';
import DualImageHover from '../DualImageHover/DualImageHover';
import './FeaturedCategories.css';

function CategoryCard({ category, eager }) {
  return (
    <article className="fc-card" data-reveal="card">
      <Link to={category.href} className="fc-card__link" aria-label={`Shop ${category.name}`}>
        <DualImageHover
          primary={{ src: category.personImage, alt: `${category.name} — on a person` }}
          secondary={{ src: category.productImage, alt: `${category.name} — product shot` }}
          alt={category.name}
          eager={eager}
          className="fc-card__media"
        >
          <span className="fc-card__badge" aria-hidden="true">
            {category.name}
          </span>
        </DualImageHover>
        <div className="fc-card__meta">
          <h3 className="fc-card__name">{category.name}</h3>
          <span className="fc-card__arrow" aria-hidden="true">
            →
          </span>
        </div>
      </Link>
    </article>
  );
}

/**
 * Featured categories — the signature DEER dual-image hover cards.
 * Grid composed like an editorial catalog: first row leads with the first
 * two categories, remainder flows in a 4-column rhythm.
 */
export default function FeaturedCategories({ categories }) {
  const rootRef = useRef(null);

  useLayoutEffect(() => {
    if (!rootRef.current) return undefined;
    const context = gsap.context(() => {
      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: reduce)', () => {
        gsap.set('[data-reveal]', { clearProps: 'opacity,transform' });
      });
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        gsap.fromTo(
          '.fc__head',
          { y: 24, opacity: 0 },
          {
            y: 0,
            opacity: 1,
            duration: 0.7,
            ease: 'power2.out',
            scrollTrigger: { trigger: rootRef.current, start: 'top 85%', once: true },
          }
        );
        gsap.fromTo(
          '[data-reveal="card"]',
          { y: 28, opacity: 0 },
          {
            y: 0,
            opacity: 1,
            duration: 0.7,
            stagger: 0.06,
            ease: 'power2.out',
            scrollTrigger: { trigger: rootRef.current, start: 'top 82%', once: true },
          }
        );
        // subtle name movement on card hover
        gsap.utils.toArray('[data-reveal="card"]').forEach((card) => {
          const name = card.querySelector('.fc-card__name');
          if (!name) return;
          const moveX = gsap.quickTo(name, 'x', { duration: 0.45, ease: 'power2.out' });
          card.addEventListener('mouseenter', () => moveX(6));
          card.addEventListener('mouseleave', () => moveX(0));
        });
      });
      return () => mm.revert();
    }, rootRef);
    return () => context.revert();
  }, [categories]);

  if (categories.length === 0) return null;

  return (
    <section className="fc" ref={rootRef} aria-labelledby="fc-title">
      <header className="fc__head">
        <p className="fc__eyebrow">The Deer Edit</p>
        <h2 id="fc-title" className="fc__title">
          Featured Categories
        </h2>
      </header>
      <div className="fc__grid">
        {categories.map((category, index) => (
          <CategoryCard key={category.slug} category={category} eager={index < 4} />
        ))}
      </div>
    </section>
  );
}