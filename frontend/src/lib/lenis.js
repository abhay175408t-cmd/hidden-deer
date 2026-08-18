import Lenis from 'lenis';
import { gsap, ScrollTrigger } from './gsap';

// Single application-wide Lenis instance, created once at module level.
// Never recreated per render/component. Lenis is driven by GSAP's ticker so
// both libraries share one frame loop (no double-RAF, no scroll conflicts).
const lenis = new Lenis({
  duration: 1.15,
  easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
  smoothWheel: true,
  autoRaf: false,
});

gsap.ticker.add((time) => {
  lenis.raf(time * 1000);
});
gsap.ticker.lagSmoothing(0);

lenis.on('scroll', ScrollTrigger.update);

export { lenis };
export default lenis;