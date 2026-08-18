import { useCallback, useLayoutEffect, useRef } from 'react';
import { gsap } from '../../../lib/gsap';
import './CategoryNav.css';

const DISCOVER = { key: 'discover', label: 'Discover' };

export default function CategoryNav({ categories, activeCategory, onSelect, loading }) {
  const navRef = useRef(null);
  const indicatorRef = useRef(null);
  const buttonsRef = useRef(new Map());
  const firstRunRef = useRef(true);

  const items = [DISCOVER, ...categories.map((category) => ({ key: category.slug, label: category.name }))];

  const placeIndicator = useCallback((button, instant = false) => {
    const indicator = indicatorRef.current;
    if (!indicator || !button) return;
    const target = { x: button.offsetLeft, width: button.offsetWidth };
    if (instant) {
      gsap.set(indicator, target);
    } else {
      gsap.to(indicator, { ...target, duration: 0.5, ease: 'power3.out', overwrite: 'auto' });
    }
  }, []);

  useLayoutEffect(() => {
    const button = buttonsRef.current.get(activeCategory);
    if (firstRunRef.current) {
      firstRunRef.current = false;
      placeIndicator(button, true);
    } else {
      placeIndicator(button, false);
    }
  }, [activeCategory, placeIndicator]);

  useLayoutEffect(() => {
    const button = buttonsRef.current.get(activeCategory);
    placeIndicator(button, true);
  }, [items.length, activeCategory, placeIndicator]);

  useLayoutEffect(() => {
    const onResize = () => {
      const button = buttonsRef.current.get(activeCategory);
      placeIndicator(button, true);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [activeCategory, placeIndicator]);

  const handleSelect = useCallback(
    (key) => {
      if (key === activeCategory) return;
      const nav = navRef.current;
      const button = buttonsRef.current.get(key);
      if (nav && button) {
        nav.scrollTo({
          left: button.offsetLeft - nav.clientWidth / 2 + button.offsetWidth / 2,
          behavior: 'smooth',
        });
      }
      onSelect(key);
    },
    [activeCategory, onSelect]
  );

  return (
    <nav className="category-nav" ref={navRef} aria-label="Shop by category">
      <ul className="category-nav__list">
        {items.map((item) => (
          <li key={item.key} className="category-nav__item">
            <button
              type="button"
              ref={(node) => {
                if (node) buttonsRef.current.set(item.key, node);
                else buttonsRef.current.delete(item.key);
              }}
              className="category-nav__button"
              aria-current={activeCategory === item.key ? 'true' : undefined}
              onClick={() => handleSelect(item.key)}
            >
              {item.label}
            </button>
          </li>
        ))}
        {loading &&
          Array.from({ length: 5 }).map((_, i) => (
            <li key={`skeleton-${i}`} className="category-nav__item" aria-hidden="true">
              <span className="category-nav__skeleton" />
            </li>
          ))}
      </ul>
      <span className="category-nav__indicator" ref={indicatorRef} aria-hidden="true" />
    </nav>
  );
}