import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/axios';
import ConfirmDialog from '../../components/admin/ConfirmDialog';
import './AdminProductsPage.css';

const SEARCH_DEBOUNCE_MS = 300;
const DEFAULT_LIMIT = 20;

function formatCurrency(value) {
  if (value === undefined || value === null) return '—';
  return `₹${Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

function AdminProductsPage() {
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: DEFAULT_LIMIT,
    total: 0,
    totalPages: 0,
    hasNextPage: false,
    hasPreviousPage: false,
  });
  const [searchInput, setSearchInput] = useState('');
  const [searchApplied, setSearchApplied] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [isActiveFilter, setIsActiveFilter] = useState('');
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [toggleTarget, setToggleTarget] = useState(null);
  const [isToggling, setIsToggling] = useState(false);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setSearchApplied(searchInput);
      setPagination((prev) => ({ ...prev, page: 1 }));
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeoutId);
  }, [searchInput]);

  useEffect(() => {
    let active = true;
    api
      .get('/categories')
      .then((res) => {
        if (active) setCategories(res.data?.data?.categories || []);
      })
      .catch(() => {
        if (active) setCategories([]);
      });
    return () => {
      active = false;
    };
  }, []);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (searchApplied) params.set('search', searchApplied);
      if (categoryFilter) params.set('category', categoryFilter);
      if (isActiveFilter) params.set('isActive', isActiveFilter);
      params.set('page', String(pagination.page));
      params.set('limit', String(pagination.limit));

      const res = await api.get('/admin/products', { params });
      const data = res.data?.data;
      setProducts(data?.products || []);
      setPagination(
        data?.pagination || {
          page: 1,
          limit: DEFAULT_LIMIT,
          total: 0,
          totalPages: 0,
          hasNextPage: false,
          hasPreviousPage: false,
        }
      );
    } catch (err) {
      setError(err.apiMessage || 'Unable to load products. Please try again.');
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, [searchApplied, categoryFilter, isActiveFilter, pagination.page, pagination.limit]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const handleFilterChange = useCallback((key, value) => {
    if (key === 'category') setCategoryFilter(value);
    if (key === 'isActive') setIsActiveFilter(value);
    setPagination((prev) => ({ ...prev, page: 1 }));
  }, []);

  const handlePageChange = useCallback((page) => {
    setPagination((prev) => ({ ...prev, page }));
  }, []);

  const handleToggle = useCallback(async () => {
    if (!toggleTarget) return;
    setIsToggling(true);
    setActionError(null);
    try {
      if (toggleTarget.isActive) {
        await api.delete(`/products/${toggleTarget.id}`);
      } else {
        await api.patch(`/products/${toggleTarget.id}`, { isActive: true });
      }
      const nextStatus = !toggleTarget.isActive;
      const filterConflict =
        (isActiveFilter === 'true' && !nextStatus) ||
        (isActiveFilter === 'false' && nextStatus);
      setProducts((prev) =>
        filterConflict
          ? prev.filter((p) => p.id !== toggleTarget.id)
          : prev.map((p) =>
              p.id === toggleTarget.id ? { ...p, isActive: nextStatus } : p
            )
      );
      setToggleTarget(null);
      setNotice(
        toggleTarget.isActive
          ? `Product "${toggleTarget.name}" deactivated.`
          : `Product "${toggleTarget.name}" reactivated.`
      );
    } catch (err) {
      setActionError(err.apiMessage || 'Unable to update the product. Please try again.');
      setToggleTarget(null);
    } finally {
      setIsToggling(false);
    }
  }, [toggleTarget, isActiveFilter]);

  if (loading) {
    return (
      <section className="admin-products" aria-live="polite">
        <div className="admin-products__skeleton">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="admin-products__skeleton-row" />
          ))}
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="admin-products" aria-live="polite">
        <div
          className="admin-products__state admin-products__state--error"
          role="alert"
        >
          <h2>Error loading products.</h2>
          <p>{error}</p>
          <button
            className="admin-products__retry"
            onClick={() => loadProducts()}
            aria-label="Retry loading products"
          >
            Retry
          </button>
        </div>
      </section>
    );
  }

  const hasFilters = Boolean(searchApplied) || Boolean(categoryFilter) || Boolean(isActiveFilter);

  return (
    <section className="admin-products" aria-live="polite">
      <div className="admin-products__header">
        <h1 className="admin-products__title">Products</h1>
        <button
          type="button"
          className="admin-products__add-button"
          onClick={() => navigate('/admin/products/new')}
          aria-label="Add new product"
        >
          Add Product
        </button>
      </div>

      <div className="admin-products__toolbar">
        <input
          type="text"
          className="admin-products__search-input"
          placeholder="Search by name, description, brand or tags…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          aria-label="Search products"
        />

        <div className="admin-products__filters-wrap">
          <select
            className="admin-products__filter-select"
            value={categoryFilter}
            onChange={(e) => handleFilterChange('category', e.target.value)}
            aria-label="Filter by category"
          >
            <option value="">All categories</option>
            {categories.map((category) => (
              <option key={category._id} value={category._id}>
                {category.name}
              </option>
            ))}
          </select>

          <select
            className="admin-products__filter-select"
            value={isActiveFilter}
            onChange={(e) => handleFilterChange('isActive', e.target.value)}
            aria-label="Filter by status"
          >
            <option value="">All statuses</option>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
        </div>
      </div>

      {notice && (
        <div className="admin-products__notice" role="status">
          {notice}
        </div>
      )}

      {actionError && (
        <div className="admin-products__action-error" role="alert">
          {actionError}
        </div>
      )}

      {products.length === 0 ? (
        <div className="admin-products__empty" role="status">
          {hasFilters
            ? 'No products match the current filters.'
            : 'No products found.'}
        </div>
      ) : (
        <>
          <div className="admin-products__table-wrap">
            <table className="admin-products__table">
              <thead>
                <tr>
                  <th className="admin-products__thumbnail">Img</th>
                  <th className="admin-products__name">Name</th>
                  <th className="admin-products__category">Category</th>
                  <th className="admin-products__price">Price</th>
                  <th className="admin-products__discount">Discount</th>
                  <th className="admin-products__stock">Stock</th>
                  <th className="admin-products__status">Status</th>
                  <th className="admin-products__indicators">Features</th>
                  <th className="admin-products__actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {products.map((product) => (
                  <tr key={product.id} className="admin-products__row">
                    <td className="admin-products__thumbnail">
                      {product.image?.url ? (
                        <img
                          src={product.image.url}
                          alt={product.image.alt || product.name || ''}
                          className="admin-products__thumbnail-image"
                          width={40}
                          height={40}
                        />
                      ) : (
                        <div className="admin-products__thumbnail-placeholder">
                          <span aria-hidden="true">—</span>
                        </div>
                      )}
                    </td>
                    <td className="admin-products__name">
                      <span>{product.name}</span>
                      <span className="admin-products__meta">
                        {product.sku || 'No SKU'}
                        {typeof product.imagesCount === 'number' &&
                          ` · ${product.imagesCount} image${
                            product.imagesCount === 1 ? '' : 's'
                          }`}
                        {typeof product.variantsCount === 'number' &&
                          ` · ${product.variantsCount} variant${
                            product.variantsCount === 1 ? '' : 's'
                          }`}
                      </span>
                    </td>
                    <td className="admin-products__category">
                      {product.category?.name || '—'}
                    </td>
                    <td className="admin-products__price">
                      {formatCurrency(product.price)}
                    </td>
                    <td className="admin-products__discount">
                      {product.discountPrice ? (
                        <>
                          {formatCurrency(product.discountPrice)}{' '}
                          <span className="admin-products__discount-pct">
                            (
                            {Math.round(
                              ((product.price - product.discountPrice) /
                                product.price) *
                                100
                            )}
                            % off)
                          </span>
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="admin-products__stock">
                      {product.stock !== undefined && product.stock !== null ? (
                        <span
                          className={`admin-products__stock-value admin-products__stock--${product.stockStatus || 'in-stock'}`}
                        >
                          {product.stock} · {product.stockStatus || 'in stock'}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="admin-products__status">
                      <span
                        className={`admin-products__status-badge ${
                          product.isActive
                            ? 'admin-products__status-badge--active'
                            : 'admin-products__status-badge--inactive'
                        }`}
                      >
                        {product.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="admin-products__indicators">
                      {product.isFeatured && (
                        <span
                          className="admin-products__indicator admin-products__indicator--featured"
                          title="Featured"
                        >
                          F
                        </span>
                      )}
                      {product.isNew && (
                        <span
                          className="admin-products__indicator admin-products__indicator--new"
                          title="New"
                        >
                          N
                        </span>
                      )}
                      {product.isBestSeller && (
                        <span
                          className="admin-products__indicator admin-products__indicator--best-seller"
                          title="Best seller"
                        >
                          B
                        </span>
                      )}
                      {!product.isFeatured &&
                        !product.isNew &&
                        !product.isBestSeller && (
                          <span className="admin-products__indicator admin-products__indicator--none">
                            —
                          </span>
                        )}
                    </td>
                    <td className="admin-products__actions">
                      <button
                        type="button"
                        className="admin-products__action-btn"
                        onClick={() => navigate(`/admin/products/${product.id}/edit`)}
                        aria-label={`Edit product ${product.name}`}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="admin-products__action-btn admin-products__action-btn--danger"
                        onClick={() => setToggleTarget(product)}
                        aria-label={
                          product.isActive
                            ? `Deactivate product ${product.name}`
                            : `Reactivate product ${product.name}`
                        }
                      >
                        {product.isActive ? 'Deactivate' : 'Reactivate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="admin-products__pagination">
            <button
              type="button"
              className="admin-products__pagination-btn"
              disabled={!pagination.hasPreviousPage}
              onClick={() => handlePageChange(pagination.page - 1)}
              aria-label="Previous page"
            >
              Previous
            </button>

            <span className="admin-products__pagination-info">
              Page {pagination.page} of {pagination.totalPages || 1} ·{' '}
              {pagination.total} product{pagination.total === 1 ? '' : 's'}
            </span>

            <button
              type="button"
              className="admin-products__pagination-btn"
              disabled={!pagination.hasNextPage}
              onClick={() => handlePageChange(pagination.page + 1)}
              aria-label="Next page"
            >
              Next
            </button>
          </div>
        </>
      )}

      <ConfirmDialog
        open={toggleTarget !== null}
        title={toggleTarget?.isActive ? 'Deactivate this product?' : 'Reactivate this product?'}
        message={
          toggleTarget?.isActive
            ? `"${toggleTarget?.name || ''}" will no longer appear in the customer catalog. You can reactivate it later.`
            : `"${toggleTarget?.name || ''}" will become visible again in the customer catalog.`
        }
        confirmLabel={toggleTarget?.isActive ? 'Deactivate' : 'Reactivate'}
        busy={isToggling}
        onConfirm={handleToggle}
        onCancel={() => setToggleTarget(null)}
      />
    </section>
  );
}

export default AdminProductsPage;