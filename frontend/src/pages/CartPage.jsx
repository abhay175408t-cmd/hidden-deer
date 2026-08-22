import { Link } from 'react-router-dom';
import { Minus, Plus, Trash2 } from 'lucide-react';
import useGuestCart from '../hooks/useGuestCart';
import './CartPage.css';

function formatPrice(value) {
  if (value === undefined || value === null) return null;
  return `₹${Number(value).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Demo bag — reads the localStorage guest cart (see lib/guestCart.js) so
 * items added without signing in show up here exactly as they would for a
 * signed-in customer. Quantity stepper and remove mutate the store directly;
 * the header counter stays in sync through the shared subscription.
 */
export default function CartPage() {
  const { items, itemCount, subtotal, updateQuantity, removeItem, clear } = useGuestCart();

  if (items.length === 0) {
    return (
      <div className="cart-page cart-page--empty" role="status">
        <h1 className="cart-page__title">Your bag is empty</h1>
        <p className="cart-page__empty-note">
          Pieces you add will be kept here for you.
        </p>
        <Link className="cart-page__cta" to="/">
          Continue shopping
        </Link>
      </div>
    );
  }

  return (
    <div className="cart-page">
      <header className="cart-page__head">
        <h1 className="cart-page__title">Shopping bag</h1>
        <p className="cart-page__count">
          {itemCount} item{itemCount === 1 ? '' : 's'}
        </p>
      </header>

      <div className="cart-page__layout">
        <section className="cart-page__items" aria-label="Bag items">
          {items.map((item) => (
            <article key={item.lineKey} className="cart-item">
              <Link
                to={`/products/${item.slug}`}
                className="cart-item__media"
                aria-label={`View ${item.name}`}
              >
                {item.image ? (
                  <img src={item.image} alt={item.name} loading="lazy" />
                ) : (
                  <span className="cart-item__media-placeholder" aria-hidden="true">
                    DEER
                  </span>
                )}
              </Link>

              <div className="cart-item__details">
                <div className="cart-item__row">
                  <h3 className="cart-item__name">
                    <Link to={`/products/${item.slug}`}>{item.name}</Link>
                  </h3>
                  <button
                    type="button"
                    className="cart-item__remove"
                    onClick={() => removeItem(item.lineKey)}
                    aria-label={`Remove ${item.name} from bag`}
                  >
                    <Trash2 size={16} strokeWidth={1.5} aria-hidden="true" />
                  </button>
                </div>

                {(item.size || item.color) && (
                  <p className="cart-item__meta">
                    {[
                      item.size ? `Size: ${item.size}` : null,
                      item.color ? `Colour: ${item.color}` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                )}

                <div className="cart-item__row cart-item__row--end">
                  <div className="cart-item__qty" role="group" aria-label={`Quantity of ${item.name}`}>
                    <button
                      type="button"
                      className="cart-item__qty-btn"
                      onClick={() => updateQuantity(item.lineKey, item.quantity - 1)}
                      disabled={item.quantity <= 1}
                      aria-label="Decrease quantity"
                    >
                      <Minus size={14} strokeWidth={1.5} aria-hidden="true" />
                    </button>
                    <span className="cart-item__qty-value" aria-live="polite">
                      {item.quantity}
                    </span>
                    <button
                      type="button"
                      className="cart-item__qty-btn"
                      onClick={() => updateQuantity(item.lineKey, item.quantity + 1)}
                      aria-label="Increase quantity"
                    >
                      <Plus size={14} strokeWidth={1.5} aria-hidden="true" />
                    </button>
                  </div>
                  <p className="cart-item__price">{formatPrice(item.price * item.quantity)}</p>
                </div>
              </div>
            </article>
          ))}

          <button type="button" className="cart-page__clear" onClick={clear}>
            Clear bag
          </button>
        </section>

        <aside className="cart-summary" aria-label="Order summary">
          <h2 className="cart-summary__title">Order summary</h2>

          <dl className="cart-summary__rows">
            <div className="cart-summary__row">
              <dt>Subtotal</dt>
              <dd>{formatPrice(subtotal)}</dd>
            </div>
            <div className="cart-summary__row">
              <dt>Delivery</dt>
              <dd className="cart-summary__free">Free</dd>
            </div>
            <div className="cart-summary__row cart-summary__row--total">
              <dt>Total</dt>
              <dd>{formatPrice(subtotal)}</dd>
            </div>
          </dl>

          <button type="button" className="cart-summary__checkout" disabled>
            Proceed to checkout
          </button>
          <p className="cart-summary__note">
            Checkout opens once sign-in is enabled again.
          </p>
          <Link className="cart-summary__continue" to="/">
            Continue shopping
          </Link>
        </aside>
      </div>
    </div>
  );
}
