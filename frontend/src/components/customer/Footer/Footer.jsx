import { useState } from 'react';
import { Link } from 'react-router-dom';
import './Footer.css';

/**
 * Premium editorial footer. Shop links use real routes; help/account items
 * have no pages yet, so they render as muted placeholders instead of dead
 * links. Newsletter is a local success state (no backend for it yet).
 */
export default function Footer({ categories }) {
  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);

  const shopLinks = [
    { label: 'Discover', to: '/' },
    ...(categories || []).slice(0, 6).map((category) => ({
      label: category.name,
      to: `/?category=${category.slug}`,
    })),
  ];

  const helpItems = ['Contact', 'Shipping', 'Returns', 'FAQ'];
  const accountItems = ['Profile', 'Orders', 'Bag'];
  const socialItems = ['Instagram', 'X', 'YouTube'];

  const handleSubscribe = (event) => {
    event.preventDefault();
    if (!email.trim()) return;
    setSubscribed(true);
  };

  return (
    <footer className="footer" aria-label="Site footer">
      <div className="footer__inner">
        <div className="footer__brand">
          <Link to="/" className="footer__logo" aria-label="Deer home">
            DEER
          </Link>
          <p className="footer__tagline">Quiet clothes, made to last.</p>
        </div>

        <nav className="footer__col" aria-label="Shop">
          <h3 className="footer__heading">Shop</h3>
          <ul className="footer__list">
            {shopLinks.map((link) => (
              <li key={link.label}>
                <Link to={link.to} className="footer__link">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="footer__col" aria-label="Help">
          <h3 className="footer__heading">Help</h3>
          <ul className="footer__list">
            {helpItems.map((item) => (
              <li key={item} className="footer__placeholder">
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="footer__col" aria-label="Account">
          <h3 className="footer__heading">Account</h3>
          <ul className="footer__list">
            {accountItems.map((item) => (
              <li key={item} className="footer__placeholder">
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="footer__col footer__col--social" aria-label="Social">
          <h3 className="footer__heading">Social</h3>
          <ul className="footer__list">
            {socialItems.map((item) => (
              <li key={item} className="footer__placeholder">
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="footer__newsletter">
        <div>
          <h3 className="footer__newsletter-title">Join the Deer List</h3>
          <p className="footer__newsletter-copy">
            New arrivals, small runs and member-only offers. No noise.
          </p>
        </div>
        {subscribed ? (
          <p className="footer__newsletter-ok" role="status">
            You&apos;re on the list. Welcome to Deer.
          </p>
        ) : (
          <form className="footer__newsletter-form" onSubmit={handleSubscribe}>
            <label className="sr-only" htmlFor="footer-email">
              Email address
            </label>
            <input
              id="footer-email"
              className="footer__newsletter-input"
              type="email"
              required
              placeholder="Email address"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <button type="submit" className="footer__newsletter-btn">
              Subscribe
            </button>
          </form>
        )}
      </div>

      <div className="footer__base">
        <span>© {new Date().getFullYear()} Deer</span>
        <span className="footer__base-note">Pincode · Shipping · Returns</span>
      </div>
    </footer>
  );
}