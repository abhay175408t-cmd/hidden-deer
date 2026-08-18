import { NavLink } from 'react-router-dom';
import './AdminSidebar.css';

const navItems = [
  { to: '/admin/dashboard', label: 'Dashboard', end: true },
  { to: '/admin/products', label: 'Products' },
  { to: '/admin/categories', label: 'Categories' },
  { to: '/admin/orders', label: 'Orders' },
  { to: '/admin/reviews', label: 'Reviews' },
  { to: '/admin/coupons', label: 'Coupons' },
  { to: '/admin/notifications', label: 'Notifications' },
  { to: '/admin/emails', label: 'Emails' },
  { to: '/admin/settings', label: 'Settings' },
];

export default function AdminSidebar({ onNavigate }) {
  return (
    <div className="admin-sidebar">
      <div className="admin-sidebar__brand" aria-label="DEER admin home">
        DEER
      </div>

      <nav className="admin-sidebar__nav" aria-label="Admin navigation links">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `admin-sidebar__link ${isActive ? 'is-active' : ''}`
            }
            onClick={onNavigate}
          >
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
