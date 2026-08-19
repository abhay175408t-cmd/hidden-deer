import { useCallback, useMemo } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import Header from '../../Header/Header';
import DeliveryBar from '../DeliveryBar/DeliveryBar';
import CategoryNav from '../CategoryNav/CategoryNav';
import Footer from '../Footer/Footer';
import useCategories from '../../../hooks/useCategories';
import './MainLayout.css';

/**
 * Shared customer layout: persistent top navbar (logo, search, icons),
 * delivery bar and category navbar, with the routed page rendered below and
 * the footer at the bottom. Categories are fetched once here and shared via
 * Outlet context so every page (and the nav) stays in sync.
 */
export default function MainLayout() {
  const { categories, loading, error, retry } = useCategories();
  const navigate = useNavigate();
  const { pathname, search } = useLocation();

  const activeCategory = useMemo(() => {
    if (pathname.startsWith('/category/')) {
      const slug = pathname.split('/')[2];
      return categories.some((category) => category.slug === slug) ? slug : 'discover';
    }
    const querySlug = new URLSearchParams(search).get('category');
    return querySlug && categories.some((category) => category.slug === querySlug)
      ? querySlug
      : 'discover';
  }, [pathname, search, categories]);

  const handleSelect = useCallback(
    (key) => {
      navigate(key === 'discover' ? '/' : `/category/${key}`);
    },
    [navigate]
  );

  const context = useMemo(
    () => ({ categories, categoriesLoading: loading, categoriesError: error, retryCategories: retry }),
    [categories, loading, error, retry]
  );

  return (
    <>
      <Header categories={categories} />
      <DeliveryBar />
      <CategoryNav
        categories={categories}
        activeCategory={activeCategory}
        onSelect={handleSelect}
        loading={loading}
      />
      <main className="main-layout__content" id="main">
        <Outlet context={context} />
      </main>
      <Footer categories={categories} />
    </>
  );
}