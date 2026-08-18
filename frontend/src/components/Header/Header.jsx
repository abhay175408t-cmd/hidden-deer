import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Menu, Search, User, ShoppingBag } from 'lucide-react';
import './Header.css';

const iconProps = { size: 20, strokeWidth: 1.5 };

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export default function Header({ categories = [] }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');

  const handleSearchSubmit = (event) => {
    event.preventDefault();
    const value = query.trim();
    if (!value) return;
    const slug = slugify(value);
    const match = categories.find(
      (category) => category.slug === slug || category.name.toLowerCase() === value.toLowerCase()
    );
    if (match) {
      navigate(`/?category=${match.slug}`);
    } else {
      navigate(`/products/${slug}`);
    }
    setQuery('');
  };

  return (
    <header className="header">
      <nav className="header__nav" aria-label="Main navigation">
        <div className="header__group header__group--left">
          <button type="button" className="header__action" aria-label="Open menu">
            <Menu {...iconProps} aria-hidden="true" />
            <span className="header__action-label">Menu</span>
          </button>
        </div>

        <Link to="/" className="header__logo" aria-label="Deer home">
          DEER
        </Link>

        <div className="header__group header__group--right">
          <form className="header__search" role="search" onSubmit={handleSearchSubmit}>
            <input
              type="search"
              className="header__search-input"
              placeholder="Search"
              aria-label="Search products and categories"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <button type="submit" className="header__search-btn" aria-label="Submit search">
              <Search {...iconProps} aria-hidden="true" />
            </button>
          </form>
          <button type="button" className="header__action" aria-label="Profile">
            <User {...iconProps} aria-hidden="true" />
          </button>
          <button type="button" className="header__action" aria-label="Shopping bag">
            <ShoppingBag {...iconProps} aria-hidden="true" />
          </button>
        </div>
      </nav>
    </header>
  );
}