import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/axios';
import './AdminOrdersPage.css';

const SEARCH_DEBOUNCE_MS = 300;
const DEFAULT_LIMIT = 10;

const ORDER_STATUSES = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'];
const PAYMENT_STATUSES = ['pending', 'paid', 'failed', 'refunded'];

const ORDER_STATUS_LABELS = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

const PAYMENT_STATUS_LABELS = {
  pending: 'Pending',
  paid: 'Paid',
  failed: 'Failed',
  refunded: 'Refunded',
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

function formatCurrency(value) {
  if (value === undefined || value === null) return '—';
  return `₹${Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function AdminOrdersPage() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
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
  const [statusFilter, setStatusFilter] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setSearchApplied(searchInput);
      setPagination((prev) => ({ ...prev, page: 1 }));
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeoutId);
  }, [searchInput]);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (searchApplied) params.set('search', searchApplied);
      if (statusFilter) params.set('status', statusFilter);
      if (paymentFilter) params.set('paymentStatus', paymentFilter);
      params.set('page', String(pagination.page));
      params.set('limit', String(pagination.limit));

      const res = await api.get('/admin/orders', { params });
      const data = res.data?.data;
      setOrders(data?.orders || []);
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
      setError(err.apiMessage || 'Unable to load orders. Please try again.');
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [searchApplied, statusFilter, paymentFilter, pagination.page, pagination.limit]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const handleStatusFilterChange = useCallback((value) => {
    setStatusFilter(value);
    setPagination((prev) => ({ ...prev, page: 1 }));
  }, []);

  const handlePaymentFilterChange = useCallback((value) => {
    setPaymentFilter(value);
    setPagination((prev) => ({ ...prev, page: 1 }));
  }, []);

  const handlePageChange = useCallback((page) => {
    setPagination((prev) => ({ ...prev, page }));
  }, []);

  if (loading) {
    return (
      <section className="admin-orders" aria-live="polite">
        <div className="admin-orders__skeleton">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="admin-orders__skeleton-row" />
          ))}
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="admin-orders" aria-live="polite">
        <div className="admin-orders__state admin-orders__state--error" role="alert">
          <h2>Error loading orders.</h2>
          <p>{error}</p>
          <button
            className="admin-orders__retry"
            onClick={() => loadOrders()}
            aria-label="Retry loading orders"
          >
            Retry
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="admin-orders" aria-live="polite">
      <div className="admin-orders__header">
        <h1 className="admin-orders__title">Orders</h1>
      </div>

      <div className="admin-orders__toolbar">
        <div className="admin-orders__search-wrap">
          <input
            type="text"
            className="admin-orders__search-input"
            placeholder="Search by order number…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            aria-label="Search orders by order number"
          />
        </div>

        <div className="admin-orders__filters-wrap">
          <select
            className="admin-orders__filter-select"
            value={statusFilter}
            onChange={(e) => handleStatusFilterChange(e.target.value)}
            aria-label="Filter by order status"
          >
            <option value="">All order statuses</option>
            {ORDER_STATUSES.map((status) => (
              <option key={status} value={status}>
                {ORDER_STATUS_LABELS[status]}
              </option>
            ))}
          </select>

          <select
            className="admin-orders__filter-select"
            value={paymentFilter}
            onChange={(e) => handlePaymentFilterChange(e.target.value)}
            aria-label="Filter by payment status"
          >
            <option value="">All payment statuses</option>
            {PAYMENT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {PAYMENT_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {orders.length === 0 ? (
        <div className="admin-orders__empty" role="status">
          {searchApplied || statusFilter || paymentFilter
            ? 'No orders match the current filters.'
            : 'No orders found.'}
        </div>
      ) : (
        <>
          <div className="admin-orders__table-wrap">
            <table className="admin-orders__table">
              <thead>
                <tr>
                  <th className="admin-orders__col-number">Order</th>
                  <th className="admin-orders__col-customer">Customer</th>
                  <th className="admin-orders__col-date">Placed</th>
                  <th className="admin-orders__col-items">Items</th>
                  <th className="admin-orders__col-total">Total</th>
                  <th className="admin-orders__col-payment">Payment</th>
                  <th className="admin-orders__col-status">Status</th>
                  <th className="admin-orders__col-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id} className="admin-orders__row">
                    <td className="admin-orders__col-number">
                      <span className="admin-orders__order-number">
                        {order.orderNumber}
                      </span>
                    </td>
                    <td className="admin-orders__col-customer">
                      <span className="admin-orders__customer-name">
                        {order.user?.name || 'Unknown'}
                      </span>
                      {order.user?.email && (
                        <span className="admin-orders__customer-email">
                          {order.user.email}
                        </span>
                      )}
                    </td>
                    <td className="admin-orders__col-date">
                      {formatDate(order.placedAt)}
                    </td>
                    <td className="admin-orders__col-items">
                      {Array.isArray(order.items)
                        ? order.items.reduce((sum, item) => sum + (item.quantity || 0), 0)
                        : 0}
                    </td>
                    <td className="admin-orders__col-total">
                      {formatCurrency(order.totals?.total)}
                    </td>
                    <td className="admin-orders__col-payment">
                      <span
                        className={`admin-orders__badge admin-orders__badge--payment-${order.paymentStatus}`}
                      >
                        {PAYMENT_STATUS_LABELS[order.paymentStatus] || order.paymentStatus}
                      </span>
                    </td>
                    <td className="admin-orders__col-status">
                      <span
                        className={`admin-orders__badge admin-orders__badge--order-${order.orderStatus}`}
                      >
                        {ORDER_STATUS_LABELS[order.orderStatus] || order.orderStatus}
                      </span>
                    </td>
                    <td className="admin-orders__col-actions">
                      <button
                        type="button"
                        className="admin-orders__view-btn"
                        onClick={() => navigate(`/admin/orders/${order.id}`)}
                        aria-label={`View order ${order.orderNumber}`}
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="admin-orders__pagination">
            <button
              type="button"
              className="admin-orders__pagination-btn"
              disabled={!pagination.hasPreviousPage}
              onClick={() => handlePageChange(pagination.page - 1)}
              aria-label="Previous page"
            >
              Previous
            </button>

            <span className="admin-orders__pagination-info">
              Page {pagination.page} of {pagination.totalPages || 1}
              {pagination.total > 0 && ` · ${pagination.total} order${pagination.total === 1 ? '' : 's'}`}
            </span>

            <button
              type="button"
              className="admin-orders__pagination-btn"
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

export default AdminOrdersPage;