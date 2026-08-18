import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../../api/axios';
import ConfirmDialog from '../../components/admin/ConfirmDialog';
import './AdminCategoriesPage.css';

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function AdminCategoriesPage() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [formMode, setFormMode] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    name: '',
    slug: '',
    description: '',
    image: '',
    isActive: true,
  });
  const [slugEdited, setSlugEdited] = useState(false);
  const [formError, setFormError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [deactivateTarget, setDeactivateTarget] = useState(null);
  const [isDeactivating, setIsDeactivating] = useState(false);
  const [notice, setNotice] = useState(null);
  const [actionError, setActionError] = useState(null);
  const noticeTimeoutRef = useRef(null);

  const showNotice = useCallback((message) => {
    setNotice(message);
    if (noticeTimeoutRef.current) {
      clearTimeout(noticeTimeoutRef.current);
    }
    noticeTimeoutRef.current = setTimeout(() => setNotice(null), 4000);
  }, []);

  useEffect(
    () => () => {
      if (noticeTimeoutRef.current) {
        clearTimeout(noticeTimeoutRef.current);
      }
    },
    []
  );

  const loadCategories = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/categories');
      setCategories(res.data?.data?.categories || []);
    } catch (err) {
      setError(err.apiMessage || 'Unable to load categories. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  const openCreate = useCallback(() => {
    setEditingId(null);
    setForm({ name: '', slug: '', description: '', image: '', isActive: true });
    setSlugEdited(false);
    setFormError(null);
    setFormMode('create');
  }, []);

  const openEdit = useCallback(
    (category) => {
      setEditingId(category._id);
      setForm({
        name: category.name || '',
        slug: category.slug || '',
        description: category.description || '',
        image: category.image || '',
        isActive: category.isActive !== false,
      });
      setSlugEdited(true);
      setFormError(null);
      setFormMode('edit');
    },
    []
  );

  const closeForm = useCallback(() => {
    setFormMode(null);
    setEditingId(null);
    setFormError(null);
  }, []);

  const handleNameChange = useCallback(
    (value) => {
      setForm((prev) => {
        const next = { ...prev, name: value };
        if (!slugEdited) {
          next.slug = slugify(value);
        }
        return next;
      });
    },
    [slugEdited]
  );

  const handleFormFieldChange = useCallback((field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  }, []);

  const handleImageSelect = useCallback(
    async (event) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;

      if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
        setFormError('Only JPEG, PNG and WebP images are allowed.');
        return;
      }
      if (file.size > MAX_IMAGE_SIZE) {
        setFormError('Image must be less than 5 MB.');
        return;
      }

      setIsUploading(true);
      setFormError(null);
      try {
        const formData = new FormData();
        formData.append('file', file);
        const res = await api.post('/media/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        const url = res.data?.data?.image?.url;
        if (url) {
          setForm((prev) => ({ ...prev, image: url }));
        } else {
          setFormError('Unable to read the uploaded image.');
        }
      } catch (err) {
        setFormError(err.apiMessage || 'Unable to upload image. Please try again.');
      } finally {
        setIsUploading(false);
      }
    },
    []
  );

  const handleSubmit = useCallback(
    async (event) => {
      event.preventDefault();
      setFormError(null);

      const name = form.name.trim();
      const slug = form.slug.trim().toLowerCase();

      if (!name) {
        setFormError('Category name is required.');
        return;
      }
      if (!slug) {
        setFormError('Category slug is required.');
        return;
      }

      setIsSaving(true);
      try {
        const payload = {
          name,
          slug,
          description: form.description.trim() || undefined,
          image: form.image || undefined,
          isActive: form.isActive,
        };

        if (formMode === 'create') {
          await api.post('/categories', payload);
          showNotice('Category created successfully.');
        } else {
          await api.patch(`/categories/${editingId}`, payload);
          showNotice('Category updated successfully.');
        }

        closeForm();
        await loadCategories();
} catch (err) {
        const message = err.apiMessage || '';
        if (err.apiCode === 409 || /slug already exists/i.test(message)) {
          setFormError('This category slug is already in use.');
        } else {
          setFormError(message || 'Unable to save the category. Please try again.');
        }
      } finally {
        setIsSaving(false);
      }
    },
    [form, formMode, editingId, closeForm, loadCategories, showNotice]
  );

  const handleDeactivate = useCallback(async () => {
    if (!deactivateTarget) return;
    setIsDeactivating(true);
    setActionError(null);
    try {
      await api.delete(`/categories/${deactivateTarget._id}`);
      setCategories((prev) => prev.filter((c) => c._id !== deactivateTarget._id));
      setDeactivateTarget(null);
      showNotice('Category deactivated.');
    } catch (err) {
      setActionError(err.apiMessage || 'Unable to deactivate the category. Please try again.');
      setDeactivateTarget(null);
    } finally {
      setIsDeactivating(false);
    }
  }, [deactivateTarget, showNotice]);

  if (loading) {
    return (
      <section className="admin-categories" aria-live="polite">
        <div className="admin-categories__skeleton">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="admin-categories__skeleton-row" />
          ))}
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="admin-categories" aria-live="polite">
        <div className="admin-categories__state admin-categories__state--error" role="alert">
          <h2>Error loading categories.</h2>
          <p>{error}</p>
          <button
            className="admin-categories__retry"
            onClick={() => loadCategories()}
            aria-label="Retry loading categories"
          >
            Retry
          </button>
        </div>
      </section>
    );
  }

  if (formMode) {
    return (
      <section className="admin-categories" aria-live="polite">
        <div className="admin-categories__header">
          <h1 className="admin-categories__title">
            {formMode === 'create' ? 'Add Category' : 'Edit Category'}
          </h1>
          <button
            type="button"
            className="admin-categories__back-btn"
            onClick={closeForm}
            aria-label="Back to categories"
          >
            Back
          </button>
        </div>

        <form className="admin-categories__form" onSubmit={handleSubmit} noValidate>
          <div className="admin-categories__form-row">
            <label className="admin-categories__label" htmlFor="category-name">
              Name <span className="admin-categories__required">*</span>
            </label>
            <input
              id="category-name"
              className="admin-categories__input"
              type="text"
              value={form.name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="e.g. Dresses"
              autoComplete="off"
            />
          </div>

          <div className="admin-categories__form-row">
            <label className="admin-categories__label" htmlFor="category-slug">
              Slug <span className="admin-categories__required">*</span>
            </label>
            <input
              id="category-slug"
              className="admin-categories__input"
              type="text"
              value={form.slug}
              onChange={(e) => {
                setSlugEdited(true);
                handleFormFieldChange('slug', e.target.value);
              }}
              placeholder="e.g. dresses"
              autoComplete="off"
            />
            <span className="admin-categories__hint">
              Suggested from the name; you can edit it. Must be unique.
            </span>
          </div>

          <div className="admin-categories__form-row">
            <label className="admin-categories__label" htmlFor="category-description">
              Description
            </label>
            <textarea
              id="category-description"
              className="admin-categories__input admin-categories__textarea"
              rows={4}
              value={form.description}
              onChange={(e) => handleFormFieldChange('description', e.target.value)}
              placeholder="Optional short description"
            />
          </div>

          <div className="admin-categories__form-row">
            <label className="admin-categories__label">Image</label>
            {form.image ? (
              <div className="admin-categories__image-preview">
                <img
                  src={form.image}
                  alt="Category preview"
                  className="admin-categories__image"
                  width={120}
                  height={120}
                />
                <button
                  type="button"
                  className="admin-categories__image-remove"
                  onClick={() => handleFormFieldChange('image', '')}
                  aria-label="Remove category image"
                >
                  Remove
                </button>
              </div>
            ) : (
              <div className="admin-categories__image-empty">No image.</div>
            )}
            <input
              id="category-image"
              className="admin-categories__file-input"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleImageSelect}
              disabled={isUploading}
            />
            <label className="admin-categories__upload-btn" htmlFor="category-image">
              {isUploading ? 'Uploading…' : 'Upload image'}
            </label>
            <span className="admin-categories__hint">
              JPEG, PNG or WebP up to 5 MB.
            </span>
          </div>

          <div className="admin-categories__form-row">
            <label className="admin-categories__checkbox-label">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => handleFormFieldChange('isActive', e.target.checked)}
              />
              Active
            </label>
          </div>

          {formError && (
            <div className="admin-categories__form-error" role="alert">
              {formError}
            </div>
          )}

          <div className="admin-categories__form-actions">
            <button
              type="submit"
              className="admin-categories__save-btn"
              disabled={isSaving || isUploading}
            >
              {isSaving ? 'Saving…' : formMode === 'create' ? 'Add Category' : 'Save Changes'}
            </button>
            <button
              type="button"
              className="admin-categories__cancel-btn"
              onClick={closeForm}
              disabled={isSaving}
            >
              Cancel
            </button>
          </div>
        </form>
      </section>
    );
  }

  return (
    <section className="admin-categories" aria-live="polite">
      <div className="admin-categories__header">
        <h1 className="admin-categories__title">Categories</h1>
        <button
          type="button"
          className="admin-categories__add-btn"
          onClick={openCreate}
          aria-label="Add new category"
        >
          Add Category
        </button>
      </div>

      {notice && (
        <div className="admin-categories__notice" role="status">
          {notice}
        </div>
      )}

      {actionError && (
        <div className="admin-categories__form-error" role="alert">
          {actionError}
        </div>
      )}

      {categories.length === 0 ? (
        <div className="admin-categories__empty" role="status">
          No categories found. Add your first category to get started.
        </div>
      ) : (
        <div className="admin-categories__table-wrap">
          <table className="admin-categories__table">
            <thead>
              <tr>
                <th className="admin-categories__col-image">Image</th>
                <th className="admin-categories__col-name">Name</th>
                <th className="admin-categories__col-slug">Slug</th>
                <th className="admin-categories__col-description">Description</th>
                <th className="admin-categories__col-status">Status</th>
                <th className="admin-categories__col-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((category) => (
                <tr key={category._id} className="admin-categories__row">
                  <td className="admin-categories__col-image">
                    {category.image ? (
                      <img
                        src={category.image}
                        alt={category.name || ''}
                        className="admin-categories__thumb"
                        width={40}
                        height={40}
                      />
                    ) : (
                      <div className="admin-categories__thumb-placeholder">&nbsp;</div>
                    )}
                  </td>
                  <td className="admin-categories__col-name">
                    <span className="admin-categories__name">{category.name}</span>
                  </td>
                  <td className="admin-categories__col-slug">{category.slug}</td>
                  <td className="admin-categories__col-description">
                    {category.description || '—'}
                  </td>
                  <td className="admin-categories__col-status">
                    <span
                      className={`admin-categories__badge ${
                        category.isActive !== false
                          ? 'admin-categories__badge--active'
                          : 'admin-categories__badge--inactive'
                      }`}
                    >
                      {category.isActive !== false ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="admin-categories__col-actions">
                    <button
                      type="button"
                      className="admin-categories__action-btn"
                      onClick={() => openEdit(category)}
                      aria-label={`Edit category ${category.name}`}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="admin-categories__action-btn admin-categories__action-btn--danger"
                      onClick={() => setDeactivateTarget(category)}
                      aria-label={`Deactivate category ${category.name}`}
                    >
                      Deactivate
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={deactivateTarget !== null}
        title="Deactivate this category?"
        message={`"${deactivateTarget?.name || ''}" will be hidden from the store. This cannot be undone from the admin panel.`}
        confirmLabel="Deactivate"
        busy={isDeactivating}
        onConfirm={handleDeactivate}
        onCancel={() => setDeactivateTarget(null)}
      />
    </section>
  );
}

export default AdminCategoriesPage;

