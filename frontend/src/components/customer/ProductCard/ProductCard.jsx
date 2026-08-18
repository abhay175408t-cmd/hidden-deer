import { Link } from 'react-router-dom';
import DualImageHover from '../DualImageHover/DualImageHover';
import useProductSecondaryImage from '../../../hooks/useProductSecondaryImage';
import './ProductCard.css';

function formatPrice(value) {
  if (value === undefined || value === null) return null;
  return `₹${Number(value).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Product card. When the product actually has a second image (lazily fetched
 * from GET /products/:slug), the card shows the DEER dual-image hover
 * (model → product-only). Products with a single image render a plain card —
 * no fake second image is ever used.
 */
export default function ProductCard({ product }) {
  const { secondary, rootRef } = useProductSecondaryImage(product);

  const secondaryImage = secondary ? { src: secondary.url, alt: secondary.alt || product.name } : null;
  const discountPercent =
    product.discountPrice && product.price && product.discountPrice < product.price
      ? Math.round(((product.price - product.discountPrice) / product.price) * 100)
      : null;

  return (
    <article ref={rootRef} className="product-card">
      <Link
        to={`/products/${product.slug}`}
        className="product-card__link"
        aria-label={`View ${product.name}`}
      >
        <DualImageHover
          primary={product.image || null}
          secondary={secondaryImage}
          alt={product.name}
          className="product-card__media"
        >
          <div className="product-card__tags">
            {product.isNew && <span className="product-card__tag">New</span>}
            {product.isBestSeller && <span className="product-card__tag">Bestseller</span>}
            {discountPercent !== null && (
              <span className="product-card__tag product-card__tag--discount">{discountPercent}% off</span>
            )}
          </div>
        </DualImageHover>

        <div className="product-card__info">
          <h3 className="product-card__name">{product.name}</h3>
          <div className="product-card__price-row">
            <span className="product-card__price">{formatPrice(product.discountPrice || product.price)}</span>
            {product.discountPrice && (
              <span className="product-card__price-old">{formatPrice(product.price)}</span>
            )}
          </div>
          {typeof product.rating === 'number' && product.rating > 0 && (
            <span className="product-card__rating">
              ★ {Number(product.rating).toFixed(1)}
              {product.reviewCount > 0 && ` · ${product.reviewCount} review${product.reviewCount === 1 ? '' : 's'}`}
            </span>
          )}
        </div>
      </Link>
    </article>
  );
}