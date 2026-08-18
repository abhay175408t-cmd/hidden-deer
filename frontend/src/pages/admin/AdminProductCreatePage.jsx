import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/axios';
import ProductForm from '../../components/admin/ProductForm';
import './AdminProductCreatePage.css';

function AdminProductCreatePage() {
  const navigate = useNavigate();

  const handleSubmit = useCallback(
    async (payload) => {
      await api.post('/products', payload);
      navigate('/admin/products', { replace: true });
    },
    [navigate]
  );

  return (
    <section className="admin-product-create" aria-live="polite">
      <div className="admin-product-create__header">
        <div>
          <button
            type="button"
            className="admin-product-create__back-link"
            onClick={() => navigate('/admin/products')}
          >
            ← Back to products
          </button>
          <h1 className="admin-product-create__title">Add Product</h1>
        </div>
      </div>

      <ProductForm
        submitLabel="Create Product"
        onSubmit={handleSubmit}
        onCancel={() => navigate('/admin/products')}
      />
    </section>
  );
}

export default AdminProductCreatePage;