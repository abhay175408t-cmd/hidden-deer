import { useCallback, useEffect, useState } from 'react';
import api from '../../api/axios';
import ConfirmDialog from '../../components/admin/ConfirmDialog';
import './AdminReviewsPage.css';

const DEFAULT_LIMIT = 10;

const STATUS_LABELS = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
};

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

function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function shortId(value) {
  if (!value) return '—';
  return value.length > 12 ? `${value.slice(0, 12)}…` : value;
}

function AdminReviewsPage() {
  const [reviews, setReviews] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: DEFAULT_LIMIT,
    total: 0,
    totalPages: 0,
    hasNextPage: false,
    hasPreviousPage: false,
  });
  const [statusFilter, setStatusFilter] = useState('');
  const [reportedFilter, setReportedFilter] = useState('false');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [moderatingId, setModeratingId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadReviews = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (reportedFilter === 'true') params.set('reported', 'true');
      params.set('page', String(pagination.page));
      params.set('limit', String(pagination.limit));

      const res = await api.get('/admin/reviews', { params });
      const data = res.data?.data;
      setReviews(data?.reviews || []);
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
      setError(err.apiMessage || 'Unable to load reviews. Please try again.');
      setReviews([]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, reportedFilter, pagination.page, pagination.limit]);

  useEffect(() => {
    loadReviews();
  }, [loadReviews]);

  const handleFilterChange = useCallback(
    (key, value) => {
      if (key === 'status') setStatusFilter(value);
      if (key === 'reported') setReportedFilter(value);
      setPagination((prev) => ({ ...prev, page: 1 }));
    },
    []
  );

  const handlePageChange = useCallback((page) => {
    setPagination((prev) => ({ ...prev, page }));
  }, []);

  const handleModerate = useCallback(
    async (review, status) => {
      setModeratingId(review.id);
      setActionError(null);
      try {
        await api.patch(`/admin/reviews/${review.id}/status`, { status });
        setReviews((prev) =>
          prev.map((r) => (r.id === review.id ? { ...r, status } : r))
        );
        setNotice(
          `Review ${status === 'approved' ? 'approved' : 'rejected'}.`
        );
      } catch (err) {
        setActionError(err.apiMessage || 'Unable to update the review. Please try again.');
      } finally {
        setModeratingId(null);
      }
    },
    []
  );

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    setActionError(null);
    try {
      await api.delete(`/admin/reviews/${deleteTarget.id}`);
      setReviews((prev) => prev.filter((r) => r.id !== deleteTarget.id));
      setDeleteTarget(null);
      setNotice('Review deleted.');
    } catch (err) {
      setActionError(err.apiMessage || 'Unable to delete the review. Please try again.');
      setDeleteTarget(null);
    } finally {
      setIsDeleting(false);
    }
  }, [deleteTarget]);

  if (loading) {
    return (
      <section className="admin-reviews" aria-live="polite">
        <div className="admin-reviews__skeleton">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="admin-reviews__skeleton-row" />
          ))}
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="admin-reviews" aria-live="polite">
        <div className="admin-reviews__state admin-reviews__state--error" role="alert">
          <h2>Error loading reviews.</h2>
          <p>{error}</p>
          <button
            className="admin-reviews__retry"
            onClick={() => loadReviews()}
            aria-label="Retry loading reviews"
          >
            Retry
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="admin-reviews" aria-live="polite">
      <div className="admin-reviews__header">
        <h1 className="admin-reviews__title">Reviews</h1>
      </div>

      <div className="admin-reviews__toolbar">
        <div className="admin-reviews__filters-wrap">
          <select
            className="admin-reviews__filter-select"
            value={statusFilter}
            onChange={(e) => handleFilterChange('status', e.target.value)}
            aria-label="Filter by review status"
          >
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>

          <select
            className="admin-reviews__filter-select"
            value={reportedFilter}
            onChange={(e) => handleFilterChange('reported', e.target.value)}
            aria-label="Filter by reported reviews"
          >
            <option value="false">All reviews</option>
            <option value="true">Reported only</option>
          </select>
        </div>
      </div>

      {notice && (
        <div className="admin-reviews__notice" role="status">
          {notice}
        </div>
      )}

      {actionError && (
        <div className="admin-reviews__action-error" role="alert">
          {actionError}
        </div>
      )}

      {reviews.length === 0 ? (
        <div className="admin-reviews__empty" role="status">
          {statusFilter || reportedFilter === 'true'
            ? 'No reviews match the current filters.'
            : 'No reviews found.'}
        </div>
      ) : (
        <>
          <div className="admin-reviews__table-wrap">
            <table className="admin-reviews__table">
              <thead>
                <tr>
                  <th className="admin-reviews__col-product">Product</th>
                  <th className="admin-reviews__col-customer">Customer</th>
                  <th className="admin-reviews__col-rating">Rating</th>
                  <th className="admin-reviews__col-comment">Review</th>
                  <th className="admin-reviews__col-date">Date</th>
                  <th className="admin-reviews__col-status">Status</th>
                  <th className="admin-reviews__col-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {reviews.map((review) => (
                  <tr key={review.id} className="admin-reviews__row">
                    <td className="admin-reviews__col-product">
                      <span
                        className="admin-reviews__product-id"
                        title={review.product}
                      >
                        {shortId(review.product)}
                      </span>
                    </td>
                    <td className="admin-reviews__col-customer">
                      <span className="admin-reviews__customer-name">
                        {review.user?.name || 'Unknown'}
                      </span>
                      {review.user?.email && (
                        <span className="admin-reviews__customer-email">
                          {review.user.email}
                        </span>
                      )}
                    </td>
                    <td className="admin-reviews__col-rating">
                      <span
                        className="admin-reviews__stars"
                        aria-label={`${review.rating} out of 5 stars`}
                      >
                        {'★'.repeat(review.rating)}
                        <span aria-hidden="true">
                          {'★'.repeat(5 - review.rating)}
                        </span>
                      </span>
                    </td>
                    <td className="admin-reviews__col-comment">
                      <p className="admin-reviews__comment">{review.comment}</p>
                      <div className="admin-reviews__meta">
                        {review.isVerifiedPurchase && (
                          <span className="admin-reviews__verified">
                            Verified purchase
                          </span>
                        )}
                        {review.reportCount > 0 && (
                          <span className="admin-reviews__reported">
                            {review.reportCount} report
                            {review.reportCount === 1 ? '' : 's'}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="admin-reviews__col-date">
                      {formatDateTime(review.createdAt)}
                    </td>
                    <td className="admin-reviews__col-status">
                      <span
                        className={`admin-reviews__badge admin-reviews__badge--${review.status}`}
                      >
                        {STATUS_LABELS[review.status] || review.status}
                      </span>
                    </td>
                    <td className="admin-reviews__col-actions">
                      {review.status !== 'approved' && (
                        <button
                          type="button"
                          className="admin-reviews__action-btn"
                          onClick={() => handleModerate(review, 'approved')}
                          disabled={moderatingId === review.id}
                          aria-label={`Approve review by ${review.user?.name || 'customer'}`}
                        >
                          {moderatingId === review.id ? 'Working…' : 'Approve'}
                        </button>
                      )}
                      {review.status !== 'rejected' && (
                        <button
                          type="button"
                          className="admin-reviews__action-btn admin-reviews__action-btn--danger"
                          onClick={() => handleModerate(review, 'rejected')}
                          disabled={moderatingId === review.id}
                          aria-label={`Reject review by ${review.user?.name || 'customer'}`}
                        >
                          {moderatingId === review.id ? 'Working…' : 'Reject'}
                        </button>
                      )}
                      <button
                        type="button"
                        className="admin-reviews__action-btn admin-reviews__action-btn--delete"
                        onClick={() => setDeleteTarget(review)}
                        disabled={moderatingId === review.id}
                        aria-label={`Delete review by ${review.user?.name || 'customer'}`}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="admin-reviews__pagination">
            <button
              type="button"
              className="admin-reviews__pagination-btn"
              disabled={!pagination.hasPreviousPage}
              onClick={() => handlePageChange(pagination.page - 1)}
              aria-label="Previous page"
            >
              Previous
            </button>

            <span className="admin-reviews__pagination-info">
              Page {pagination.page} of {pagination.totalPages || 1} ·{' '}
              {pagination.total} review{pagination.total === 1 ? '' : 's'}
            </span>

            <button
              type="button"
              className="admin-reviews__pagination-btn"
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
        open={deleteTarget !== null}
        title="Delete this review?"
        message="This permanently removes the review. The product's rating and review count are recomputed by the backend."
        confirmLabel="Delete"
        busy={isDeleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </section>
  );
}

export default AdminReviewsPage;