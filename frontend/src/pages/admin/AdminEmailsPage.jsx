import { useCallback, useEffect, useState } from 'react';
import api from '../../api/axios';
import './AdminEmailsPage.css';

const DEFAULT_LIMIT = 10;

const STATUS_LABELS = {
  queued: 'Queued',
  sending: 'Sending',
  sent: 'Sent',
  failed: 'Failed',
};

const TYPE_LABELS = {
  ORDER_CREATED: 'Order created',
  ORDER_CONFIRMED: 'Order confirmed',
  PAYMENT_SUCCESS: 'Payment success',
  PAYMENT_FAILED: 'Payment failed',
  ORDER_SHIPPED: 'Order shipped',
  ORDER_DELIVERED: 'Order delivered',
  ORDER_CANCELLED: 'Order cancelled',
  REFUND_INITIATED: 'Refund initiated',
  REFUND_COMPLETED: 'Refund completed',
  REVIEW_APPROVED: 'Review approved',
  ADMIN_PAYMENT_FAILED: 'Admin payment failed',
  ADMIN_REFUND: 'Admin refund',
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

function shortId(value) {
  if (!value) return '—';
  return value.length > 12 ? `${value.slice(0, 12)}…` : value;
}

function AdminEmailsPage() {
  const [logs, setLogs] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: DEFAULT_LIMIT,
    total: 0,
    totalPages: 0,
  });
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [retryingId, setRetryingId] = useState(null);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (typeFilter) params.set('type', typeFilter);
      params.set('page', String(pagination.page));
      params.set('limit', String(pagination.limit));

      const res = await api.get('/admin/emails', { params });
      const data = res.data?.data;
      setLogs(data?.logs || []);
      setPagination(
        data?.pagination || {
          page: 1,
          limit: DEFAULT_LIMIT,
          total: 0,
          totalPages: 0,
        }
      );
    } catch (err) {
      setError(err.apiMessage || 'Unable to load email logs. Please try again.');
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, typeFilter, pagination.page, pagination.limit]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const handleFilterChange = useCallback((key, value) => {
    if (key === 'status') setStatusFilter(value);
    if (key === 'type') setTypeFilter(value);
    setPagination((prev) => ({ ...prev, page: 1 }));
  }, []);

  const handlePageChange = useCallback((page) => {
    setPagination((prev) => ({ ...prev, page }));
  }, []);

  const handleRetry = useCallback(
    async (log) => {
      setRetryingId(log.id);
      setActionError(null);
      try {
        const res = await api.post(`/admin/emails/${log.id}/retry`);
        const email = res.data?.data?.email;
        await loadLogs();
        if (email?.status === 'failed') {
          setNotice('Retry attempted — email delivery is still failing.');
        } else if (email?.status === 'sent') {
          setNotice('Email retried and delivered successfully.');
        } else {
          setNotice('Email retry attempted.');
        }
      } catch (err) {
        setActionError(err.apiMessage || 'Unable to retry the email. Please try again.');
      } finally {
        setRetryingId(null);
      }
    },
    [loadLogs]
  );

  if (loading) {
    return (
      <section className="admin-emails" aria-live="polite">
        <div className="admin-emails__skeleton">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="admin-emails__skeleton-row" />
          ))}
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="admin-emails" aria-live="polite">
        <div className="admin-emails__state admin-emails__state--error" role="alert">
          <h2>Error loading email logs.</h2>
          <p>{error}</p>
          <button
            className="admin-emails__retry"
            onClick={() => loadLogs()}
            aria-label="Retry loading email logs"
          >
            Retry
          </button>
        </div>
      </section>
    );
  }

  const hasFilters = Boolean(statusFilter) || Boolean(typeFilter);

  return (
    <section className="admin-emails" aria-live="polite">
      <div className="admin-emails__header">
        <h1 className="admin-emails__title">Emails</h1>
      </div>

      <div className="admin-emails__toolbar">
        <div className="admin-emails__filters-wrap">
          <select
            className="admin-emails__filter-select"
            value={statusFilter}
            onChange={(e) => handleFilterChange('status', e.target.value)}
            aria-label="Filter by email status"
          >
            <option value="">All statuses</option>
            <option value="queued">Queued</option>
            <option value="sending">Sending</option>
            <option value="sent">Sent</option>
            <option value="failed">Failed</option>
          </select>

          <select
            className="admin-emails__filter-select"
            value={typeFilter}
            onChange={(e) => handleFilterChange('type', e.target.value)}
            aria-label="Filter by email type"
          >
            <option value="">All types</option>
            {Object.entries(TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <p className="admin-emails__filter-note">
          Status and type filters are applied by the backend.
        </p>
      </div>

      {notice && (
        <div className="admin-emails__notice" role="status">
          {notice}
        </div>
      )}

      {actionError && (
        <div className="admin-emails__action-error" role="alert">
          {actionError}
        </div>
      )}

      {logs.length === 0 ? (
        <div className="admin-emails__empty" role="status">
          {hasFilters
            ? 'No emails match the current filters.'
            : 'No emails logged yet.'}
        </div>
      ) : (
        <>
          <div className="admin-emails__table-wrap">
            <table className="admin-emails__table">
              <thead>
                <tr>
                  <th className="admin-emails__col-recipient">Recipient</th>
                  <th className="admin-emails__col-subject">Subject</th>
                  <th className="admin-emails__col-type">Type</th>
                  <th className="admin-emails__col-status">Status</th>
                  <th className="admin-emails__col-attempts">Attempts</th>
                  <th className="admin-emails__col-sent">Sent / Created</th>
                  <th className="admin-emails__col-related">Related</th>
                  <th className="admin-emails__col-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="admin-emails__row">
                    <td className="admin-emails__col-recipient">
                      {log.recipient}
                    </td>
                    <td className="admin-emails__col-subject">
                      <p className="admin-emails__subject">{log.subject}</p>
                      {log.provider && (
                        <span className="admin-emails__provider">
                          via {log.provider}
                        </span>
                      )}
                    </td>
                    <td className="admin-emails__col-type">
                      <span className="admin-emails__type">
                        {TYPE_LABELS[log.type] || log.type}
                      </span>
                    </td>
                    <td className="admin-emails__col-status">
                      <span
                        className={`admin-emails__badge admin-emails__badge--${log.status}`}
                      >
                        {STATUS_LABELS[log.status] || log.status}
                      </span>
                      {log.status === 'failed' && log.lastError && (
                        <span
                          className="admin-emails__last-error"
                          title={log.lastError}
                        >
                          {log.lastError.length > 70
                            ? `${log.lastError.slice(0, 70)}…`
                            : log.lastError}
                        </span>
                      )}
                      {log.nextRetryAt && (
                        <span className="admin-emails__next-retry">
                          Next retry: {formatDateTime(log.nextRetryAt)}
                        </span>
                      )}
                    </td>
                    <td className="admin-emails__col-attempts">
                      {log.attempts ?? 0}
                    </td>
                    <td className="admin-emails__col-sent">
                      <span>{formatDateTime(log.sentAt)}</span>
                      <span className="admin-emails__created">
                        Created: {formatDateTime(log.createdAt)}
                      </span>
                    </td>
                    <td className="admin-emails__col-related">
                      {log.order ? (
                        <span
                          className="admin-emails__related-id"
                          title={log.order}
                        >
                          Order {shortId(log.order)}
                        </span>
                      ) : log.user ? (
                        <span
                          className="admin-emails__related-id"
                          title={log.user}
                        >
                          User {shortId(log.user)}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="admin-emails__col-actions">
                      {log.status === 'failed' ? (
                        <button
                          type="button"
                          className="admin-emails__action-btn"
                          onClick={() => handleRetry(log)}
                          disabled={retryingId === log.id}
                          aria-label={`Retry email to ${log.recipient}`}
                        >
                          {retryingId === log.id ? 'Working…' : 'Retry'}
                        </button>
                      ) : (
                        <span className="admin-emails__no-action">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="admin-emails__pagination">
            <button
              type="button"
              className="admin-emails__pagination-btn"
              disabled={pagination.page <= 1}
              onClick={() => handlePageChange(pagination.page - 1)}
              aria-label="Previous page"
            >
              Previous
            </button>

            <span className="admin-emails__pagination-info">
              Page {pagination.page} of {pagination.totalPages || 1} ·{' '}
              {pagination.total} email{pagination.total === 1 ? '' : 's'}
            </span>

            <button
              type="button"
              className="admin-emails__pagination-btn"
              disabled={pagination.page >= (pagination.totalPages || 1)}
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

export default AdminEmailsPage;