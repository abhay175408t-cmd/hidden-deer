import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { gsap, ScrollTrigger } from '../../../lib/gsap';
import './EditorialMarquee.css';

const PX_PER_SECOND = 55;

function adHref(ad) {
  if (ad.href) return ad.href;
  if (ad.categorySlug) return `/?category=${ad.categorySlug}`;
  return '/';
}

/**
 * Continuously moving editorial advertisement strip (GSAP-controlled).
 *
 * - Seamless infinite loop: content is rendered twice inside a track that
 *   tween xPercent: 0 -> -50 (exactly one copy width), repeat: -1.
 * - Hovering the section pauses the tween; leaving resumes it from the exact
 *   same position (no restart, no reset).
 * - Pauses automatically while offscreen (ScrollTrigger) and for
 *   prefers-reduced-motion.
 * - Cards have intentional, different widths (narrow/medium/wide/tall).
 * - Individual cards scale their image subtly on hover.
 */
export default function EditorialMarquee({ ads }) {
  const rootRef = useRef(null);
  const trackRef = useRef(null);
  const tweenRef = useRef(null);
  const pausedRef = useRef(false);
  const [userPaused, setUserPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );

  const items = useMemo(() => {
    if (!Array.isArray(ads) || ads.length === 0) return [];
    const copies = reducedMotion ? 1 : 2;
    return Array.from({ length: copies }, (_, copy) => ({
      copy,
      cards: ads.map((ad, i) => ({ ...ad, key: `${ad.key}-${copy}-${i}` })),
    }));
  }, [ads, reducedMotion]);

  const pauseTween = useCallback((value) => {
    const tween = tweenRef.current;
    if (!tween) return;
    if (value) tween.pause();
    else tween.resume();
  }, []);

  const toggleUserPause = useCallback(() => {
    setUserPaused((prev) => {
      pauseTween(!prev);
      return !prev;
    });
  }, [pauseTween]);

  // Pause/resume from pointer hover. Resuming only ever resumes in place —
  // a paused GSAP tween keeps its exact position.
  const setMovementPaused = useCallback(
    (value) => {
      pausedRef.current = value || userPaused;
      pauseTween(pausedRef.current);
    },
    [pauseTween, userPaused]
  );

  // Build the infinite tween + per-card image hovers once content is laid out.
  useLayoutEffect(() => {
    if (items.length === 0 || reducedMotion) return undefined;
    const root = rootRef.current;
    const track = trackRef.current;
    if (!root || !track) return undefined;

    const context = gsap.context(() => {
      const tween = gsap.to(track, {
        xPercent: -50,
        duration: Math.max(track.scrollWidth / 2 / PX_PER_SECOND, 10),
        ease: 'none',
        repeat: -1,
      });
      tweenRef.current = tween;

      const offscreen = ScrollTrigger.create({
        trigger: root,
        start: 'top bottom',
        end: 'bottom top',
        onToggle: (self) => {
          if (self.isActive) {
            if (!pausedRef.current) tween.resume();
          } else {
            tween.pause();
          }
        },
      });

      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: no-preference) and (pointer: fine)', () => {
        const cards = gsap.utils.toArray('[data-em-card]');
        const hovers = cards.map((card) => {
          const img = card.querySelector('.em__img');
          if (!img) return null;
          const scaleTo = gsap.quickTo(img, 'scale', { duration: 0.6, ease: 'power2.out' });
          const onEnter = () => scaleTo(1.03);
          const onLeave = () => scaleTo(1);
          card.addEventListener('mouseenter', onEnter);
          card.addEventListener('mouseleave', onLeave);
          return () => {
            card.removeEventListener('mouseenter', onEnter);
            card.removeEventListener('mouseleave', onLeave);
          };
        });
        return () => hovers.forEach((cleanup) => cleanup?.());
      });

      return () => {
        offscreen.kill();
        tween.kill();
        mm.revert();
        tweenRef.current = null;
      };
    }, root);

    return () => context.revert();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length, reducedMotion]);

  if (items.length === 0) return null;

  return (
    <section
      className={`em${reducedMotion ? ' em--reduced' : ''}`}
      data-em-section
      ref={rootRef}
      aria-label="Hidden Deer campaign highlights"
      aria-roledescription="scrolling banner"
      onMouseEnter={() => setMovementPaused(true)}
      onMouseLeave={() => setMovementPaused(false)}
    >
      {!reducedMotion && (
        <button
          type="button"
          className="em__pause"
          aria-pressed={userPaused}
          aria-label={userPaused ? 'Resume campaign movement' : 'Pause campaign movement'}
          onClick={toggleUserPause}
        >
          {userPaused ? 'Play' : 'Pause'}
        </button>
      )}
      <div className="em__viewport">
        <div className="em__track" ref={trackRef}>
          {items.map(({ copy, cards }) => (
            <div key={copy} className="em__copy" aria-hidden={copy === 1 ? 'true' : undefined}>
              {cards.map((ad) => (
                <Link
                  key={ad.key}
                  to={adHref(ad)}
                  className={`em__card em__card--${ad.width || 'medium'}`}
                  data-em-card
                  aria-label={`${ad.title}${ad.subtitle ? ` — ${ad.subtitle}` : ''}`}
                >
                  <div className="em__media">
                    <img
                      className="em__img"
                      src={ad.image}
                      alt={ad.title}
                      loading={ad.eager ? 'eager' : 'lazy'}
                      fetchPriority={ad.eager ? 'high' : 'auto'}
                      draggable={false}
                    />
                    <div className="em__shade" aria-hidden="true" />
                  </div>
                  <div className="em__copy-inner">
                    {ad.price && <p className="em__price">{ad.price}</p>}
                    <h3 className="em__title">{ad.title}</h3>
                    {ad.subtitle && <p className="em__subtitle">{ad.subtitle}</p>}
                    {ad.cta && (
                      <span className="em__cta">
                        {ad.cta}
                        <span className="em__cta-arrow" aria-hidden="true">
                          →
                        </span>
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}