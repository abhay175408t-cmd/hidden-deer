import { useLocation, useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../../auth/AdminAuthContext';
import './AdminTopbar.css';

const pageTitles = {
  '/admin/dashboard': 'Dashboard',
  '/admin/products': 'Products',
  '/admin/categories': 'Categories',
  '/admin/orders': 'Orders',
  '/admin/reviews': 'Reviews',
  '/admin/coupons': 'Coupons',
  '/admin/notifications': 'Notifications',
  '/admin/emails': 'Emails',
  '/admin/settings': 'Settings',
};

export default function AdminTopbar({ onMenuClick }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAdminAuth();

  const currentTitle = pageTitles[location.pathname] || 'Admin';

  const handleLogout = async () => {
    await logout();
    navigate('/admin/login', { replace: true });
  };

  return (
    <header className="admin-topbar">
      <div className="admin-topbar__left">
        <button
          type="button"
          className="admin-topbar__menu-button"
          aria-label="Open admin menu"
          onClick={onMenuClick}
        >
          <span />
          <span />
          <span />
        </button>

        <div className="admin-topbar__title-wrap">
          <p className="admin-topbar__eyebrow">DEER</p>
          <h1 className="admin-topbar__title">{currentTitle}</h1>
        </div>
      </div>

      <div className="admin-topbar__right">
        <div className="admin-topbar__identity" aria-live="polite">
          <span className="admin-topbar__name">{user?.name || 'Admin'}</span>
          {user?.email && <span className="admin-topbar__email">{user.email}</span>}
        </div>

        <button
          type="button"
          className="admin-topbar__logout"
          onClick={handleLogout}
        >
          Log out
        </button>
      </div>
    </header>
  );
}
