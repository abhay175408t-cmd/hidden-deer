import { useLayoutEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { gsap } from '../../../lib/gsap';
import './CampaignPosters.css';

function posterHref(poster) {
  if (poster.href) return poster.href;
  if (poster.categorySlug) return `/?category=${poster.categorySlug}`;
  return '/';
}

/**
 * Campaign poster grid — editorial fashion posters, all clickable, routed to
 * the existing discovery experience. Hover: image scales subtly, the overlay
 * deepens and the copy lifts.
 */
export default function CampaignPosters({ posters }) {
  const rootRef = useRef(null);

  useLayoutEffect(() => {
    if (!rootRef.current) return undefined;
    const context = gsap.context(() => {
      const mm = gsap.matchMedia();

      mm.add('(prefers-reduced-motion: reduce)', () => {
        gsap.set('[data-poster]', { clearProps: 'opacity,transform' });
      });

      mm.add('(prefers-reduced-motion: no-preference)', () => {
        gsap.fromTo(
          '.cp__head',
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
          '[data-poster]',
          { y: 34, opacity: 0 },
          {
            y: 0,
            opacity: 1,
            duration: 0.8,
            stagger: 0.09,
            ease: 'power2.out',
            scrollTrigger: { trigger: rootRef.current, start: 'top 80%', once: true },
          }
        );

        gsap.utils.toArray('[data-poster]').forEach((poster) => {
          const img = poster.querySelector('.cp__img');
          const copy = poster.querySelector('.cp__copy');
          if (!img) return;
          const scaleTo = gsap.quickTo(img, 'scale', { duration: 0.7, ease: 'power2.out' });
          const copyY = gsap.quickTo(copy, 'y', { duration: 0.6, ease: 'power2.out' });
          const onEnter = () => {
            scaleTo(1.04);
            copyY(-6);
            poster.classList.add('cp__poster--active');
          };
          const onLeave = () => {
            scaleTo(1);
            copyY(0);
            poster.classList.remove('cp__poster--active');
          };
          poster.addEventListener('mouseenter', onEnter);
          poster.addEventListener('mouseleave', onLeave);
          return () => {
            poster.removeEventListener('mouseenter', onEnter);
            poster.removeEventListener('mouseleave', onLeave);
          };
        });
      });
      return () => mm.revert();
    }, rootRef);
    return () => context.revert();
  }, [posters]);

  if (posters.length === 0) return null;

  return (
    <section className="cp" ref={rootRef} aria-labelledby="cp-title">
      <header className="cp__head">
        <p className="cp__eyebrow">Campaign</p>
        <h2 id="cp-title" className="cp__title">
          Shop the Stories
        </h2>
      </header>
      <div className="cp__grid">
        {posters.map((poster) => (
          <Link
            key={poster.key}
            to={posterHref(poster)}
            className="cp__poster"
            style={{ '--span': poster.span || 4 }}
            data-poster
            aria-label={`${poster.title}${poster.subtitle ? ` — ${poster.subtitle}` : ''}`}
          >
            <div className="cp__media">
              <img
                className="cp__img"
                src={poster.image}
                alt={poster.title}
                loading="lazy"
                decoding="async"
                draggable={false}
              />
            </div>
            <div className="cp__shade" aria-hidden="true" />
            <div className="cp__copy">
              <h3 className="cp__poster-title">{poster.title}</h3>
              {poster.subtitle && <p className="cp__poster-subtitle">{poster.subtitle}</p>}
              {poster.cta && (
                <span className="cp__cta">
                  {poster.cta}
                  <span aria-hidden="true"> →</span>
                </span>
              )}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}