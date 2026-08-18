import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../../api/axios';
import './CouponForm.css';

const SEARCH_DEBOUNCE_MS = 300;
const CODE_REGEX = /^[A-Z0-9][A-Z0-9-]{2,19}$/;

const emptyCoupon = {
  code: '',
  description: '',
  discountType: 'fixed',
  discountValue: '',
  maxDiscount: '',
  minCartValue: '',
  firstOrderOnly: false,
  applicableProducts: [],
  applicableCategories: [],
  excludedProducts: [],
  excludedCategories: [],
  expiresAt: '',
  usageLimit: '',
  isActive: true,
};

function toDateInputValue(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function buildInitialValues(coupon) {
  if (!coupon) return emptyCoupon;
  return {
    code: coupon.code || '',
    description: coupon.description || '',
    discountType: coupon.discountType || 'fixed',
    discountValue: coupon.discountValue === undefined || coupon.discountValue === null ? '' : String(coupon.discountValue),
    maxDiscount: coupon.maxDiscount === undefined || coupon.maxDiscount === null ? '' : String(coupon.maxDiscount),
    minCartValue: coupon.minCartValue === undefined || coupon.minCartValue === null ? '' : String(coupon.minCartValue),
    firstOrderOnly: coupon.firstOrderOnly === true,
    applicableProducts: coupon.applicableProducts || [],
    applicableCategories: coupon.applicableCategories || [],
    excludedProducts: coupon.excludedProducts || [],
    excludedCategories: coupon.excludedCategories || [],
    expiresAt: toDateInputValue(coupon.expiresAt),
    usageLimit: coupon.usageLimit === undefined || coupon.usageLimit === null ? '' : String(coupon.usageLimit),
    isActive: coupon.isActive !== false,
  };
}

function CouponForm({ initialValues, submitLabel, onSubmit, onCancel }) {
  const [form, setForm] = useState(() => buildInitialValues(initialValues));
  const [fieldErrors, setFieldErrors] = useState({});
  const [apiError, setApiError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [categories, setCategories] = useState([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState('');

  const [products, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productSearch, setProductSearch] = useState('');
  const [productSearchApplied, setProductSearchApplied] = useState('');

  useEffect(() => {
    let active = true;
    api
      .get('/categories')
      .then((res) => {
        if (active) setCategories(res.data?.data?.categories || []);
      })
      .catch(() => {
        if (active) setCategories([]);
      })
      .finally(() => {
        if (active) setCategoriesLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setProductSearchApplied(productSearch);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeoutId);
  }, [productSearch]);

  useEffect(() => {
    let active = true;
    setProductsLoading(true);
    const params = new URLSearchParams();
    if (productSearchApplied) params.set('search', productSearchApplied);
    params.set('page', '1');
    params.set('limit', '100');
    api
      .get('/admin/products', { params })
      .then((res) => {
        if (active) setProducts(res.data?.data?.products || []);
      })
      .catch(() => {
        if (active) setProducts([]);
      })
      .finally(() => {
        if (active) setProductsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [productSearchApplied]);

  const setField = useCallback((field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setFieldErrors((prev) => {
      if (!(field in prev)) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);

  const toggleInList = useCallback(
    (listKey, otherKey, value) => {
      setForm((prev) => {
        const current = prev[listKey] || [];
        const contains = current.includes(value);
        const nextList = contains
          ? current.filter((v) => v !== value)
          : [...current, value];
        const next = { ...prev, [listKey]: nextList };
        if (!contains) {
          next[otherKey] = (next[otherKey] || []).filter((v) => v !== value);
        }
        return next;
      });
    },
    []
  );

  const validate = useCallback(() => {
    const errors = {};

    const code = String(form.code || '').trim().toUpperCase();
    if (!code) {
      errors.code = 'Coupon code is required.';
    } else if (!CODE_REGEX.test(code)) {
      errors.code = 'Code must be 3–20 uppercase letters, digits or dashes, starting with a letter or digit.';
    }

    if (!['fixed', 'percent'].includes(form.discountType)) {
      errors.discountType = 'Choose a discount type.';
    }

    const discountValue = Number(form.discountValue);
    if (form.discountValue === '' || form.discountValue === null || form.discountValue === undefined) {
      errors.discountValue = 'Discount value is required.';
    } else if (!Number.isFinite(discountValue) || discountValue < 1) {
      errors.discountValue = 'Discount value must be at least 1.';
    } else if (form.discountType === 'percent' && discountValue > 100) {
      errors.discountValue = 'Percentage discount cannot exceed 100.';
    }

    if (form.maxDiscount !== '' && form.maxDiscount !== null && form.maxDiscount !== undefined) {
      const maxDiscount = Number(form.maxDiscount);
      if (!Number.isFinite(maxDiscount) || maxDiscount < 1) {
        errors.maxDiscount = 'Max discount must be at least 1.';
      }
    }

    if (form.minCartValue !== '' && form.minCartValue !== null && form.minCartValue !== undefined) {
      const minCartValue = Number(form.minCartValue);
      if (!Number.isFinite(minCartValue) || minCartValue < 0) {
        errors.minCartValue = 'Minimum cart value cannot be negative.';
      }
    }

    if (form.usageLimit !== '' && form.usageLimit !== null && form.usageLimit !== undefined) {
      const usageLimit = Number(form.usageLimit);
      if (!Number.isInteger(usageLimit) || usageLimit < 1) {
        errors.usageLimit = 'Usage limit must be a positive whole number.';
      }
    }

    if (form.expiresAt) {
      const parsed = new Date(form.expiresAt);
      if (Number.isNaN(parsed.getTime())) {
        errors.expiresAt = 'Expiry must be a valid date.';
      }
    }

    return errors;
  }, [form]);

  const handleSubmit = useCallback(
    async (event) => {
      event.preventDefault();
      setApiError(null);

      const errors = validate();
      setFieldErrors(errors);
      if (Object.keys(errors).length > 0) {
        return;
      }

      const code = String(form.code || '').trim().toUpperCase();
      const payload = {
        code,
        description: String(form.description || '').trim(),
        discountType: form.discountType,
        discountValue: Number(form.discountValue),
        maxDiscount:
          form.maxDiscount === '' || form.maxDiscount === null
            ? null
            : Number(form.maxDiscount),
        minCartValue:
          form.minCartValue === '' || form.minCartValue === null
            ? null
            : Number(form.minCartValue),
        firstOrderOnly: form.firstOrderOnly === true,
        applicableProducts: form.applicableProducts,
        applicableCategories: form.applicableCategories,
        excludedProducts: form.excludedProducts,
        excludedCategories: form.excludedCategories,
        expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
        usageLimit:
          form.usageLimit === '' || form.usageLimit === null
            ? null
            : Number(form.usageLimit),
        isActive: form.isActive !== false,
      };

      setIsSubmitting(true);
      try {
        await onSubmit(payload);
      } catch (err) {
        const message = err.apiMessage || err.message || '';
        if (/already exists/i.test(message) && /code/i.test(message)) {
          setApiError('This coupon code is already in use.');
        } else {
          setApiError(message || 'Unable to save the coupon. Please try again.');
        }
      } finally {
        setIsSubmitting(false);
      }
    },
    [form, validate, onSubmit]
  );

  const filteredCategories = categoryFilter
    ? categories.filter((category) =>
        String(category.name || '')
          .toLowerCase()
          .includes(categoryFilter.toLowerCase())
      )
    : categories;

  const productName = useCallback(
    (id) => {
      const product = products.find((p) => p.id === id);
      return product ? product.name : null;
    },
    [products]
  );

  const categoryName = useCallback(
    (id) => {
      const category = categories.find((c) => String(c._id) === id);
      return category ? category.name : null;
    },
    [categories]
  );

  return (
    <form className="coupon-form" onSubmit={handleSubmit} noValidate>
      <div className="coupon-form__section">
        <h2 className="coupon-form__section-title">Basics</h2>

        <div className="coupon-form__row">
          <label className="coupon-form__label" htmlFor="coupon-code">
            Code <span className="coupon-form__required">*</span>
          </label>
          <input
            id="coupon-code"
            className="coupon-form__input"
            type="text"
            value={form.code}
            onChange={(e) => setField('code', e.target.value.toUpperCase())}
            placeholder="e.g. SAVE10"
            maxLength={20}
            autoComplete="off"
          />
          <span className="coupon-form__hint">
            Uppercase letters, digits and dashes. Stored in uppercase.
          </span>
          {fieldErrors.code && (
            <p className="coupon-form__field-error" role="alert">
              {fieldErrors.code}
            </p>
          )}
        </div>

        <div className="coupon-form__row">
          <label className="coupon-form__label" htmlFor="coupon-description">
            Description
          </label>
          <input
            id="coupon-description"
            className="coupon-form__input"
            type="text"
            value={form.description}
            onChange={(e) => setField('description', e.target.value)}
            placeholder="Optional customer-facing description"
          />
        </div>

        <div className="coupon-form__grid">
          <div className="coupon-form__row">
            <label className="coupon-form__label" htmlFor="coupon-type">
              Discount type <span className="coupon-form__required">*</span>
            </label>
            <select
              id="coupon-type"
              className="coupon-form__input"
              value={form.discountType}
              onChange={(e) => setField('discountType', e.target.value)}
            >
              <option value="fixed">Fixed amount</option>
              <option value="percent">Percentage</option>
            </select>
            {fieldErrors.discountType && (
              <p className="coupon-form__field-error" role="alert">
                {fieldErrors.discountType}
              </p>
            )}
          </div>

          <div className="coupon-form__row">
            <label className="coupon-form__label" htmlFor="coupon-value">
              Discount value <span className="coupon-form__required">*</span>
            </label>
            <input
              id="coupon-value"
              className="coupon-form__input"
              type="number"
              min="1"
              step="any"
              value={form.discountValue}
              onChange={(e) => setField('discountValue', e.target.value)}
              placeholder={form.discountType === 'percent' ? 'e.g. 10' : 'e.g. 200'}
            />
            <span className="coupon-form__hint">
              {form.discountType === 'percent'
                ? 'Percentage of the eligible subtotal (max 100).'
                : 'Flat amount off the eligible subtotal.'}
            </span>
            {fieldErrors.discountValue && (
              <p className="coupon-form__field-error" role="alert">
                {fieldErrors.discountValue}
              </p>
            )}
          </div>

          <div className="coupon-form__row">
            <label className="coupon-form__label" htmlFor="coupon-max-discount">
              Max discount
            </label>
            <input
              id="coupon-max-discount"
              className="coupon-form__input"
              type="number"
              min="1"
              step="any"
              value={form.maxDiscount}
              onChange={(e) => setField('maxDiscount', e.target.value)}
              placeholder="Leave empty for no cap"
            />
            <span className="coupon-form__hint">
              Cap applied to percentage discounts.
            </span>
            {fieldErrors.maxDiscount && (
              <p className="coupon-form__field-error" role="alert">
                {fieldErrors.maxDiscount}
              </p>
            )}
          </div>

          <div className="coupon-form__row">
            <label className="coupon-form__label" htmlFor="coupon-min-cart">
              Minimum cart value
            </label>
            <input
              id="coupon-min-cart"
              className="coupon-form__input"
              type="number"
              min="0"
              step="any"
              value={form.minCartValue}
              onChange={(e) => setField('minCartValue', e.target.value)}
              placeholder="Leave empty for no minimum"
            />
            {fieldErrors.minCartValue && (
              <p className="coupon-form__field-error" role="alert">
                {fieldErrors.minCartValue}
              </p>
            )}
          </div>

          <div className="coupon-form__row">
            <label className="coupon-form__label" htmlFor="coupon-expiry">
              Expiry date
            </label>
            <input
              id="coupon-expiry"
              className="coupon-form__input"
              type="date"
              value={form.expiresAt}
              onChange={(e) => setField('expiresAt', e.target.value)}
            />
            <span className="coupon-form__hint">Leave empty for no expiry.</span>
            {fieldErrors.expiresAt && (
              <p className="coupon-form__field-error" role="alert">
                {fieldErrors.expiresAt}
              </p>
            )}
          </div>

          <div className="coupon-form__row">
            <label className="coupon-form__label" htmlFor="coupon-usage-limit">
              Usage limit
            </label>
            <input
              id="coupon-usage-limit"
              className="coupon-form__input"
              type="number"
              min="1"
              step="1"
              value={form.usageLimit}
              onChange={(e) => setField('usageLimit', e.target.value)}
              placeholder="Leave empty for unlimited"
            />
            {fieldErrors.usageLimit && (
              <p className="coupon-form__field-error" role="alert">
                {fieldErrors.usageLimit}
              </p>
            )}
          </div>
        </div>

        <div className="coupon-form__row">
          <label className="coupon-form__checkbox-label">
            <input
              type="checkbox"
              checked={form.firstOrderOnly}
              onChange={(e) => setField('firstOrderOnly', e.target.checked)}
            />
            First order only
          </label>
        </div>

        <div className="coupon-form__row">
          <label className="coupon-form__checkbox-label">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setField('isActive', e.target.checked)}
            />
            Active
          </label>
        </div>
      </div>

      <div className="coupon-form__section">
        <h2 className="coupon-form__section-title">Product scope</h2>
        <p className="coupon-form__section-note">
          Leave all lists empty to apply the coupon to every item in the cart.
          Products in an applicable list must also not be excluded. A product
          cannot appear in both the applicable and excluded lists.
        </p>

        <div className="coupon-form__scope">
          <div className="coupon-form__scope-panel">
            <h3 className="coupon-form__scope-title">Applicable products</h3>
            <div className="coupon-form__selected">
              {form.applicableProducts.length === 0 ? (
                <span className="coupon-form__selected-empty">None selected</span>
              ) : (
                form.applicableProducts.map((id) => (
                  <span key={id} className="coupon-form__chip">
                    {productName(id) || shortLabel(id)}
                    <button
                      type="button"
                      className="coupon-form__chip-remove"
                      onClick={() => toggleInList('applicableProducts', 'excludedProducts', id)}
                      aria-label={`Remove ${productName(id) || shortLabel(id)} from applicable products`}
                    >
                      ×
                    </button>
                  </span>
                ))
              )}
            </div>
            <input
              type="text"
              className="coupon-form__input coupon-form__scope-search"
              placeholder="Search products…"
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              aria-label="Search products for the applicable list"
            />
            <div className="coupon-form__scope-list">
              {productsLoading ? (
                <p className="coupon-form__scope-note">Loading products…</p>
              ) : products.length === 0 ? (
                <p className="coupon-form__scope-note">No products found.</p>
              ) : (
                products.map((product) => (
                  <label key={product.id} className="coupon-form__scope-item">
                    <input
                      type="checkbox"
                      checked={form.applicableProducts.includes(product.id)}
                      onChange={() =>
                        toggleInList('applicableProducts', 'excludedProducts', product.id)
                      }
                    />
                    <span>{product.name}</span>
                  </label>
                ))
              )}
            </div>
          </div>

          <div className="coupon-form__scope-panel">
            <h3 className="coupon-form__scope-title">Excluded products</h3>
            <div className="coupon-form__selected">
              {form.excludedProducts.length === 0 ? (
                <span className="coupon-form__selected-empty">None selected</span>
              ) : (
                form.excludedProducts.map((id) => (
                  <span key={id} className="coupon-form__chip">
                    {productName(id) || shortLabel(id)}
                    <button
                      type="button"
                      className="coupon-form__chip-remove"
                      onClick={() => toggleInList('excludedProducts', 'applicableProducts', id)}
                      aria-label={`Remove ${productName(id) || shortLabel(id)} from excluded products`}
                    >
                      ×
                    </button>
                  </span>
                ))
              )}
            </div>
            <input
              type="text"
              className="coupon-form__input coupon-form__scope-search"
              placeholder="Search products…"
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              aria-label="Search products for the excluded list"
            />
            <div className="coupon-form__scope-list">
              {productsLoading ? (
                <p className="coupon-form__scope-note">Loading products…</p>
              ) : products.length === 0 ? (
                <p className="coupon-form__scope-note">No products found.</p>
              ) : (
                products.map((product) => (
                  <label key={product.id} className="coupon-form__scope-item">
                    <input
                      type="checkbox"
                      checked={form.excludedProducts.includes(product.id)}
                      onChange={() =>
                        toggleInList('excludedProducts', 'applicableProducts', product.id)
                      }
                    />
                    <span>{product.name}</span>
                  </label>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="coupon-form__section">
        <h2 className="coupon-form__section-title">Category scope</h2>

        <div className="coupon-form__scope">
          <div className="coupon-form__scope-panel">
            <h3 className="coupon-form__scope-title">Applicable categories</h3>
            <div className="coupon-form__selected">
              {form.applicableCategories.length === 0 ? (
                <span className="coupon-form__selected-empty">None selected</span>
              ) : (
                form.applicableCategories.map((id) => (
                  <span key={id} className="coupon-form__chip">
                    {categoryName(id) || shortLabel(id)}
                    <button
                      type="button"
                      className="coupon-form__chip-remove"
                      onClick={() => toggleInList('applicableCategories', 'excludedCategories', id)}
                      aria-label={`Remove ${categoryName(id) || shortLabel(id)} from applicable categories`}
                    >
                      ×
                    </button>
                  </span>
                ))
              )}
            </div>
            <input
              type="text"
              className="coupon-form__input coupon-form__scope-search"
              placeholder="Filter categories…"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              aria-label="Filter categories for the applicable list"
            />
            <div className="coupon-form__scope-list">
              {categoriesLoading ? (
                <p className="coupon-form__scope-note">Loading categories…</p>
              ) : filteredCategories.length === 0 ? (
                <p className="coupon-form__scope-note">No categories found.</p>
              ) : (
                filteredCategories.map((category) => (
                  <label key={category._id} className="coupon-form__scope-item">
                    <input
                      type="checkbox"
                      checked={form.applicableCategories.includes(String(category._id))}
                      onChange={() =>
                        toggleInList(
                          'applicableCategories',
                          'excludedCategories',
                          String(category._id)
                        )
                      }
                    />
                    <span>{category.name}</span>
                  </label>
                ))
              )}
            </div>
          </div>

          <div className="coupon-form__scope-panel">
            <h3 className="coupon-form__scope-title">Excluded categories</h3>
            <div className="coupon-form__selected">
              {form.excludedCategories.length === 0 ? (
                <span className="coupon-form__selected-empty">None selected</span>
              ) : (
                form.excludedCategories.map((id) => (
                  <span key={id} className="coupon-form__chip">
                    {categoryName(id) || shortLabel(id)}
                    <button
                      type="button"
                      className="coupon-form__chip-remove"
                      onClick={() => toggleInList('excludedCategories', 'applicableCategories', id)}
                      aria-label={`Remove ${categoryName(id) || shortLabel(id)} from excluded categories`}
                    >
                      ×
                    </button>
                  </span>
                ))
              )}
            </div>
            <input
              type="text"
              className="coupon-form__input coupon-form__scope-search"
              placeholder="Filter categories…"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              aria-label="Filter categories for the excluded list"
            />
            <div className="coupon-form__scope-list">
              {categoriesLoading ? (
                <p className="coupon-form__scope-note">Loading categories…</p>
              ) : filteredCategories.length === 0 ? (
                <p className="coupon-form__scope-note">No categories found.</p>
              ) : (
                filteredCategories.map((category) => (
                  <label key={category._id} className="coupon-form__scope-item">
                    <input
                      type="checkbox"
                      checked={form.excludedCategories.includes(String(category._id))}
                      onChange={() =>
                        toggleInList(
                          'excludedCategories',
                          'applicableCategories',
                          String(category._id)
                        )
                      }
                    />
                    <span>{category.name}</span>
                  </label>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {apiError && (
        <div className="coupon-form__api-error" role="alert">
          {apiError}
        </div>
      )}

      <div className="coupon-form__actions">
        <button
          type="submit"
          className="coupon-form__submit"
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Saving…' : submitLabel}
        </button>
        <button
          type="button"
          className="coupon-form__cancel"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function shortLabel(value) {
  if (!value) return 'Unknown';
  return value.length > 12 ? `${value.slice(0, 12)}…` : value;
}

export default CouponForm;