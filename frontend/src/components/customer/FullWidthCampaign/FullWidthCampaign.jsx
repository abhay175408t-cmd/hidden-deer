import { useLayoutEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { gsap } from '../../../lib/gsap';
import './FullWidthCampaign.css';

/**
 * Full-width promotional advertisement with a cinematic ScrollTrigger reveal:
 * the image settles from scale 1.06 -> 1 while the copy lifts in
 * (opacity 0 -> 1, y 40 -> 0).
 */
export default function FullWidthCampaign({ campaign }) {
  const rootRef = useRef(null);

  useLayoutEffect(() => {
    if (!rootRef.current) return undefined;
    const context = gsap.context(() => {
      const mm = gsap.matchMedia();

      mm.add('(prefers-reduced-motion: reduce)', () => {
        gsap.set('[data-fwc-media], [data-fwc-copy], [data-fwc-line]', {
          clearProps: 'opacity,transform',
        });
      });

      mm.add('(prefers-reduced-motion: no-preference)', () => {
        const timeline = gsap.timeline({
          scrollTrigger: {
            trigger: rootRef.current,
            start: 'top 82%',
            once: true,
          },
          defaults: { ease: 'power2.out' },
        });
        timeline
          .fromTo('[data-fwc-media]', { scale: 1.06 }, { scale: 1, duration: 1.5, ease: 'power2.out' }, 0)
          .fromTo('[data-fwc-copy]', { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.9 }, 0.4)
          .fromTo('[data-fwc-line]', { y: 22, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7, stagger: 0.09 }, 0.6);
      });
      return () => mm.revert();
    }, rootRef);
    return () => context.revert();
  }, []);

  if (!campaign) return null;

  const href = campaign.href || (campaign.categorySlug ? `/?category=${campaign.categorySlug}` : '/');

  return (
    <section className="fwc" ref={rootRef} aria-labelledby="fwc-title">
      <Link to={href} className="fwc__link" aria-label={`${campaign.title} — ${campaign.cta}`}>
        <div className="fwc__media" data-fwc-media>
          <img
            className="fwc__img"
            src={campaign.image}
            alt={campaign.alt || campaign.title}
            loading="lazy"
            decoding="async"
            draggable={false}
          />
        </div>
        <div className="fwc__shade" aria-hidden="true" />
        <div className="fwc__copy" data-fwc-copy>
          {campaign.eyebrow && (
            <p className="fwc__eyebrow" data-fwc-line>
              {campaign.eyebrow}
            </p>
          )}
          <h2 id="fwc-title" className="fwc__title" data-fwc-line>
            {campaign.title}
          </h2>
          {campaign.subtitle && (
            <p className="fwc__subtitle" data-fwc-line>
              {campaign.subtitle}
            </p>
          )}
          <span className="fwc__cta" data-fwc-line>
            {campaign.cta}
            <span aria-hidden="true"> →</span>
          </span>
        </div>
      </Link>
    </section>
  );
}