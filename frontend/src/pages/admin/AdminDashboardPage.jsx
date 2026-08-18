import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../../api/axios';
import './AdminDashboardPage.css';

const currencyFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

const integerFormatter = new Intl.NumberFormat('en-IN');

const formatCurrency = (value) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return '—';
  }
  return currencyFormatter.format(Number(value));
};

const formatDateLabel = (value) => {
  if (!value) return '—';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';

  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
};

const formatDateTime = (value) => {
  if (!value) return '—';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';

  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

const toTitleCase = (value) => {
  if (!value) return '—';
  return String(value)
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase());
};

function buildChartPoints(series) {
  if (!Array.isArray(series) || series.length === 0) return [];

  const values = series.map((entry) => Number(entry?.revenue ?? 0));
  const maxValue = Math.max(...values, 0);

  return series.map((entry, index) => {
    const value = Number(entry?.revenue ?? 0);
    const x = (index / Math.max(series.length - 1, 1)) * 100;
    const y = maxValue === 0 ? 100 : 100 - (value / maxValue) * 100;
    return `${x},${y}`;
  });
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await api.get('/admin/dashboard/stats');
      setStats(response?.data?.data ?? null);
    } catch (loadError) {
      const status = loadError?.response?.status;
      if (status === 401 || status === 403) {
        setError('Your session is no longer authorized for this dashboard.');
        return;
      }

      setError('Unable to load dashboard data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const summaryCards = useMemo(() => {
    if (!stats) return [];

    const productStats = stats.products || {};
    const orderStats = stats.orders || {};
    const customerStats = stats.customers || {};
    const salesStats = stats.sales || {};

    const cards = [
      {
        label: 'Total products',
        value: productStats.total ?? 0,
        detail: `${productStats.active ?? 0} active`,
      },
      {
        label: 'Total orders',
        value: orderStats.total ?? 0,
        detail: `${orderStats.pending ?? 0} pending`,
      },
      {
        label: 'Total customers',
        value: customerStats.total ?? 0,
        detail: 'Registered users',
      },
      {
        label: 'Revenue',
        value:
          typeof salesStats.revenue === 'number'
            ? formatCurrency(salesStats.revenue)
            : 'Unavailable',
        detail:
          typeof salesStats.revenue === 'number' && salesStats.orderCount
            ? `${integerFormatter.format(salesStats.orderCount)} paid orders`
            : 'No paid-order revenue yet',
      },
      {
        label: 'Low stock',
        value: productStats.lowStock ?? 0,
        detail: 'Products needing attention',
      },
      {
        label: 'Out of stock',
        value: productStats.outOfStock ?? 0,
        detail: 'Unavailable items',
      },
    ];

    return cards;
  }, [stats]);

  const revenueSeries = useMemo(() => {
    if (!stats?.sales) return [];

    const preferred = Array.isArray(stats.sales.last7Days)
      ? stats.sales.last7Days
      : [];

    if (preferred.length > 0) return preferred;
    return Array.isArray(stats.sales.last30Days) ? stats.sales.last30Days : [];
  }, [stats]);

  const chartPoints = useMemo(() => buildChartPoints(revenueSeries), [revenueSeries]);

  const recentOrders = Array.isArray(stats?.recent?.orders) ? stats.recent.orders : [];
  const recentReviews = Array.isArray(stats?.recent?.reviews) ? stats.recent.reviews : [];

  if (loading) {
    return (
      <section className="admin-dashboard" aria-live="polite">
        <div className="admin-dashboard__skeleton-grid">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="admin-dashboard__skeleton-card" />
          ))}
        </div>
        <div className="admin-dashboard__skeleton-panel" />
      </section>
    );
  }

  if (error) {
    return (
      <section className="admin-dashboard" aria-live="polite">
        <div className="admin-dashboard__state admin-dashboard__state--error" role="alert">
          <h2>Unable to load dashboard data.</h2>
          <p>{error}</p>
          <button type="button" onClick={loadDashboard} className="admin-dashboard__retry">
            Retry
          </button>
        </div>
      </section>
    );
  }

  if (!stats) {
    return (
      <section className="admin-dashboard" aria-live="polite">
        <div className="admin-dashboard__state">
          <h2>No dashboard data available.</h2>
          <p>There is no dashboard data to show right now.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="admin-dashboard" aria-live="polite">
      <div className="admin-dashboard__header">
        <div>
          <p className="admin-dashboard__eyebrow">Overview</p>
          <h2 className="admin-dashboard__title">Performance</h2>
        </div>
        {stats.generatedAt && (
          <p className="admin-dashboard__meta">
            Updated {formatDateTime(stats.generatedAt)}
          </p>
        )}
      </div>

      <div className="admin-dashboard__stats-grid">
        {summaryCards.map((card) => (
          <article key={card.label} className="admin-dashboard__stat-card">
            <p className="admin-dashboard__stat-label">{card.label}</p>
            <div className="admin-dashboard__stat-value">{card.value}</div>
            <p className="admin-dashboard__stat-detail">{card.detail}</p>
          </article>
        ))}
      </div>

      {revenueSeries.length > 0 && (
        <article className="admin-dashboard__panel admin-dashboard__panel--wide">
          <div className="admin-dashboard__panel-header">
            <h3>Sales trend</h3>
            <span>{revenueSeries.length}-day revenue</span>
          </div>

          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="admin-dashboard__chart" role="img" aria-label="Sales trend chart">
            <defs>
              <linearGradient id="lineFill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="rgba(17,17,17,0.3)" />
                <stop offset="100%" stopColor="rgba(17,17,17,0)" />
              </linearGradient>
            </defs>
            <polyline
              fill="none"
              stroke="#111111"
              strokeWidth="2.2"
              points={chartPoints.join(' ')}
            />
          </svg>

          <div className="admin-dashboard__chart-labels">
            {revenueSeries.map((day) => (
              <span key={day.date} className="admin-dashboard__chart-label">
                {new Date(day.date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}
              </span>
            ))}
          </div>
        </article>
      )}

      <div className="admin-dashboard__list-grid">
        <article className="admin-dashboard__panel">
          <div className="admin-dashboard__panel-header">
            <h3>Recent orders</h3>
          </div>

          {recentOrders.length > 0 ? (
            <div className="admin-dashboard__table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Customer</th>
                    <th>Date</th>
                    <th>Amount</th>
                    <th>Payment</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentOrders.map((order) => (
                    <tr key={order.id || order.orderNumber || order._id}>
                      <td>{order.orderNumber || `#${String(order.id).slice(-6)}`}</td>
                      <td>{order.user?.name || 'Unknown customer'}</td>
                      <td>{formatDateLabel(order.placedAt)}</td>
                      <td>{formatCurrency(order.total)}</td>
                      <td>{toTitleCase(order.paymentStatus)}</td>
                      <td>{toTitleCase(order.orderStatus)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="admin-dashboard__empty">No orders yet.</p>
          )}
        </article>

        <article className="admin-dashboard__panel">
          <div className="admin-dashboard__panel-header">
            <h3>Recent reviews</h3>
          </div>

          {recentReviews.length > 0 ? (
            <div className="admin-dashboard__review-list">
              {recentReviews.map((review) => (
                <div key={review.id || review._id} className="admin-dashboard__review-item">
                  <div className="admin-dashboard__review-topline">
                    <strong>{review.product?.name || 'Product'}</strong>
                    <span>{'★'.repeat(review.rating || 0)}</span>
                  </div>
                  <p className="admin-dashboard__review-meta">
                    {review.user?.name || 'Customer'} · {formatDateLabel(review.createdAt)}
                  </p>
                  <p className="admin-dashboard__review-status">
                    {toTitleCase(review.status)}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="admin-dashboard__empty">No reviews yet.</p>
          )}
        </article>
      </div>
    </section>
  );
}
