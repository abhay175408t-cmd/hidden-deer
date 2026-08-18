import { useCallback, useEffect, useState } from 'react';
import api from '../../api/axios';
import './AdminNotificationsPage.css';

const DEFAULT_LIMIT = 20;

const TYPE_LABELS = {
  ORDER: 'Order',
  PAYMENT: 'Payment',
  SHIPPING: 'Shipping',
  DELIVERY: 'Delivery',
  REFUND: 'Refund',
  REVIEW: 'Review',
  ACCOUNT: 'Account',
  PROMOTION: 'Promotion',
};

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

function AdminNotificationsPage() {
  const [notifications, setNotifications] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: DEFAULT_LIMIT,
    total: 0,
    totalPages: 0,
    hasNextPage: false,
    hasPreviousPage: false,
  });
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (unreadOnly) params.set('unreadOnly', 'true');
      params.set('page', String(pagination.page));
      params.set('limit', String(pagination.limit));

      const res = await api.get('/admin/notifications', { params });
      const data = res.data?.data;
      setNotifications(data?.notifications || []);
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
      setError(err.apiMessage || 'Unable to load notifications. Please try again.');
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }, [unreadOnly, pagination.page, pagination.limit]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  const handleUnreadFilterChange = useCallback((value) => {
    setUnreadOnly(value);
    setPagination((prev) => ({ ...prev, page: 1 }));
  }, []);

  const handlePageChange = useCallback((page) => {
    setPagination((prev) => ({ ...prev, page }));
  }, []);

  const handleRefresh = useCallback(() => {
    loadNotifications();
  }, [loadNotifications]);

  if (loading) {
    return (
      <section className="admin-notifications" aria-live="polite">
        <div className="admin-notifications__skeleton">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="admin-notifications__skeleton-row" />
          ))}
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="admin-notifications" aria-live="polite">
        <div className="admin-notifications__state admin-notifications__state--error" role="alert">
          <h2>Error loading notifications.</h2>
          <p>{error}</p>
          <button
            className="admin-notifications__retry"
            onClick={() => loadNotifications()}
            aria-label="Retry loading notifications"
          >
            Retry
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="admin-notifications" aria-live="polite">
      <div className="admin-notifications__header">
        <h1 className="admin-notifications__title">Notifications</h1>
        <div className="admin-notifications__header-actions">
          <select
            className="admin-notifications__filter-select"
            value={unreadOnly ? 'unread' : 'all'}
            onChange={(e) => handleUnreadFilterChange(e.target.value === 'unread')}
            aria-label="Filter notifications by read status"
          >
            <option value="all">All notifications</option>
            <option value="unread">Unread only</option>
          </select>
          <button
            type="button"
            className="admin-notifications__refresh-btn"
            onClick={handleRefresh}
            aria-label="Refresh notifications"
          >
            Refresh
          </button>
        </div>
      </div>

      <p className="admin-notifications__note">
        These are notifications for your admin account. There is no customer
        broadcast system.
      </p>

      {notifications.length === 0 ? (
        <div className="admin-notifications__empty" role="status">
          {unreadOnly
            ? 'No unread notifications.'
            : 'No notifications found.'}
        </div>
      ) : (
        <>
          <ul className="admin-notifications__list">
            {notifications.map((notification) => {
              const isUnread = notification.isRead !== true;
              return (
                <li
                  key={notification.id}
                  className={`admin-notifications__item ${
                    isUnread ? 'is-unread' : ''
                  }`}
                >
                  <div className="admin-notifications__item-head">
                    <span className="admin-notifications__item-type">
                      {TYPE_LABELS[notification.type] || notification.type}
                    </span>
                    {isUnread && (
                      <span className="admin-notifications__unread-label">
                        <span
                          className="admin-notifications__unread-dot"
                          aria-hidden="true"
                        />
                        Unread
                      </span>
                    )}
                  </div>
                  <h2 className="admin-notifications__item-title">
                    {notification.title}
                  </h2>
                  <p className="admin-notifications__item-message">
                    {notification.message}
                  </p>
                  <p className="admin-notifications__item-date">
                    {formatDateTime(notification.createdAt)}
                  </p>
                </li>
              );
            })}
          </ul>

          <div className="admin-notifications__pagination">
            <button
              type="button"
              className="admin-notifications__pagination-btn"
              disabled={!pagination.hasPreviousPage}
              onClick={() => handlePageChange(pagination.page - 1)}
              aria-label="Previous page"
            >
              Previous
            </button>

            <span className="admin-notifications__pagination-info">
              Page {pagination.page} of {pagination.totalPages || 1} ·{' '}
              {pagination.total} notification
              {pagination.total === 1 ? '' : 's'}
            </span>

            <button
              type="button"
              className="admin-notifications__pagination-btn"
              disabled={!pagination.hasNextPage}
              onClick={() => handlePageChange(pagination.page + 1)}
              aria-label="Next page"
            >
              Next
            </button>
          </div>
        </>
      )}
    </section>
  );
}

export default AdminNotificationsPage;