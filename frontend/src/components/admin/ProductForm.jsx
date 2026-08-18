import { useCallback, useEffect, useState } from 'react';
import api from '../../api/axios';
import './ProductForm.css';

const MAX_PRODUCT_IMAGES = 10;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function toCommaList(value) {
  if (!value) return '';
  if (Array.isArray(value)) return value.join(', ');
  return String(value);
}

function toNumberOrNull(value) {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

const emptyProduct = {
  name: '',
  slug: '',
  description: '',
  category: '',
  brand: '',
  price: '',
  discountPrice: '',
  sku: '',
  stock: '',
  colors: '',
  sizes: '',
  tags: '',
  isFeatured: false,
  isNew: false,
  isBestSeller: false,
  isActive: true,
  images: [],
  variants: [],
};

function buildInitialValues(product) {
  if (!product) return emptyProduct;
  return {
    name: product.name || '',
    slug: product.slug || '',
    description: product.description || '',
    category: product.category?.id || '',
    brand: product.brand || '',
    price: product.price === undefined || product.price === null ? '' : String(product.price),
    discountPrice:
      product.discountPrice === undefined || product.discountPrice === null
        ? ''
        : String(product.discountPrice),
    sku: product.sku || '',
    stock: product.stock === undefined || product.stock === null ? '' : String(product.stock),
    colors: toCommaList(product.colors),
    sizes: toCommaList(product.sizes),
    tags: toCommaList(product.tags),
    isFeatured: product.isFeatured === true,
    isNew: product.isNew === true,
    isBestSeller: product.isBestSeller === true,
    isActive: product.isActive !== false,
    images: Array.isArray(product.images) ? product.images : [],
    variants: Array.isArray(product.variants)
      ? product.variants.map((variant) => ({
          _id: variant._id,
          color: variant.color || '',
          size: variant.size || '',
          sku: variant.sku || '',
          price: variant.price === undefined || variant.price === null ? '' : String(variant.price),
          discountPrice:
            variant.discountPrice === undefined || variant.discountPrice === null
              ? ''
              : String(variant.discountPrice),
          stock:
            variant.stock === undefined || variant.stock === null ? '' : String(variant.stock),
          images: Array.isArray(variant.images) ? variant.images : [],
        }))
      : [],
  };
}

function ProductForm({ initialValues, submitLabel, onSubmit, onCancel }) {
  const [form, setForm] = useState(() => buildInitialValues(initialValues));
  const [slugTouched, setSlugTouched] = useState(false);
  const [categories, setCategories] = useState([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [fieldErrors, setFieldErrors] = useState({});
  const [variantErrors, setVariantErrors] = useState({});
  const [apiError, setApiError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);

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

  const setField = useCallback((field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setFieldErrors((prev) => {
      if (!(field in prev)) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);

  const handleNameChange = useCallback(
    (value) => {
      setForm((prev) => ({
        ...prev,
        name: value,
        slug: slugTouched ? prev.slug : slugify(value),
      }));
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next.name;
        if (!slugTouched) delete next.slug;
        return next;
      });
    },
    [slugTouched]
  );

  const setVariantField = useCallback((index, field, value) => {
    setForm((prev) => {
      const variants = prev.variants.map((variant, i) =>
        i === index ? { ...variant, [field]: value } : variant
      );
      return { ...prev, variants };
    });
    setVariantErrors((prev) => {
      const next = { ...prev };
      delete next[index];
      return next;
    });
  }, []);

  const addVariant = useCallback(() => {
    setForm((prev) => ({
      ...prev,
      variants: [
        ...prev.variants,
        {
          _id: undefined,
          color: '',
          size: '',
          sku: '',
          price: '',
          discountPrice: '',
          stock: '',
          images: [],
        },
      ],
    }));
  }, []);

  const removeVariant = useCallback(
    (index) => {
      setForm((prev) => ({
        ...prev,
        variants: prev.variants.filter((_, i) => i !== index),
      }));
      setVariantErrors((prev) => {
        const next = { ...prev };
        delete next[index];
        return next;
      });
    },
    []
  );

  const handleFileSelect = useCallback(
    async (e) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;

      setUploadError(null);
      if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
        setUploadError('Only JPEG, PNG and WebP images are allowed.');
        return;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        setUploadError('Image must be less than 5 MB.');
        return;
      }
      if (form.images.length >= MAX_PRODUCT_IMAGES) {
        setUploadError(`A product cannot have more than ${MAX_PRODUCT_IMAGES} images.`);
        return;
      }

      setIsUploading(true);
      try {
        const formData = new FormData();
        formData.append('file', file);
        const res = await api.post('/media/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        const image = res.data?.data?.image;
        if (!image?.url) {
          setUploadError('Upload succeeded but returned no image URL.');
          return;
        }
        setForm((prev) => ({
          ...prev,
          images: [...prev.images, { url: image.url, publicId: image.publicId, alt: '', position: prev.images.length, isPrimary: false }],
        }));
      } catch (err) {
        setUploadError(err.apiMessage || 'Unable to upload the image. Please try again.');
      } finally {
        setIsUploading(false);
      }
    },
    [form.images.length]
  );

  const removeImage = useCallback(
    (index) => {
      setForm((prev) => ({
        ...prev,
        images: prev.images.filter((_, i) => i !== index),
      }));
    },
    []
  );

  const validate = useCallback(() => {
    const errors = {};
    const variantErrorsMap = {};

    if (!String(form.name || '').trim()) {
      errors.name = 'Product name is required.';
    }
    const slug = String(form.slug || '').trim().toLowerCase();
    if (!slug) {
      errors.slug = 'Slug is required.';
    } else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      errors.slug = 'Slug must be lowercase letters, digits and single dashes.';
    }
    if (!String(form.description || '').trim()) {
      errors.description = 'Description is required.';
    }
    if (!form.category) {
      errors.category = 'Category is required.';
    }

    const price = Number(form.price);
    if (form.price === '' || form.price === null || form.price === undefined) {
      errors.price = 'Price is required.';
    } else if (!Number.isFinite(price) || price < 0) {
      errors.price = 'Price must be a number of 0 or more.';
    }

    if (form.discountPrice !== '' && form.discountPrice !== null && form.discountPrice !== undefined) {
      const discountPrice = Number(form.discountPrice);
      if (!Number.isFinite(discountPrice) || discountPrice < 0) {
        errors.discountPrice = 'Discount price must be a number of 0 or more.';
      } else if (Number.isFinite(price) && discountPrice > price) {
        errors.discountPrice = 'Discount price cannot exceed the price.';
      }
    }

    if (form.stock !== '' && form.stock !== null && form.stock !== undefined) {
      const stock = Number(form.stock);
      if (!Number.isInteger(stock) || stock < 0) {
        errors.stock = 'Stock must be a whole number of 0 or more.';
      }
    }

    if (form.images.length > MAX_PRODUCT_IMAGES) {
      errors.images = `A product cannot have more than ${MAX_PRODUCT_IMAGES} images.`;
    }

    const seenSkus = new Set();
    const seenCombinations = new Set();
    form.variants.forEach((variant, index) => {
      const variantError = {};
      if (!String(variant.color || '').trim()) {
        variantError.color = 'Color is required.';
      }
      if (!String(variant.size || '').trim()) {
        variantError.size = 'Size is required.';
      }
      const sku = String(variant.sku || '').trim();
      if (!sku) {
        variantError.sku = 'SKU is required.';
      } else if (seenSkus.has(sku)) {
        variantError.sku = 'Duplicate variant SKU.';
      }
      seenSkus.add(sku);

      const combination = `${String(variant.color || '').trim().toLowerCase()}|${String(variant.size || '').trim().toLowerCase()}`;
      if (seenCombinations.has(combination)) {
        variantError.combination = 'Duplicate color + size combination.';
      }
      seenCombinations.add(combination);

      const variantPrice = Number(variant.price);
      if (variant.price !== '' && variant.price !== null && variant.price !== undefined && !Number.isFinite(variantPrice)) {
        variantError.price = 'Price must be a number.';
      } else if (variant.price !== '' && variant.price !== null && variant.price !== undefined && variantPrice < 0) {
        variantError.price = 'Price cannot be negative.';
      }

      const variantDiscountPrice = Number(variant.discountPrice);
      if (variant.discountPrice !== '' && variant.discountPrice !== null && variant.discountPrice !== undefined) {
        if (!Number.isFinite(variantDiscountPrice) || variantDiscountPrice < 0) {
          variantError.discountPrice = 'Discount price cannot be negative.';
        } else if (variant.price !== '' && variant.price !== null && variant.price !== undefined && variantDiscountPrice > variantPrice) {
          variantError.discountPrice = 'Discount price cannot exceed price.';
        }
      }

      const variantStock = Number(variant.stock);
      if (variant.stock !== '' && variant.stock !== null && variant.stock !== undefined && (!Number.isInteger(variantStock) || variantStock < 0)) {
        variantError.stock = 'Stock must be a whole number of 0 or more.';
      }

      if (Object.keys(variantError).length > 0) {
        variantErrorsMap[index] = variantError;
      }
    });

    return { errors, variantErrorsMap };
  }, [form]);

  const handleSubmit = useCallback(
    async (e) => {
      e.preventDefault();
      setApiError(null);

      const { errors, variantErrorsMap } = validate();
      setFieldErrors(errors);
      setVariantErrors(variantErrorsMap);
      if (Object.keys(errors).length > 0 || Object.keys(variantErrorsMap).length > 0) {
        return;
      }

      const payload = {
        name: String(form.name || '').trim(),
        slug: String(form.slug || '').trim().toLowerCase(),
        description: String(form.description || '').trim(),
        category: form.category,
        brand: String(form.brand || '').trim(),
        price: Number(form.price),
        discountPrice:
          form.discountPrice === '' || form.discountPrice === null
            ? null
            : Number(form.discountPrice),
        sku: String(form.sku || '').trim() || null,
        stock: form.stock === '' || form.stock === null ? 0 : Number(form.stock),
        colors: String(form.colors || '')
          .split(',')
          .map((c) => c.trim())
          .filter(Boolean),
        sizes: String(form.sizes || '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        tags: String(form.tags || '')
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        images: form.images.map((image, index) => ({
          url: image.url,
          publicId: image.publicId || undefined,
          alt: image.alt || undefined,
          position: index,
          isPrimary: index === 0,
        })),
        variants: form.variants.map((variant) => ({
          ...(variant._id ? { _id: variant._id } : {}),
          color: String(variant.color || '').trim(),
          size: String(variant.size || '').trim(),
          sku: String(variant.sku || '').trim(),
          price:
            variant.price === '' || variant.price === null ? null : Number(variant.price),
          discountPrice:
            variant.discountPrice === '' || variant.discountPrice === null
              ? null
              : Number(variant.discountPrice),
          stock:
            variant.stock === '' || variant.stock === null ? 0 : Number(variant.stock),
          images: variant.images || [],
        })),
        isFeatured: form.isFeatured === true,
        isNew: form.isNew === true,
        isBestSeller: form.isBestSeller === true,
        isActive: form.isActive !== false,
      };

      setIsSubmitting(true);
      try {
        await onSubmit(payload);
      } catch (err) {
        const message = err.apiMessage || err.message || '';
        if (/slug already exists/i.test(message)) {
          setApiError('This slug is already used by another product.');
          setFieldErrors((prev) => ({ ...prev, slug: 'This slug is already in use.' }));
        } else if (/SKU already exists/i.test(message)) {
          setApiError('This SKU is already used by another product.');
        } else {
          setApiError(message || 'Unable to save the product. Please try again.');
        }
      } finally {
        setIsSubmitting(false);
      }
    },
    [form, validate, onSubmit]
  );

  const renderFieldError = (field) =>
    fieldErrors[field] ? (
      <p className="product-form__field-error" role="alert">
        {fieldErrors[field]}
      </p>
    ) : null;

  return (
    <form className="product-form" onSubmit={handleSubmit} noValidate>
      <div className="product-form__section">
        <h2 className="product-form__section-title">Basics</h2>

        <div className="product-form__row">
          <label className="product-form__label" htmlFor="product-name">
            Name <span className="product-form__required">*</span>
          </label>
          <input
            id="product-name"
            className="product-form__input"
            type="text"
            value={form.name}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="e.g. Classic Linen Shirt"
          />
          {renderFieldError('name')}
        </div>

        <div className="product-form__row">
          <label className="product-form__label" htmlFor="product-slug">
            Slug <span className="product-form__required">*</span>
          </label>
          <input
            id="product-slug"
            className="product-form__input"
            type="text"
            value={form.slug}
            onChange={(e) => {
              setSlugTouched(true);
              setField('slug', e.target.value.toLowerCase());
            }}
            placeholder="e.g. classic-linen-shirt"
            autoComplete="off"
          />
          <span className="product-form__hint">
            Auto-generated from the name. Editable; must be unique.
          </span>
          {renderFieldError('slug')}
        </div>

        <div className="product-form__row">
          <label className="product-form__label" htmlFor="product-description">
            Description <span className="product-form__required">*</span>
          </label>
          <textarea
            id="product-description"
            className="product-form__input product-form__textarea"
            rows={4}
            value={form.description}
            onChange={(e) => setField('description', e.target.value)}
          />
          {renderFieldError('description')}
        </div>

        <div className="product-form__grid">
          <div className="product-form__row">
            <label className="product-form__label" htmlFor="product-category">
              Category <span className="product-form__required">*</span>
            </label>
            <select
              id="product-category"
              className="product-form__input"
              value={form.category}
              onChange={(e) => setField('category', e.target.value)}
              disabled={categoriesLoading}
            >
              <option value="">{categoriesLoading ? 'Loading categories…' : 'Select a category'}</option>
              {categories.map((category) => (
                <option key={category._id} value={category._id}>
                  {category.name}
                </option>
              ))}
            </select>
            {renderFieldError('category')}
          </div>

          <div className="product-form__row">
            <label className="product-form__label" htmlFor="product-brand">
              Brand
            </label>
            <input
              id="product-brand"
              className="product-form__input"
              type="text"
              value={form.brand}
              onChange={(e) => setField('brand', e.target.value)}
              placeholder="e.g. DEER"
            />
          </div>
        </div>
      </div>

      <div className="product-form__section">
        <h2 className="product-form__section-title">Pricing &amp; inventory</h2>

        <div className="product-form__grid">
          <div className="product-form__row">
            <label className="product-form__label" htmlFor="product-price">
              Price <span className="product-form__required">*</span>
            </label>
            <input
              id="product-price"
              className="product-form__input"
              type="number"
              min="0"
              step="any"
              value={form.price}
              onChange={(e) => setField('price', e.target.value)}
              placeholder="e.g. 1999"
            />
            {renderFieldError('price')}
          </div>

          <div className="product-form__row">
            <label className="product-form__label" htmlFor="product-discount-price">
              Discount price
            </label>
            <input
              id="product-discount-price"
              className="product-form__input"
              type="number"
              min="0"
              step="any"
              value={form.discountPrice}
              onChange={(e) => setField('discountPrice', e.target.value)}
              placeholder="Leave empty for no discount"
            />
            {renderFieldError('discountPrice')}
          </div>

          <div className="product-form__row">
            <label className="product-form__label" htmlFor="product-sku">
              SKU
            </label>
            <input
              id="product-sku"
              className="product-form__input"
              type="text"
              value={form.sku}
              onChange={(e) => setField('sku', e.target.value)}
              placeholder="e.g. DEER-LS-001"
            />
          </div>

          <div className="product-form__row">
            <label className="product-form__label" htmlFor="product-stock">
              Stock
            </label>
            <input
              id="product-stock"
              className="product-form__input"
              type="number"
              min="0"
              step="1"
              value={form.stock}
              onChange={(e) => setField('stock', e.target.value)}
              placeholder="0"
            />
            {renderFieldError('stock')}
          </div>
        </div>
      </div>

      <div className="product-form__section">
        <h2 className="product-form__section-title">Details</h2>

        <div className="product-form__grid">
          <div className="product-form__row">
            <label className="product-form__label" htmlFor="product-colors">
              Colors
            </label>
            <input
              id="product-colors"
              className="product-form__input"
              type="text"
              value={form.colors}
              onChange={(e) => setField('colors', e.target.value)}
              placeholder="e.g. Black, White, Beige"
            />
            <span className="product-form__hint">Comma-separated.</span>
          </div>

          <div className="product-form__row">
            <label className="product-form__label" htmlFor="product-sizes">
              Sizes
            </label>
            <input
              id="product-sizes"
              className="product-form__input"
              type="text"
              value={form.sizes}
              onChange={(e) => setField('sizes', e.target.value)}
              placeholder="e.g. S, M, L, XL"
            />
            <span className="product-form__hint">Comma-separated.</span>
          </div>

          <div className="product-form__row">
            <label className="product-form__label" htmlFor="product-tags">
              Tags
            </label>
            <input
              id="product-tags"
              className="product-form__input"
              type="text"
              value={form.tags}
              onChange={(e) => setField('tags', e.target.value)}
              placeholder="e.g. linen, summer, new-arrival"
            />
            <span className="product-form__hint">Comma-separated.</span>
          </div>
        </div>

        <div className="product-form__checkboxes">
          <label className="product-form__checkbox-label">
            <input
              type="checkbox"
              checked={form.isFeatured}
              onChange={(e) => setField('isFeatured', e.target.checked)}
            />
            Featured
          </label>
          <label className="product-form__checkbox-label">
            <input
              type="checkbox"
              checked={form.isNew}
              onChange={(e) => setField('isNew', e.target.checked)}
            />
            New arrival
          </label>
          <label className="product-form__checkbox-label">
            <input
              type="checkbox"
              checked={form.isBestSeller}
              onChange={(e) => setField('isBestSeller', e.target.checked)}
            />
            Best seller
          </label>
          <label className="product-form__checkbox-label">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setField('isActive', e.target.checked)}
            />
            Active
          </label>
        </div>
      </div>

      <div className="product-form__section">
        <h2 className="product-form__section-title">
          Images <span className="product-form__section-count">({form.images.length}/{MAX_PRODUCT_IMAGES})</span>
        </h2>
        <p className="product-form__section-note">
          The first image is the primary image shown in the catalog. JPEG, PNG
          and WebP, up to 5 MB each.
        </p>

        <div className="product-form__images">
          {form.images.map((image, index) => (
            <div
              key={`${image.publicId || image.url}-${index}`}
              className={`product-form__image ${index === 0 ? 'product-form__image--primary' : ''}`}
            >
              <img
                src={image.url}
                alt={image.alt || `Product image ${index + 1}`}
                className="product-form__image-img"
              />
              {index === 0 && (
                <span className="product-form__image-primary-label">Primary</span>
              )}
              <button
                type="button"
                className="product-form__image-remove"
                onClick={() => removeImage(index)}
                aria-label={`Remove image ${index + 1}`}
              >
                ×
              </button>
            </div>
          ))}
        </div>

        {form.images.length === 0 && (
          <p className="product-form__hint">No images yet.</p>
        )}

        <div className="product-form__upload-row">
          <label className="product-form__upload-btn">
            {isUploading ? 'Uploading…' : 'Upload image'}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFileSelect}
              disabled={isUploading || form.images.length >= MAX_PRODUCT_IMAGES}
              aria-label="Upload a product image"
            />
          </label>
        </div>

        {uploadError && (
          <p className="product-form__field-error" role="alert">
            {uploadError}
          </p>
        )}
        {renderFieldError('images')}
      </div>

      <div className="product-form__section">
        <h2 className="product-form__section-title">
          Variants <span className="product-form__section-count">({form.variants.length})</span>
        </h2>
        <p className="product-form__section-note">
          Optional color + size combinations with their own SKU, pricing and
          stock. Each color/size pair and SKU must be unique. Variant images
          are not editable here and are preserved when saving.
        </p>

        {form.variants.length === 0 && (
          <p className="product-form__hint">No variants. Add one below if needed.</p>
        )}

        {form.variants.map((variant, index) => {
          const variantError = variantErrors[index] || {};
          return (
            <fieldset key={index} className="product-form__variant">
              <legend className="product-form__variant-title">
                Variant {index + 1}
              </legend>
              <div className="product-form__variant-grid">
                <div className="product-form__row">
                  <label className="product-form__label" htmlFor={`variant-${index}-color`}>
                    Color <span className="product-form__required">*</span>
                  </label>
                  <input
                    id={`variant-${index}-color`}
                    className="product-form__input"
                    type="text"
                    value={variant.color}
                    onChange={(e) => setVariantField(index, 'color', e.target.value)}
                  />
                  {variantError.color && (
                    <p className="product-form__field-error" role="alert">{variantError.color}</p>
                  )}
                </div>
                <div className="product-form__row">
                  <label className="product-form__label" htmlFor={`variant-${index}-size`}>
                    Size <span className="product-form__required">*</span>
                  </label>
                  <input
                    id={`variant-${index}-size`}
                    className="product-form__input"
                    type="text"
                    value={variant.size}
                    onChange={(e) => setVariantField(index, 'size', e.target.value)}
                  />
                  {variantError.size && (
                    <p className="product-form__field-error" role="alert">{variantError.size}</p>
                  )}
                </div>
                <div className="product-form__row">
                  <label className="product-form__label" htmlFor={`variant-${index}-sku`}>
                    SKU <span className="product-form__required">*</span>
                  </label>
                  <input
                    id={`variant-${index}-sku`}
                    className="product-form__input"
                    type="text"
                    value={variant.sku}
                    onChange={(e) => setVariantField(index, 'sku', e.target.value)}
                  />
                  {variantError.sku && (
                    <p className="product-form__field-error" role="alert">{variantError.sku}</p>
                  )}
                </div>
                <div className="product-form__row">
                  <label className="product-form__label" htmlFor={`variant-${index}-price`}>
                    Price
                  </label>
                  <input
                    id={`variant-${index}-price`}
                    className="product-form__input"
                    type="number"
                    min="0"
                    step="any"
                    value={variant.price}
                    onChange={(e) => setVariantField(index, 'price', e.target.value)}
                  />
                  {variantError.price && (
                    <p className="product-form__field-error" role="alert">{variantError.price}</p>
                  )}
                </div>
                <div className="product-form__row">
                  <label className="product-form__label" htmlFor={`variant-${index}-discount`}>
                    Discount price
                  </label>
                  <input
                    id={`variant-${index}-discount`}
                    className="product-form__input"
                    type="number"
                    min="0"
                    step="any"
                    value={variant.discountPrice}
                    onChange={(e) => setVariantField(index, 'discountPrice', e.target.value)}
                  />
                  {variantError.discountPrice && (
                    <p className="product-form__field-error" role="alert">{variantError.discountPrice}</p>
                  )}
                </div>
                <div className="product-form__row">
                  <label className="product-form__label" htmlFor={`variant-${index}-stock`}>
                    Stock
                  </label>
                  <input
                    id={`variant-${index}-stock`}
                    className="product-form__input"
                    type="number"
                    min="0"
                    step="1"
                    value={variant.stock}
                    onChange={(e) => setVariantField(index, 'stock', e.target.value)}
                  />
                  {variantError.stock && (
                    <p className="product-form__field-error" role="alert">{variantError.stock}</p>
                  )}
                </div>
              </div>
              {variantError.combination && (
                <p className="product-form__field-error" role="alert">
                  {variantError.combination}
                </p>
              )}
              <button
                type="button"
                className="product-form__small-btn"
                onClick={() => removeVariant(index)}
                aria-label={`Remove variant ${index + 1}`}
              >
                Remove variant
              </button>
            </fieldset>
          );
        })}

        <button type="button" className="product-form__add-variant" onClick={addVariant}>
          + Add variant
        </button>
      </div>

      {apiError && (
        <div className="product-form__api-error" role="alert">
          {apiError}
        </div>
      )}

      <div className="product-form__actions">
        <button
          type="submit"
          className="product-form__submit"
          disabled={isSubmitting || isUploading}
        >
          {isSubmitting ? 'Saving…' : submitLabel}
        </button>
        <button
          type="button"
          className="product-form__cancel"
          onClick={onCancel}
          disabled={isSubmitting || isUploading}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export default ProductForm;