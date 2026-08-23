import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { gsap } from '../lib/gsap';
import api from '../api/axios';
import useGuestCart from '../hooks/useGuestCart';
import SimilarProducts from '../components/customer/SimilarProducts/SimilarProducts';
import './ProductDetailPage.css';

function formatPrice(value) {
  if (value === undefined || value === null) return null;
  return `₹${Number(value).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function ProductDetailPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { addItem } = useGuestCart();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [activeImage, setActiveImage] = useState(0);
  const [selectedSize, setSelectedSize] = useState('');
  const [selectedColor, setSelectedColor] = useState('');
  const [addedToBag, setAddedToBag] = useState(false);
  const mainImageRef = useRef(null);

  // DEMO BYPASS — go back through browser history so the previous listing
  // page restores its URL filters and scroll position instead of remounting
  // from scratch on "/".
  const handleBack = useCallback(() => {
    if (window.history.state && window.history.state.idx > 0) {
      navigate(-1);
    } else {
      navigate('/', { replace: true });
    }
  }, [navigate]);

  const loadProduct = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotFound(false);
    try {
      const res = await api.get(`/products/${slug}`);
      const data = res.data?.data?.product;
      if (!data) {
        setNotFound(true);
        return;
      }
      setProduct(data);
      setActiveImage(0);
      setSelectedSize('');
      setSelectedColor('');
      setAddedToBag(false);
    } catch (err) {
      if (err.response?.status === 404) {
        setNotFound(true);
      } else {
        setError(err.apiMessage || 'Unable to load the product.');
      }
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    loadProduct();
  }, [loadProduct]);

  const handleThumbSelect = useCallback((index) => {
    setActiveImage(index);
    const main = mainImageRef.current;
    if (!main) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      gsap.set(main, { opacity: 1 });
      return;
    }
    const timeline = gsap.timeline();
    timeline
      .to(main, { opacity: 0, y: 8, duration: 0.18, ease: 'power2.in' })
      .set(main, { y: 0 })
      .to(main, { opacity: 1, duration: 0.3, ease: 'power2.out' });
    return () => timeline.kill();
  }, []);

  const images = Array.isArray(product?.images) ? product.images : [];

  if (loading) {
    return (
      <main className="product-detail" aria-live="polite">
          <div className="product-detail__skeleton">
            <div className="product-detail__skeleton-gallery" />
            <div className="product-detail__skeleton-info">
              <div className="product-detail__skeleton-line product-detail__skeleton-line--short" />
              <div className="product-detail__skeleton-line" />
              <div className="product-detail__skeleton-line product-detail__skeleton-line--short" />
            </div>
          </div>
        </main>
    );
  }

  if (notFound) {
    return (
      <main className="product-detail" aria-live="polite">
          <div className="product-detail__state" role="status">
            <h1>Not found</h1>
            <p>The piece you are looking for does not exist or has been removed.</p>
            <Link className="product-detail__back-link" to="/">
              ← Back to home
            </Link>
          </div>
        </main>
    );
  }

  if (error) {
    return (
      <main className="product-detail" aria-live="polite">
          <div className="product-detail__state" role="alert">
            <h1>Something went wrong</h1>
            <p>{error}</p>
            <button type="button" className="product-detail__retry" onClick={loadProduct}>
              Retry
            </button>
          </div>
        </main>
    );
  }

  const discountPercent =
    product.discountPrice && product.price && product.discountPrice < product.price
      ? Math.round(((product.price - product.discountPrice) / product.price) * 100)
      : null;

  // DEMO BYPASS — previously gated behind sign-in ("Signing in is required…").
  // Anyone can bag items now; they land in the localStorage guest cart and
  // the header counter updates instantly via useGuestCart's subscription.
  const handleAddToBag = () => {
    addItem(product, { size: selectedSize || null, color: selectedColor || null });
    setAddedToBag(true);
  };

  return (
    <main className="product-detail" aria-live="polite">
        <button type="button" className="product-detail__back-link" onClick={handleBack}>
          ← Back
        </button>

        <div className="product-detail__layout">
          <div className="product-detail__gallery">
            <div className="product-detail__main" ref={mainImageRef}>
              {images[activeImage]?.url ? (
                <img
                  src={images[activeImage].url}
                  alt={images[activeImage].alt || product.name}
                  className="product-detail__main-image"
                />
              ) : (
                <div className="product-detail__main-placeholder">HIDDEN DEER</div>
              )}
            </div>
            {images.length > 1 && (
              <div className="product-detail__thumbs" role="group" aria-label="Product images">
                {images.map((image, index) => (
                  <button
                    key={`${image.url}-${index}`}
                    type="button"
                    className={`product-detail__thumb${index === activeImage ? ' product-detail__thumb--active' : ''}`}
                    onClick={() => handleThumbSelect(index)}
                    aria-label={`View image ${index + 1}`}
                    aria-current={index === activeImage ? 'true' : undefined}
                  >
                    <img src={image.url} alt={image.alt || `${product.name} view ${index + 1}`} />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="product-detail__info">
            <p className="product-detail__brand">{product.brand || 'Hidden Deer'}</p>
            <h1 className="product-detail__name">{product.name}</h1>

            {typeof product.rating === 'number' && product.rating > 0 && (
              <p className="product-detail__rating">
                ★ {Number(product.rating).toFixed(1)}
                {product.reviewCount > 0 &&
                  ` · ${product.reviewCount} review${product.reviewCount === 1 ? '' : 's'}`}
              </p>
            )}

            <div className="product-detail__price-row">
              <span className="product-detail__price">
                {formatPrice(product.discountPrice || product.price)}
              </span>
              {product.discountPrice && (
                <>
                  <span className="product-detail__price-old">{formatPrice(product.price)}</span>
                  <span className="product-detail__discount">{discountPercent}% off</span>
                </>
              )}
            </div>

            {product.stockStatus === 'out_of_stock' && (
              <p className="product-detail__stock-note" role="status">
                Currently out of stock.
              </p>
            )}

            {Array.isArray(product.sizes) && product.sizes.length > 0 && (
              <fieldset className="product-detail__fieldset">
                <legend>Size</legend>
                <div className="product-detail__chips">
                  {product.sizes.map((size) => (
                    <button
                      key={size}
                      type="button"
                      className={`product-detail__chip${selectedSize === size ? ' product-detail__chip--active' : ''}`}
                      onClick={() => setSelectedSize(size)}
                      aria-pressed={selectedSize === size}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </fieldset>
            )}

            {Array.isArray(product.colors) && product.colors.length > 0 && (
              <fieldset className="product-detail__fieldset">
                <legend>Colour</legend>
                <div className="product-detail__chips">
                  {product.colors.map((color) => (
                    <button
                      key={color}
                      type="button"
                      className={`product-detail__chip${selectedColor === color ? ' product-detail__chip--active' : ''}`}
                      onClick={() => setSelectedColor(color)}
                      aria-pressed={selectedColor === color}
                    >
                      {color}
                    </button>
                  ))}
                </div>
              </fieldset>
            )}

            <button
              type="button"
              className="product-detail__add-btn"
              onClick={handleAddToBag}
              disabled={product.stockStatus === 'out_of_stock'}
            >
              {product.stockStatus === 'out_of_stock' ? 'Out of stock' : 'Add to bag'}
            </button>

            {addedToBag && (
              <p className="product-detail__auth-notice" role="status">
                Added to your bag —{' '}
                <Link to="/cart" className="product-detail__bag-link">
                  view bag
                </Link>
              </p>
            )}

            {product.description && (
              <p className="product-detail__description">{product.description}</p>
            )}

            {Array.isArray(product.tags) && product.tags.length > 0 && (
              <p className="product-detail__tags">
                {product.tags.map((tag) => `#${tag}`).join('  ')}
              </p>
            )}
          </div>
        </div>

        <SimilarProducts product={product} />
      </main>
  );
}
