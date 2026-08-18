import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/axios';
import ConfirmDialog from '../../components/admin/ConfirmDialog';
import './AdminCouponsPage.css';

const SEARCH_DEBOUNCE_MS = 300;
const DEFAULT_LIMIT = 10;

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatCurrency(value) {
  if (value === undefined || value === null) return '—';
  return `₹${Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

function discountLabel(coupon) {
  if (coupon.discountType === 'percent') {
    const base = `${Number(coupon.discountValue)}%`;
    return coupon.maxDiscount ? `${base} (max ${formatCurrency(coupon.maxDiscount)})` : base;
  }
  return formatCurrency(coupon.discountValue);
}

function AdminCouponsPage() {
  const navigate = useNavigate();
  const [coupons, setCoupons] = useState([]);
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
  const [isActiveFilter, setIsActiveFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [deactivateTarget, setDeactivateTarget] = useState(null);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setSearchApplied(searchInput);
      setPagination((prev) => ({ ...prev, page: 1 }));
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeoutId);
  }, [searchInput]);

  const loadCoupons = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (searchApplied) params.set('search', searchApplied);
      if (isActiveFilter) params.set('isActive', isActiveFilter);
      params.set('page', String(pagination.page));
      params.set('limit', String(pagination.limit));

      const res = await api.get('/admin/coupons', { params });
      const data = res.data?.data;
      setCoupons(data?.coupons || []);
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
      setError(err.apiMessage || 'Unable to load coupons. Please try again.');
      setCoupons([]);
    } finally {
      setLoading(false);
    }
  }, [searchApplied, isActiveFilter, pagination.page, pagination.limit]);

  useEffect(() => {
    loadCoupons();
  }, [loadCoupons]);

  const handleActiveFilterChange = useCallback((value) => {
    setIsActiveFilter(value);
    setPagination((prev) => ({ ...prev, page: 1 }));
  }, []);

  const handlePageChange = useCallback((page) => {
    setPagination((prev) => ({ ...prev, page }));
  }, []);

  const handleDeactivate = useCallback(async () => {
    if (!deactivateTarget) return;
    setIsUpdating(true);
    setActionError(null);
    try {
      await api.delete(`/admin/coupons/${deactivateTarget.id}`);
      setCoupons((prev) =>
        isActiveFilter === 'true'
          ? prev.filter((c) => c.id !== deactivateTarget.id)
          : prev.map((c) => (c.id === deactivateTarget.id ? { ...c, isActive: false } : c))
      );
      setDeactivateTarget(null);
      setNotice('Coupon deactivated.');
    } catch (err) {
      setActionError(err.apiMessage || 'Unable to deactivate the coupon. Please try again.');
      setDeactivateTarget(null);
    } finally {
      setIsUpdating(false);
    }
  }, [deactivateTarget, isActiveFilter]);

  const handleReactivate = useCallback(
    async (coupon) => {
      setIsUpdating(true);
      setActionError(null);
      try {
        await api.patch(`/admin/coupons/${coupon.id}`, { isActive: true });
        setCoupons((prev) =>
          isActiveFilter === 'false'
            ? prev.filter((c) => c.id !== coupon.id)
            : prev.map((c) => (c.id === coupon.id ? { ...c, isActive: true } : c))
        );
        setNotice('Coupon reactivated.');
      } catch (err) {
        setActionError(err.apiMessage || 'Unable to reactivate the coupon. Please try again.');
      } finally {
        setIsUpdating(false);
      }
    },
    [isActiveFilter]
  );

  if (loading) {
    return (
      <section className="admin-coupons" aria-live="polite">
        <div className="admin-coupons__skeleton">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="admin-coupons__skeleton-row" />
          ))}
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="admin-coupons" aria-live="polite">
        <div className="admin-coupons__state admin-coupons__state--error" role="alert">
          <h2>Error loading coupons.</h2>
          <p>{error}</p>
          <button
            className="admin-coupons__retry"
            onClick={() => loadCoupons()}
            aria-label="Retry loading coupons"
          >
            Retry
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="admin-coupons" aria-live="polite">
      <div className="admin-coupons__header">
        <h1 className="admin-coupons__title">Coupons</h1>
        <button
          type="button"
          className="admin-coupons__add-btn"
          onClick={() => navigate('/admin/coupons/new')}
          aria-label="Create a new coupon"
        >
          Add Coupon
        </button>
      </div>

      <div className="admin-coupons__toolbar">
        <div className="admin-coupons__search-wrap">
          <input
            type="text"
            className="admin-coupons__search-input"
            placeholder="Search by code…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            aria-label="Search coupons by code"
          />
        </div>

        <div className="admin-coupons__filters-wrap">
          <select
            className="admin-coupons__filter-select"
            value={isActiveFilter}
            onChange={(e) => handleActiveFilterChange(e.target.value)}
            aria-label="Filter by coupon status"
          >
            <option value="">All statuses</option>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
        </div>
      </div>

      {notice && (
        <div className="admin-coupons__notice" role="status">
          {notice}
        </div>
      )}

      {actionError && (
        <div className="admin-coupons__action-error" role="alert">
          {actionError}
        </div>
      )}

      {coupons.length === 0 ? (
        <div className="admin-coupons__empty" role="status">
          {searchApplied || isActiveFilter
            ? 'No coupons match the current filters.'
            : 'No coupons found. Create your first coupon to get started.'}
        </div>
      ) : (
        <>
          <div className="admin-coupons__table-wrap">
            <table className="admin-coupons__table">
              <thead>
                <tr>
                  <th className="admin-coupons__col-code">Code</th>
                  <th className="admin-coupons__col-discount">Discount</th>
                  <th className="admin-coupons__col-min">Min. cart</th>
                  <th className="admin-coupons__col-usage">Usage</th>
                  <th className="admin-coupons__col-expiry">Expires</th>
                  <th className="admin-coupons__col-flags">Rules</th>
                  <th className="admin-coupons__col-status">Status</th>
                  <th className="admin-coupons__col-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {coupons.map((coupon) => (
                  <tr key={coupon.id} className="admin-coupons__row">
                    <td className="admin-coupons__col-code">
                      <span className="admin-coupons__code">{coupon.code}</span>
                      {coupon.description && (
                        <span className="admin-coupons__description">
                          {coupon.description}
                        </span>
                      )}
                    </td>
                    <td className="admin-coupons__col-discount">
                      {discountLabel(coupon)}
                    </td>
                    <td className="admin-coupons__col-min">
                      {formatCurrency(coupon.minCartValue)}
                    </td>
                    <td className="admin-coupons__col-usage">
                      {coupon.usageCount ?? 0}
                      {coupon.usageLimit ? ` / ${coupon.usageLimit}` : ''}
                    </td>
                    <td className="admin-coupons__col-expiry">
                      {formatDate(coupon.expiresAt)}
                    </td>
                    <td className="admin-coupons__col-flags">
                      {coupon.firstOrderOnly && (
                        <span className="admin-coupons__flag">First order</span>
                      )}
                      {coupon.applicableProducts?.length > 0 && (
                        <span className="admin-coupons__flag">Products</span>
                      )}
                      {coupon.applicableCategories?.length > 0 && (
                        <span className="admin-coupons__flag">Categories</span>
                      )}
                      {!coupon.firstOrderOnly &&
                        !(coupon.applicableProducts?.length > 0) &&
                        !(coupon.applicableCategories?.length > 0) && (
                          <span className="admin-coupons__flag">All items</span>
                        )}
                    </td>
                    <td className="admin-coupons__col-status">
                      <span
                        className={`admin-coupons__badge ${
                          coupon.isActive
                            ? 'admin-coupons__badge--active'
                            : 'admin-coupons__badge--inactive'
                        }`}
                      >
                        {coupon.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="admin-coupons__col-actions">
                      <button
                        type="button"
                        className="admin-coupons__action-btn"
                        onClick={() => navigate(`/admin/coupons/${coupon.id}/edit`)}
                        aria-label={`Edit coupon ${coupon.code}`}
                      >
                        Edit
                      </button>
                      {coupon.isActive ? (
                        <button
                          type="button"
                          className="admin-coupons__action-btn admin-coupons__action-btn--danger"
                          onClick={() => setDeactivateTarget(coupon)}
                          disabled={isUpdating}
                          aria-label={`Deactivate coupon ${coupon.code}`}
                        >
                          Deactivate
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="admin-coupons__action-btn"
                          onClick={() => handleReactivate(coupon)}
                          disabled={isUpdating}
                          aria-label={`Reactivate coupon ${coupon.code}`}
                        >
                          Reactivate
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="admin-coupons__pagination">
            <button
              type="button"
              className="admin-coupons__pagination-btn"
              disabled={!pagination.hasPreviousPage}
              onClick={() => handlePageChange(pagination.page - 1)}
              aria-label="Previous page"
            >
              Previous
            </button>

            <span className="admin-coupons__pagination-info">
              Page {pagination.page} of {pagination.totalPages || 1} ·{' '}
              {pagination.total} coupon{pagination.total === 1 ? '' : 's'}
            </span>

            <button
              type="button"
              className="admin-coupons__pagination-btn"
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
        open={deactivateTarget !== null}
        title="Deactivate this coupon?"
        message={`"${deactivateTarget?.code || ''}" will no longer be usable by customers. You can reactivate it later from this list.`}
        confirmLabel="Deactivate"
        busy={isUpdating}
        onConfirm={handleDeactivate}
        onCancel={() => setDeactivateTarget(null)}
      />
    </section>
  );
}

export default AdminCouponsPage;