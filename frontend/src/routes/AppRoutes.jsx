import { Navigate, Route, Routes } from 'react-router-dom';
import MainLayout from '../components/customer/MainLayout/MainLayout';
import HomePage from '../pages/HomePage';
import CategoryPage from '../pages/CategoryPage';
import ProductDetailPage from '../pages/ProductDetailPage';
import CartPage from '../pages/CartPage';
import TestPage from '../pages/TestPage';
import RequireAdmin from '../components/admin/RequireAdmin';
import AdminLayout from '../components/admin/AdminLayout';
import AdminLoginPage from '../pages/admin/AdminLoginPage';
import AdminDashboardPage from '../pages/admin/AdminDashboardPage';
import AdminProductsPage from '../pages/admin/AdminProductsPage';
import AdminProductCreatePage from '../pages/admin/AdminProductCreatePage';
import AdminProductEditPage from '../pages/admin/AdminProductEditPage';
import AdminCategoriesPage from '../pages/admin/AdminCategoriesPage';
import AdminOrdersPage from '../pages/admin/AdminOrdersPage';
import AdminOrderDetailPage from '../pages/admin/AdminOrderDetailPage';
import AdminReviewsPage from '../pages/admin/AdminReviewsPage';
import AdminCouponsPage from '../pages/admin/AdminCouponsPage';
import AdminCouponCreatePage from '../pages/admin/AdminCouponCreatePage';
import AdminCouponEditPage from '../pages/admin/AdminCouponEditPage';
import AdminNotificationsPage from '../pages/admin/AdminNotificationsPage';
import AdminEmailsPage from '../pages/admin/AdminEmailsPage';
import AdminSettingsPage from '../pages/admin/AdminSettingsPage';

export default function AppRoutes() {
  return (
    <Routes>
      {/* Customer application */}
      <Route element={<MainLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/category/:categorySlug" element={<CategoryPage />} />
        <Route path="/products/:slug" element={<ProductDetailPage />} />
        <Route path="/cart" element={<CartPage />} />
        <Route path="/test" element={<TestPage />} />
      </Route>

      {/* Admin — public */}
      <Route path="/admin/login" element={<AdminLoginPage />} />

      {/* Admin — protected */}
      <Route element={<RequireAdmin />}>
        <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />

        <Route element={<AdminLayout />}>
          <Route path="/admin/dashboard" element={<AdminDashboardPage />} />
          <Route
            path="/admin/products"
            element={
              <AdminProductsPage />
            }
          />

          <Route
            path="/admin/products/new"
            element={
              <AdminProductCreatePage />
            }
          />

          <Route
            path="/admin/products/:id/edit"
            element={
              <AdminProductEditPage />
            }
          />
          <Route path="/admin/categories" element={<AdminCategoriesPage />} />
          <Route path="/admin/orders" element={<AdminOrdersPage />} />
          <Route path="/admin/orders/:id" element={<AdminOrderDetailPage />} />
          <Route path="/admin/reviews" element={<AdminReviewsPage />} />
          <Route path="/admin/coupons" element={<AdminCouponsPage />} />
          <Route path="/admin/coupons/new" element={<AdminCouponCreatePage />} />
          <Route path="/admin/coupons/:id/edit" element={<AdminCouponEditPage />} />
          <Route path="/admin/notifications" element={<AdminNotificationsPage />} />
          <Route path="/admin/emails" element={<AdminEmailsPage />} />
          <Route path="/admin/settings" element={<AdminSettingsPage />} />
        </Route>
      </Route>
    </Routes>
  );
}