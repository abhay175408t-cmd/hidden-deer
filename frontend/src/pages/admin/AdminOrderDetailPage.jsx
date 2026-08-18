import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../../api/axios';
import './AdminOrderDetailPage.css';

const ORDER_STATUSES = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'];

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

const PAYMENT_METHOD_LABELS = {
  cod: 'Cash on delivery',
  online: 'Online payment',
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

function formatCurrency(value) {
  if (value === undefined || value === null) return '—';
  return `₹${Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function AdminOrderDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notFound, setNotFound] = useState(false);

  const [statusValue, setStatusValue] = useState('');
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateError, setUpdateError] = useState(null);
  const [notice, setNotice] = useState(null);
  const noticeTimeoutRef = useRef(null);

  const showNotice = useCallback((message) => {
    setNotice(message);
    if (noticeTimeoutRef.current) {
      clearTimeout(noticeTimeoutRef.current);
    }
    noticeTimeoutRef.current = setTimeout(() => setNotice(null), 4000);
  }, []);

  useEffect(
    () => () => {
      if (noticeTimeoutRef.current) {
        clearTimeout(noticeTimeoutRef.current);
      }
    },
    []
  );

  const loadOrder = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotFound(false);
    try {
      const res = await api.get(`/admin/orders/${id}`);
      const loadedOrder = res.data?.data?.order;
      setOrder(loadedOrder);
      setStatusValue(loadedOrder?.orderStatus || '');
    } catch (err) {
      if (err.response?.status === 404) {
        setNotFound(true);
      } else {
        setError(err.apiMessage || 'Unable to load the order. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadOrder();
  }, [loadOrder]);

  const handleStatusChange = useCallback((value) => {
    setStatusValue(value);
    setUpdateError(null);
    setConfirmCancel(value === 'cancelled');
  }, []);

  const handleUpdateStatus = useCallback(async () => {
    if (!order || !statusValue) return;

    setIsUpdating(true);
    setUpdateError(null);

    try {
      const res = await api.patch(`/admin/orders/${order.id}/status`, {
        status: statusValue,
      });
      const updated = res.data?.data?.order;
      if (updated) {
        setOrder((prev) => ({ ...prev, ...updated }));
        setStatusValue(updated.orderStatus);
        setConfirmCancel(false);
        showNotice(
          `Order status updated to "${
            ORDER_STATUS_LABELS[updated.orderStatus] || updated.orderStatus
          }".`
        );
      } else {
        setConfirmCancel(false);
        showNotice('Order status updated.');
      }
    } catch (err) {
      if (err.response?.status === 400) {
        setUpdateError(
          err.apiMessage === 'Cannot change status of a cancelled order'
            ? 'This order is already cancelled and can no longer be changed.'
            : err.apiMessage || 'Unable to update the order status.'
        );
      } else {
        setUpdateError('Unable to update the order status. Please try again.');
      }
    } finally {
      setIsUpdating(false);
    }
  }, [order, statusValue, showNotice]);

  if (loading) {
    return (
      <section className="admin-order-detail" aria-live="polite">
        <div className="admin-order-detail__skeleton">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="admin-order-detail__skeleton-row" />
          ))}
        </div>
      </section>
    );
  }

  if (notFound) {
    return (
      <section className="admin-order-detail" aria-live="polite">
        <div className="admin-order-detail__state" role="status">
          <h2>Order not found.</h2>
          <p>The order you are looking for does not exist or may have been removed.</p>
          <button
            type="button"
            className="admin-order-detail__back-btn"
            onClick={() => navigate('/admin/orders')}
          >
            Back to orders
          </button>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="admin-order-detail" aria-live="polite">
        <div className="admin-order-detail__state admin-order-detail__state--error" role="alert">
          <h2>Error loading order.</h2>
          <p>{error}</p>
          <button
            type="button"
            className="admin-order-detail__back-btn"
            onClick={() => loadOrder()}
            aria-label="Retry loading the order"
          >
            Retry
          </button>
        </div>
      </section>
    );
  }

  if (!order) {
    return null;
  }

  const isCancelled = order.orderStatus === 'cancelled';
  const itemCount = Array.isArray(order.items)
    ? order.items.reduce((sum, item) => sum + (item.quantity || 0), 0)
    : 0;

  return (
    <section className="admin-order-detail" aria-live="polite">
      <div className="admin-order-detail__header">
        <div>
          <button
            type="button"
            className="admin-order-detail__back-link"
            onClick={() => navigate('/admin/orders')}
          >
            ← Back to orders
          </button>
          <h1 className="admin-order-detail__title">{order.orderNumber}</h1>
          <p className="admin-order-detail__meta">
            Placed {formatDateTime(order.placedAt)} · {itemCount} item
            {itemCount === 1 ? '' : 's'}
          </p>
        </div>

        <div className="admin-order-detail__badges">
          <span
            className={`admin-order-detail__badge admin-order-detail__badge--order-${order.orderStatus}`}
          >
            {ORDER_STATUS_LABELS[order.orderStatus] || order.orderStatus}
          </span>
          <span
            className={`admin-order-detail__badge admin-order-detail__badge--payment-${order.paymentStatus}`}
          >
            Payment: {PAYMENT_STATUS_LABELS[order.paymentStatus] || order.paymentStatus}
          </span>
        </div>
      </div>

      {notice && (
        <div className="admin-order-detail__notice" role="status">
          {notice}
        </div>
      )}

      <div className="admin-order-detail__section">
        <h2 className="admin-order-detail__section-title">Order status</h2>

        <div className="admin-order-detail__status-control">
          <label className="admin-order-detail__label" htmlFor="order-status-select">
            Change status
          </label>
          <div className="admin-order-detail__status-row">
            <select
              id="order-status-select"
              className="admin-order-detail__select"
              value={statusValue}
              onChange={(e) => handleStatusChange(e.target.value)}
              disabled={isUpdating || isCancelled}
            >
              {ORDER_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {ORDER_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
            {!confirmCancel && (
              <button
                type="button"
                className="admin-order-detail__update-btn"
                onClick={handleUpdateStatus}
                disabled={isUpdating || isCancelled || statusValue === order.orderStatus}
              >
                {isUpdating ? 'Updating…' : 'Update status'}
              </button>
            )}
          </div>

          {isCancelled && (
            <p className="admin-order-detail__status-note">
              This order is cancelled and can no longer be changed.
            </p>
          )}

          {confirmCancel && !isCancelled && (
            <div
              className="admin-order-detail__cancel-confirm"
              role="alertdialog"
              aria-label="Confirm order cancellation"
            >
              <p className="admin-order-detail__cancel-confirm-text">
                Cancel this order? Cancellation may restore stock and release any
                applied coupon, and change a paid order to refunded per the backend
                rules.
              </p>
              <div className="admin-order-detail__cancel-confirm-actions">
                <button
                  type="button"
                  className="admin-order-detail__cancel-confirm-btn"
                  onClick={() => handleUpdateStatus()}
                  disabled={isUpdating}
                >
                  {isUpdating ? 'Cancelling…' : 'Confirm cancellation'}
                </button>
                <button
                  type="button"
                  className="admin-order-detail__cancel-confirm-btn admin-order-detail__cancel-confirm-btn--secondary"
                  onClick={() => {
                    setConfirmCancel(false);
                    setStatusValue(order.orderStatus);
                  }}
                  disabled={isUpdating}
                >
                  Back
                </button>
              </div>
            </div>
          )}

          {updateError && (
            <p className="admin-order-detail__update-error" role="alert">
              {updateError}
            </p>
          )}
        </div>
      </div>

      <div className="admin-order-detail__grid">
        <div className="admin-order-detail__section">
          <h2 className="admin-order-detail__section-title">Customer</h2>
          <dl className="admin-order-detail__list">
            <div className="admin-order-detail__list-row">
              <dt>Name</dt>
              <dd>{order.user?.name || '—'}</dd>
            </div>
            <div className="admin-order-detail__list-row">
              <dt>Email</dt>
              <dd>{order.user?.email || '—'}</dd>
            </div>
          </dl>

          {order.shippingAddress && (
            <>
              <h3 className="admin-order-detail__subheading">Shipping address</h3>
              <address className="admin-order-detail__address">
                <span>{order.shippingAddress.fullName}</span>
                <span>{order.shippingAddress.phone}</span>
                <span>{order.shippingAddress.addressLine1}</span>
                {order.shippingAddress.addressLine2 && (
                  <span>{order.shippingAddress.addressLine2}</span>
                )}
                <span>
                  {order.shippingAddress.city}, {order.shippingAddress.state}{' '}
                  {order.shippingAddress.postalCode}
                </span>
                <span>{order.shippingAddress.country}</span>
              </address>
            </>
          )}
        </div>

        <div className="admin-order-detail__section">
          <h2 className="admin-order-detail__section-title">Order details</h2>
          <dl className="admin-order-detail__list">
            <div className="admin-order-detail__list-row">
              <dt>Order number</dt>
              <dd>{order.orderNumber}</dd>
            </div>
            <div className="admin-order-detail__list-row">
              <dt>Payment method</dt>
              <dd>{PAYMENT_METHOD_LABELS[order.paymentMethod] || order.paymentMethod}</dd>
            </div>
            <div className="admin-order-detail__list-row">
              <dt>Estimated delivery</dt>
              <dd>{formatDate(order.estimatedDelivery)}</dd>
            </div>
            <div className="admin-order-detail__list-row">
              <dt>Delivered</dt>
              <dd>{formatDate(order.deliveredAt)}</dd>
            </div>
            {isCancelled && (
              <>
                <div className="admin-order-detail__list-row">
                  <dt>Cancelled</dt>
                  <dd>{formatDate(order.cancelledAt)}</dd>
                </div>
                <div className="admin-order-detail__list-row">
                  <dt>Cancellation reason</dt>
                  <dd>{order.cancelReason || '—'}</dd>
                </div>
              </>
            )}
          </dl>
        </div>
      </div>

      <div className="admin-order-detail__section">
        <h2 className="admin-order-detail__section-title">Items</h2>
        <div className="admin-order-detail__table-wrap">
          <table className="admin-order-detail__table">
            <thead>
              <tr>
                <th className="admin-order-detail__col-item">Item</th>
                <th className="admin-order-detail__col-variant">Variant</th>
                <th className="admin-order-detail__col-qty">Qty</th>
                <th className="admin-order-detail__col-price">Unit price</th>
                <th className="admin-order-detail__col-line">Line total</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item, index) => (
                <tr key={`${item.product}-${index}`}>
                  <td className="admin-order-detail__col-item">
                    <div className="admin-order-detail__item">
                      {item.image ? (
                        <img
                          src={item.image}
                          alt={item.title || ''}
                          className="admin-order-detail__item-image"
                          width={44}
                          height={44}
                        />
                      ) : (
                        <div className="admin-order-detail__item-placeholder">&nbsp;</div>
                      )}
                      <span className="admin-order-detail__item-title">{item.title}</span>
                    </div>
                  </td>
                  <td className="admin-order-detail__col-variant">
                    {item.variant || '—'}
                  </td>
                  <td className="admin-order-detail__col-qty">{item.quantity}</td>
                  <td className="admin-order-detail__col-price">
                    {formatCurrency(item.price)}
                    {item.mrp > item.price && (
                      <span className="admin-order-detail__mrp">
                        {formatCurrency(item.mrp)}
                      </span>
                    )}
                  </td>
                  <td className="admin-order-detail__col-line">
                    {formatCurrency((item.price || 0) * (item.quantity || 0))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="admin-order-detail__grid">
        <div className="admin-order-detail__section">
          <h2 className="admin-order-detail__section-title">Totals</h2>
          <dl className="admin-order-detail__list">
            <div className="admin-order-detail__list-row">
              <dt>Subtotal</dt>
              <dd>{formatCurrency(order.totals?.subtotal)}</dd>
            </div>
            {Number(order.totals?.couponDiscount) > 0 && (
              <div className="admin-order-detail__list-row">
                <dt>Coupon discount</dt>
                <dd>−{formatCurrency(order.totals.couponDiscount)}</dd>
              </div>
            )}
            {Number(order.totals?.discountAmount) > 0 && (
              <div className="admin-order-detail__list-row">
                <dt>Discount</dt>
                <dd>−{formatCurrency(order.totals.discountAmount)}</dd>
              </div>
            )}
            {Number(order.totals?.shippingFee) > 0 && (
              <div className="admin-order-detail__list-row">
                <dt>Shipping</dt>
                <dd>{formatCurrency(order.totals.shippingFee)}</dd>
              </div>
            )}
            {Number(order.totals?.codFee) > 0 && (
              <div className="admin-order-detail__list-row">
                <dt>COD fee</dt>
                <dd>{formatCurrency(order.totals.codFee)}</dd>
              </div>
            )}
            <div className="admin-order-detail__list-row admin-order-detail__list-row--total">
              <dt>Total</dt>
              <dd>{formatCurrency(order.totals?.total)}</dd>
            </div>
          </dl>

          {order.coupon && (
            <p className="admin-order-detail__coupon-note">
              A coupon was applied to this order.
            </p>
          )}
        </div>

        <div className="admin-order-detail__section">
          <h2 className="admin-order-detail__section-title">Payment</h2>
          <dl className="admin-order-detail__list">
            <div className="admin-order-detail__list-row">
              <dt>Payment status</dt>
              <dd>
                {PAYMENT_STATUS_LABELS[order.paymentStatus] || order.paymentStatus}
              </dd>
            </div>
          </dl>

          {Array.isArray(order.payments) && order.payments.length > 0 ? (
            <div className="admin-order-detail__payments">
              {order.payments.map((payment) => (
                <div key={payment.id} className="admin-order-detail__payment">
                  <div className="admin-order-detail__payment-head">
                    <span className="admin-order-detail__payment-provider">
                      {payment.provider || 'Payment'}
                    </span>
                    <span
                      className={`admin-order-detail__payment-status admin-order-detail__payment-status--${payment.status}`}
                    >
                      {payment.status || '—'}
                    </span>
                  </div>
                  <dl className="admin-order-detail__list">
                    <div className="admin-order-detail__list-row">
                      <dt>Amount</dt>
                      <dd>
                        {formatCurrency(payment.amount)}
                        {payment.currency ? ` ${payment.currency}` : ''}
                      </dd>
                    </div>
                    {payment.method && (
                      <div className="admin-order-detail__list-row">
                        <dt>Method</dt>
                        <dd>{payment.method}</dd>
                      </div>
                    )}
                    {payment.providerOrderId && (
                      <div className="admin-order-detail__list-row">
                        <dt>Provider order ID</dt>
                        <dd>{payment.providerOrderId}</dd>
                      </div>
                    )}
                    {payment.providerPaymentId && (
                      <div className="admin-order-detail__list-row">
                        <dt>Provider payment ID</dt>
                        <dd>{payment.providerPaymentId}</dd>
                      </div>
                    )}
                    {payment.failureReason && (
                      <div className="admin-order-detail__list-row">
                        <dt>Failure reason</dt>
                        <dd>{payment.failureReason}</dd>
                      </div>
                    )}
                    <div className="admin-order-detail__list-row">
                      <dt>Created</dt>
                      <dd>{formatDateTime(payment.createdAt)}</dd>
                    </div>
                  </dl>
                </div>
              ))}
            </div>
          ) : (
            <p className="admin-order-detail__no-payments">
              No payment records available for this order.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

export default AdminOrderDetailPage;