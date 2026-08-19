import { Link } from 'react-router-dom';
import { Heart } from 'lucide-react';
import useProductSecondaryImage from '../../../hooks/useProductSecondaryImage';
import useWishlist from '../../../hooks/useWishlist';
import './ProductCard.css';

function formatPrice(value) {
  if (value === undefined || value === null) return null;
  return `₹${Number(value).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

const COLOR_HEX = {
  black: '#111111',
  white: '#ffffff',
  offwhite: '#f5f3ee',
  navy: '#1f2a44',
  blue: '#3358a0',
  grey: '#8a8a8a',
  gray: '#8a8a8a',
  brown: '#6b4a2f',
  beige: '#d9c7a7',
  olive: '#5a5a3a',
  green: '#3f6b3f',
  red: '#b03a2e',
  maroon: '#6b1f2a',
  pink: '#d98a8a',
  purple: '#5a3a6b',
  yellow: '#d9b23a',
  khaki: '#b8a37a',
  denim: '#3f5b8a',
  tan: '#c9a46a',
  cream: '#f3ead8',
  rust: '#a85c32',
  charcoal: '#3a3a3a',
  ink: '#222233',
  sand: '#d9c3a3',
  stone: '#a9a49b',
};

function swatchStyle(color) {
  const key = String(color).toLowerCase().replace(/[^a-z]/g, '');
  const hex = COLOR_HEX[key] || '#d8d8d8';
  const light = key === 'white' || key === 'offwhite' || key === 'cream';
  return {
    backgroundColor: hex,
    boxShadow: light ? `inset 0 0 0 1px var(--color-hairline)` : undefined,
  };
}

/**
 * Product card. Uses a two-layer image stack: the hover image sits behind the
 * main image, and the main image fades out on hover (group-hover pattern).
 * The list API now ships the first two images in `product.images`; for older
 * endpoints that only send a single `image`, the secondary is lazily fetched
 * from GET /products/:slug. Products with a single image render a plain card.
 */
export default function ProductCard({ product }) {
  const { secondary, rootRef } = useProductSecondaryImage(product);
  const { isSaved, toggle, authRequired } = useWishlist();

  const listImages =
    Array.isArray(product.images) && product.images.length > 0
      ? product.images
      : product.image
        ? [product.image]
        : [];

  const mainImage = listImages[0] || null;
  const hoverImage =
    listImages[1] || (secondary ? { url: secondary.url, alt: secondary.alt } : null);

  const discountPercent =
    product.discountPrice && product.price && product.discountPrice < product.price
      ? Math.round(((product.price - product.discountPrice) / product.price) * 100)
      : null;

  const colors = Array.isArray(product.colors) ? product.colors : [];
  const visibleColors = colors.slice(0, 3);
  const extraColors = colors.length - visibleColors.length;
  const saved = isSaved(product.id);

  const handleToggleWishlist = (event) => {
    event.preventDefault();
    event.stopPropagation();
    toggle(product);
  };

  return (
    <article ref={rootRef} className="product-card">
      <Link
        to={`/products/${product.slug}`}
        className="product-card__link"
        aria-label={`View ${product.name}`}
      >
        <div className="product-card__media">
          {hoverImage && (
            <img
              src={hoverImage.url}
              alt="Hover view"
              className="product-card__media-hover"
            />
          )}

          {mainImage && (
            <img
              src={mainImage.url}
              alt="Main view"
              className="product-card__media-main"
            />
          )}

          <div className="product-card__tags">
            {product.isNew && <span className="product-card__tag">New</span>}
            {product.isBestSeller && <span className="product-card__tag">Bestseller</span>}
            {discountPercent !== null && (
              <span className="product-card__tag product-card__tag--discount">{discountPercent}% off</span>
            )}
          </div>
        </div>

        <div className="product-card__info">
          <h3 className="product-card__name">{product.name}</h3>
          <div className="product-card__price-row">
            <span className="product-card__price">{formatPrice(product.discountPrice || product.price)}</span>
            {product.discountPrice && (
              <span className="product-card__price-old">{formatPrice(product.price)}</span>
            )}
          </div>
          {colors.length > 0 && (
            <div className="product-card__colors" aria-label={`${colors.length} colour${colors.length === 1 ? '' : 's'}`}>
              {visibleColors.map((color) => (
                <span
                  key={color}
                  className="product-card__swatch"
                  style={swatchStyle(color)}
                  title={color}
                />
              ))}
              {extraColors > 0 && <span className="product-card__colors-count">+{extraColors}</span>}
            </div>
          )}
          {typeof product.rating === 'number' && product.rating > 0 && (
            <span className="product-card__rating">
              ★ {Number(product.rating).toFixed(1)}
              {product.reviewCount > 0 && ` · ${product.reviewCount} review${product.reviewCount === 1 ? '' : 's'}`}
            </span>
          )}
        </div>
      </Link>

      <button
        type="button"
        className={`product-card__wish${saved ? ' product-card__wish--active' : ''}`}
        onClick={handleToggleWishlist}
        aria-pressed={saved}
        aria-label={saved ? `Remove ${product.name} from wishlist` : `Add ${product.name} to wishlist`}
      >
        <Heart size={18} strokeWidth={1.5} aria-hidden="true" />
      </button>
      {authRequired && saved && (
        <span className="product-card__wish-note" role="status">
          Sign in to save
        </span>
      )}
    </article>
  );
}
