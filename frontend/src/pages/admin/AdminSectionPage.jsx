import './AdminSectionPage.css';

export default function AdminSectionPage({ title, description }) {
  return (
    <section className="admin-section-page" aria-labelledby="admin-section-heading">
      <div className="admin-section-page__header">
        <p className="admin-section-page__eyebrow">Admin</p>
        <h2 id="admin-section-heading" className="admin-section-page__title">
          {title}
        </h2>
      </div>

      <div className="admin-section-page__card">
        <p>{description}</p>
      </div>
    </section>
  );
}
