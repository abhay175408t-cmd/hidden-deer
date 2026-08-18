import { useCallback, useRef } from 'react';
import { gsap } from '../lib/gsap';

/**
 * Reusable dual-image hover animation (the signature DEER interaction).
 *
 * IMAGE A (lifestyle/person) is shown by default. On hover it fades out with
 * a subtle scale while IMAGE B (clean product shot) fades in from a larger
 * scale — a premium crossfade "pull through" transition. Leaving reverses it.
 *
 * Works for CategoryCard, ProductCard and FeaturedProductCard.
 *
 * Usage:
 *   const refs = useDualImageHover();            // returns { primaryRef, secondaryRef, enter, leave }
 *   <div ref={refs.rootRef} onMouseEnter={refs.enter} onMouseLeave={refs.leave}>
 *     <img ref={refs.primaryRef} ... />
 *     <img ref={refs.secondaryRef} ... />
 *   </div>
 */
export default function useDualImageHover({ duration = 0.55 } = {}) {
  const rootRef = useRef(null);
  const primaryRef = useRef(null);
  const secondaryRef = useRef(null);
  const tweenRef = useRef(null);
  const overRef = useRef(false);
  const enabledRef = useRef(true);

  const animate = useCallback(
    (hovering) => {
      const primary = primaryRef.current;
      const secondary = secondaryRef.current;
      if (!primary) return;
      if (!secondary || !enabledRef.current) {
        overRef.current = hovering;
        return;
      }
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        gsap.set(secondary, { opacity: hovering ? 1 : 0, scale: 1 });
        gsap.set(primary, { opacity: hovering ? 0 : 1, scale: 1 });
        overRef.current = hovering;
        return;
      }
      if (tweenRef.current) tweenRef.current.kill();
      overRef.current = hovering;
      const tween = hovering
        ? gsap.timeline({ overwrite: 'auto' })
            .to(primary, { opacity: 0, scale: 1.03, duration, ease: 'power2.inOut' }, 0)
            .fromTo(
              secondary,
              { opacity: 0, scale: 1.05 },
              { opacity: 1, scale: 1, duration, ease: 'power2.inOut' },
              0
            )
        : gsap.timeline({ overwrite: 'auto' })
            .to(secondary, { opacity: 0, scale: 1.02, duration, ease: 'power2.inOut' }, 0)
            .fromTo(
              primary,
              { opacity: 0, scale: 1.04 },
              { opacity: 1, scale: 1, duration, ease: 'power2.inOut' },
              0
            );
      tweenRef.current = tween;
      tween.eventCallback('onComplete', () => {
        if (tweenRef.current === tween) tweenRef.current = null;
      });
    },
    [duration]
  );

  const enter = useCallback(() => animate(true), [animate]);
  const leave = useCallback(() => animate(false), [animate]);

  return {
    rootRef,
    primaryRef,
    secondaryRef,
    enter,
    leave,
    /** Set false to disable the swap (e.g. only one image available). */
    setEnabled(value) {
      enabledRef.current = value;
      if (!value && overRef.current) leave();
    },
  };
}
