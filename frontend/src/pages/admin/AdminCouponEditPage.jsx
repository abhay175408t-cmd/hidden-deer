import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../../api/axios';
import CouponForm from '../../components/admin/CouponForm';
import './AdminCouponEditPage.css';

function AdminCouponEditPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [coupon, setCoupon] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notFound, setNotFound] = useState(false);

  const loadCoupon = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotFound(false);
    try {
      const res = await api.get(`/admin/coupons/${id}`);
      setCoupon(res.data?.data?.coupon || null);
    } catch (err) {
      if (err.response?.status === 404) {
        setNotFound(true);
      } else {
        setError(err.apiMessage || 'Unable to load the coupon. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadCoupon();
  }, [loadCoupon]);

  const handleSubmit = useCallback(
    async (payload) => {
      await api.patch(`/admin/coupons/${id}`, payload);
      navigate('/admin/coupons', { replace: true });
    },
    [id, navigate]
  );

  if (loading) {
    return (
      <section className="admin-coupon-edit" aria-live="polite">
        <div className="admin-coupon-edit__skeleton">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="admin-coupon-edit__skeleton-row" />
          ))}
        </div>
      </section>
    );
  }

  if (notFound) {
    return (
      <section className="admin-coupon-edit" aria-live="polite">
        <div className="admin-coupon-edit__state" role="status">
          <h2>Coupon not found.</h2>
          <p>The coupon you are looking for does not exist.</p>
          <button
            type="button"
            className="admin-coupon-edit__back-btn"
            onClick={() => navigate('/admin/coupons')}
          >
            Back to coupons
          </button>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="admin-coupon-edit" aria-live="polite">
        <div className="admin-coupon-edit__state admin-coupon-edit__state--error" role="alert">
          <h2>Error loading coupon.</h2>
          <p>{error}</p>
          <button
            type="button"
            className="admin-coupon-edit__back-btn"
            onClick={() => loadCoupon()}
            aria-label="Retry loading the coupon"
          >
            Retry
          </button>
        </div>
      </section>
    );
  }

  if (!coupon) {
    return null;
  }

  return (
    <section className="admin-coupon-edit" aria-live="polite">
      <div className="admin-coupon-edit__header">
        <div>
          <button
            type="button"
            className="admin-coupon-edit__back-link"
            onClick={() => navigate('/admin/coupons')}
          >
            ← Back to coupons
          </button>
          <h1 className="admin-coupon-edit__title">Edit Coupon</h1>
          <p className="admin-coupon-edit__meta">
            {coupon.code} · used {coupon.usageCount ?? 0} time
            {coupon.usageCount === 1 ? '' : 's'}
            {coupon.usageLimit ? ` of ${coupon.usageLimit}` : ''}
          </p>
        </div>
      </div>

      <CouponForm
        key={coupon.id}
        initialValues={coupon}
        submitLabel="Save Changes"
        onSubmit={handleSubmit}
        onCancel={() => navigate('/admin/coupons')}
      />
    </section>
  );
}

export default AdminCouponEditPage;