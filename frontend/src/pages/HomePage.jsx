import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { gsap } from '../lib/gsap';
import Loader from '../components/Loader/Loader';
import EditorialMarquee from '../components/customer/EditorialMarquee/EditorialMarquee';
import FeaturedCategories from '../components/customer/FeaturedCategories/FeaturedCategories';
import CampaignPosters from '../components/customer/CampaignPosters/CampaignPosters';
import FullWidthCampaign from '../components/customer/FullWidthCampaign/FullWidthCampaign';
import ProductSection from '../components/customer/ProductSection/ProductSection';
import { marqueeAds, campaignPosters, fullWidthCampaign } from '../data/homepageCampaigns';
import { filterFeaturedByBackend } from '../data/featuredCategories';
import './HomePage.css';

/**
 * HIDDEN DEER customer Discovery homepage.
 *
 * Layout order: Editorial marquee → Featured categories → Campaign posters →
 * Full-width offer → New & Popular (with filters + scroll-based lazy loading).
 * The persistent header, delivery bar, category nav and footer are provided by
 * the shared MainLayout; categories come from its Outlet context.
 *
 * The top category nav navigates to the dedicated /category/<slug> listing
 * pages. The in-page chips below keep filtering the product section via the
 * /?category=<slug> search param.
 *
 * The URL is the single source of truth for the active category — it is
 * derived from search params, so a selection can never race with the URL
 * settling (no duplicated state to go stale).
 */
export default function HomePage() {
  const {
    categories,
    categoriesLoading,
    categoriesError,
    retryCategories,
  } = useOutletContext();

  const [showLoader, setShowLoader] = useState(true);
  const [searchParams, setSearchParams] = useSearchParams();
  const pageRef = useRef(null);
  const shouldScrollRef = useRef(false);
  const uiWriteRef = useRef(false);
  const prevCategoryRef = useRef(null);

  const activeCategory = useMemo(() => {
    const slug = searchParams.get('category');
    if (!slug) return 'discover';
    return categories.some((category) => category.slug === slug) ? slug : 'discover';
  }, [searchParams, categories]);

  // Campaign links must always point at categories that really exist on the
  // backend — otherwise they'd lead to dead discovery filters. Categories
  // without a known slug fall back to the full discovery page.
  const categorySlugs = useMemo(
    () => new Set((categories || []).map((category) => category.slug)),
    [categories]
  );
  const resolveCategoryLink = useCallback(
    (categorySlug) =>
      categorySlugs.has(categorySlug) ? `/category/${categorySlug}` : '/',
    [categorySlugs]
  );
  const resolvedAds = useMemo(
    () => marqueeAds.map((ad) => ({ ...ad, href: resolveCategoryLink(ad.categorySlug) })),
    [resolveCategoryLink]
  );
  const resolvedPosters = useMemo(
    () => campaignPosters.map((poster) => ({ ...poster, href: resolveCategoryLink(poster.categorySlug) })),
    [resolveCategoryLink]
  );
  const resolvedBanner = useMemo(
    () => ({ ...fullWidthCampaign, href: resolveCategoryLink(fullWidthCampaign.categorySlug) }),
    [resolveCategoryLink]
  );

  const selectCategory = useCallback(
    (key, { scroll = false } = {}) => {
      if (scroll) shouldScrollRef.current = true;
      uiWriteRef.current = true;
      const nextParams = new URLSearchParams(searchParams);
      if (key && key !== 'discover') nextParams.set('category', key);
      else nextParams.delete('category');
      setSearchParams(nextParams, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  // Smooth scroll to the product section when the active category changes —
  // both from in-page chip selections and from URL-driven navigation
  // (back/forward, footer links). Never on first load.
  useEffect(() => {
    if (categoriesLoading) return undefined;
    const prev = prevCategoryRef.current;
    prevCategoryRef.current = activeCategory;
    if (prev === null || prev === activeCategory) return undefined;
    if (uiWriteRef.current && !shouldScrollRef.current) return undefined;
    const timer = setTimeout(() => {
      document
        .getElementById('new-and-popular')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 420);
    return () => clearTimeout(timer);
  }, [activeCategory, categoriesLoading]);

  // Clear the UI-write marker once the URL has settled, so a later URL-driven
  // change (e.g. back/forward) is recognized as such.
  useEffect(() => {
    uiWriteRef.current = false;
  }, [searchParams]);

  // Page entrance once the loader is done.
  useEffect(() => {
    if (showLoader) return undefined;
    const page = pageRef.current;
    if (!page) return undefined;
    const timeline = gsap.timeline({ defaults: { ease: 'power2.out' } });
    timeline.to(page, { opacity: 1, y: 0, duration: 0.9, delay: 0.1 });
    return () => timeline.kill();
  }, [showLoader]);

  return (
    <>
      {showLoader && <Loader onComplete={() => setShowLoader(false)} />}
      <div className="home" ref={pageRef}>
        {categoriesError && (
          <div className="home__notice" role="alert">
            <span>Could not load categories.</span>
            <button type="button" onClick={retryCategories}>
              Retry
            </button>
          </div>
        )}

        <main className="home__content">
          <EditorialMarquee ads={resolvedAds} />
          <FeaturedCategories categories={filterFeaturedByBackend(categories)} />
          <CampaignPosters posters={resolvedPosters} />
          <FullWidthCampaign campaign={resolvedBanner} />
          <ProductSection
            key={activeCategory}
            categories={categories}
            activeCategory={activeCategory}
            onSelectCategory={(key) => selectCategory(key)}
          />
        </main>
      </div>
    </>
  );
}