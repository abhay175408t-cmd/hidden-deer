import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import AdminSidebar from './AdminSidebar';
import AdminTopbar from './AdminTopbar';
import './AdminLayout.css';

export default function AdminLayout() {
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setIsMobileNavOpen(false);
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, []);

  const closeMobileNav = () => setIsMobileNavOpen(false);

  return (
    <div className="admin-layout">
      <div
        className={`admin-layout__overlay ${isMobileNavOpen ? 'is-visible' : ''}`}
        onClick={closeMobileNav}
        aria-hidden={!isMobileNavOpen}
      />

      <aside
        className={`admin-layout__sidebar ${isMobileNavOpen ? 'is-open' : ''}`}
        aria-label="Admin navigation"
      >
        <AdminSidebar onNavigate={closeMobileNav} />
      </aside>

      <div className="admin-layout__main">
        <AdminTopbar onMenuClick={() => setIsMobileNavOpen(true)} />

        <main className="admin-layout__content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
