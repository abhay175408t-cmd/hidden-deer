import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../../api/axios';
import ProductForm from '../../components/admin/ProductForm';
import './AdminProductEditPage.css';

function AdminProductEditPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notFound, setNotFound] = useState(false);

  const loadProduct = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotFound(false);
    try {
      const res = await api.get(`/admin/products/${id}`);
      setProduct(res.data?.data?.product || null);
    } catch (err) {
      if (err.response?.status === 404) {
        setNotFound(true);
      } else {
        setError(err.apiMessage || 'Unable to load the product. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadProduct();
  }, [loadProduct]);

  const handleSubmit = useCallback(
    async (payload) => {
      await api.patch(`/products/${id}`, payload);
      navigate('/admin/products', { replace: true });
    },
    [id, navigate]
  );

  if (loading) {
    return (
      <section className="admin-product-edit" aria-live="polite">
        <div className="admin-product-edit__skeleton">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="admin-product-edit__skeleton-row" />
          ))}
        </div>
      </section>
    );
  }

  if (notFound) {
    return (
      <section className="admin-product-edit" aria-live="polite">
        <div className="admin-product-edit__state" role="status">
          <h2>Product not found.</h2>
          <p>The product you are looking for does not exist.</p>
          <button
            type="button"
            className="admin-product-edit__back-btn"
            onClick={() => navigate('/admin/products')}
          >
            Back to products
          </button>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="admin-product-edit" aria-live="polite">
        <div className="admin-product-edit__state admin-product-edit__state--error" role="alert">
          <h2>Error loading product.</h2>
          <p>{error}</p>
          <button
            type="button"
            className="admin-product-edit__back-btn"
            onClick={() => loadProduct()}
            aria-label="Retry loading the product"
          >
            Retry
          </button>
        </div>
      </section>
    );
  }

  if (!product) {
    return null;
  }

  return (
    <section className="admin-product-edit" aria-live="polite">
      <div className="admin-product-edit__header">
        <div>
          <button
            type="button"
            className="admin-product-edit__back-link"
            onClick={() => navigate('/admin/products')}
          >
            ← Back to products
          </button>
          <h1 className="admin-product-edit__title">Edit Product</h1>
          <p className="admin-product-edit__meta">
            {product.name} · {product.category?.name || 'No category'} ·{' '}
            {product.isActive ? 'Active' : 'Inactive'}
          </p>
        </div>
      </div>

      <ProductForm
        key={product.id}
        initialValues={product}
        submitLabel="Save Changes"
        onSubmit={handleSubmit}
        onCancel={() => navigate('/admin/products')}
      />
    </section>
  );
}

export default AdminProductEditPage;