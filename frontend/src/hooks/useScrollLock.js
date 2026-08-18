import { useEffect } from 'react';
import { lenis } from '../lib/lenis';

// Locks page scrolling while `active` is true and restores it on cleanup.
// Works with Lenis (stop/start) and the browser (body overflow), so wheel,
// touch and keyboard scrolling are all disabled during the preloader.
export default function useScrollLock(active = true) {
  useEffect(() => {
    if (!active) return;

    lenis.stop();
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      lenis.start();
      document.body.style.overflow = previous;
    };
  }, [active]);
}