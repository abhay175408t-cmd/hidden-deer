import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/axios';
import CouponForm from '../../components/admin/CouponForm';
import './AdminCouponCreatePage.css';

function AdminCouponCreatePage() {
  const navigate = useNavigate();

  const handleSubmit = useCallback(
    async (payload) => {
      await api.post('/admin/coupons', payload);
      navigate('/admin/coupons', { replace: true });
    },
    [navigate]
  );

  return (
    <section className="admin-coupon-create" aria-live="polite">
      <div className="admin-coupon-create__header">
        <div>
          <button
            type="button"
            className="admin-coupon-create__back-link"
            onClick={() => navigate('/admin/coupons')}
          >
            ← Back to coupons
          </button>
          <h1 className="admin-coupon-create__title">Add Coupon</h1>
        </div>
      </div>

      <CouponForm
        submitLabel="Create Coupon"
        onSubmit={handleSubmit}
        onCancel={() => navigate('/admin/coupons')}
      />
    </section>
  );
}

export default AdminCouponCreatePage;