const mongoose = require('mongoose');
const Product = require('../models/Product');
const Category = require('../models/Category');
const AppError = require('../utils/AppError');
const { MAX_PRODUCT_IMAGES, MAX_VARIANT_IMAGES } = require('../config/constants');
const { calculateProductStock, getStockStatus } = require('../utils/inventory.util');

const SORT_MAP = {
  newest: { createdAt: -1 },
  price_asc: { price: 1 },
  price_desc: { price: -1 },
  rating: { rating: -1 },
  popular: { rating: -1, reviewCount: -1 },
};

const GENDERS = ['men', 'women', 'unisex'];
const STRING_ATTRIBUTES = [
  'gender',
  'pattern',
  'fit',
  'material',
  'collar',
  'sleeves',
  'deliveryTime',
];

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizeUniqueArray = (value) =>
  value
    .map((item) => String(item).trim())
    .filter(Boolean)
    .filter(
      (item, index, array) =>
        array.findIndex((other) => other.toLowerCase() === item.toLowerCase()) ===
        index
    );

const normalizeImage = (image, index) => {
  if (typeof image === 'string') {
    return { url: image, position: index };
  }
  return {
    url: image.url,
    publicId: image.publicId,
    alt: image.alt,
    position: image.position === undefined ? index : image.position,
    isPrimary: image.isPrimary === true,
  };
};

const validateProductData = (data) => {
  if (data.price !== undefined && data.price < 0) {
    throw new AppError('Price cannot be negative', 400);
  }
  if (data.discountPrice !== undefined && data.discountPrice < 0) {
    throw new AppError('Discount price cannot be negative', 400);
  }
  if (
    data.price !== undefined &&
    data.discountPrice !== undefined &&
    data.discountPrice > data.price
  ) {
    throw new AppError('Discount price cannot exceed price', 400);
  }
  if (data.stock !== undefined && data.stock < 0) {
    throw new AppError('Stock cannot be negative', 400);
  }

  for (const field of STRING_ATTRIBUTES) {
    if (data[field] !== undefined && typeof data[field] !== 'string') {
      throw new AppError(`${field} must be a string`, 400);
    }
  }

  if (
    data.gender !== undefined &&
    data.gender !== '' &&
    !GENDERS.includes(String(data.gender).toLowerCase())
  ) {
    throw new AppError('Gender must be one of: men, women, unisex', 400);
  }

  if (data.images !== undefined) {
    if (!Array.isArray(data.images)) {
      throw new AppError('Images must be an array', 400);
    }
    if (data.images.length > MAX_PRODUCT_IMAGES) {
      throw new AppError(
        `A product cannot have more than ${MAX_PRODUCT_IMAGES} images`,
        400
      );
    }
    for (const image of data.images) {
      if (typeof image === 'string') continue;
      if (!image?.url) {
        throw new AppError('Every image must have a url', 400);
      }
      if (image.position !== undefined && image.position < 0) {
        throw new AppError('Image position cannot be negative', 400);
      }
    }
  }

  if (data.variants !== undefined) {
    if (!Array.isArray(data.variants)) {
      throw new AppError('Variants must be an array', 400);
    }
    const seenSkus = new Set();
    const seenCombinations = new Set();

    for (const variant of data.variants) {
      if (!variant.color || !variant.size || !variant.sku) {
        throw new AppError(
          'Every variant must have color, size and sku',
          400
        );
      }
      const sku = variant.sku.trim();
      if (seenSkus.has(sku)) {
        throw new AppError(`Duplicate variant SKU: ${sku}`, 400);
      }
      seenSkus.add(sku);

      const combination = `${variant.color.trim().toLowerCase()}|${variant.size
        .trim()
        .toLowerCase()}`;
      if (seenCombinations.has(combination)) {
        throw new AppError(
          'Duplicate variant combination (same color and size)',
          400
        );
      }
      seenCombinations.add(combination);

      if (variant.price !== undefined && variant.price < 0) {
        throw new AppError('Variant price cannot be negative', 400);
      }
      if (variant.discountPrice !== undefined && variant.discountPrice < 0) {
        throw new AppError('Variant discount price cannot be negative', 400);
      }
      if (
        variant.price !== undefined &&
        variant.discountPrice !== undefined &&
        variant.discountPrice > variant.price
      ) {
        throw new AppError('Variant discount price cannot exceed price', 400);
      }
      if (variant.stock !== undefined && variant.stock < 0) {
        throw new AppError('Variant stock cannot be negative', 400);
      }
      if (variant.images !== undefined) {
        if (!Array.isArray(variant.images)) {
          throw new AppError('Variant images must be an array', 400);
        }
        if (variant.images.length > MAX_VARIANT_IMAGES) {
          throw new AppError(
            `A variant cannot have more than ${MAX_VARIANT_IMAGES} images`,
            400
          );
        }
        for (const image of variant.images) {
          if (typeof image === 'string') continue;
          if (!image?.url) {
            throw new AppError('Every variant image must have a url', 400);
          }
        }
      }
    }
  }
};

const normalizeProductData = (data) => {
  if (Array.isArray(data.images)) {
    data.images = data.images.map(normalizeImage);
  }
  if (Array.isArray(data.colors)) {
    data.colors = normalizeUniqueArray(data.colors);
  }
  if (Array.isArray(data.sizes)) {
    data.sizes = normalizeUniqueArray(data.sizes);
  }
  if (Array.isArray(data.tags)) {
    data.tags = normalizeUniqueArray(data.tags);
  }
  for (const field of STRING_ATTRIBUTES) {
    if (typeof data[field] === 'string') {
      data[field] = data[field].trim() || undefined;
    }
  }
  if (typeof data.gender === 'string' && data.gender) {
    data.gender = data.gender.toLowerCase();
  }
  if (Array.isArray(data.variants)) {
    data.variants = data.variants.map((variant) => ({
      ...variant,
      color: variant.color.trim(),
      size: variant.size.trim(),
      sku: variant.sku.trim(),
      images: Array.isArray(variant.images)
        ? variant.images.map(normalizeImage)
        : [],
    }));
  }
  return data;
};

const resolveCategory = async (value) => {
  if (mongoose.isValidObjectId(value)) {
    const category = await Category.findOne({ _id: value, isActive: true })
      .select('_id')
      .lean();
    if (!category) {
      throw new AppError('Category not found or inactive', 400);
    }
    return category._id;
  }

  const category = await Category.findOne({ slug: value, isActive: true })
    .select('_id')
    .lean();
  if (!category) {
    throw new AppError('Category not found or inactive', 400);
  }
  return category._id;
};

const resolveCategoryOptional = async (value) => {
  try {
    return await resolveCategory(value);
  } catch (error) {
    if (error.status === 400) return null;
    throw error;
  }
};

const handleDuplicateKey = (error) => {
  if (error.code !== 11000) return null;
  if (error.keyPattern?.slug) {
    return new AppError('Product slug already exists', 409);
  }
  if (error.keyPattern?.sku) {
    return new AppError('Product SKU already exists', 409);
  }
  return new AppError('Duplicate value provided', 409);
};

const serializeListProduct = (product) => {
  const images = product.images || [];
  const primary =
    images.find((image) => image.isPrimary) || images[0] || null;
  const stock = calculateProductStock(product);

  return {
    id: product._id,
    name: product.name,
    slug: product.slug,
    price: product.price,
    discountPrice: product.discountPrice ?? null,
    image: primary
      ? { url: primary.url, alt: primary.alt ?? null, isPrimary: true }
      : null,
    colors: product.colors,
    sizes: product.sizes,
    rating: product.rating,
    reviewCount: product.reviewCount,
    stockStatus: getStockStatus(stock),
    isFeatured: product.isFeatured,
    isNew: product.isNew,
    isBestSeller: product.isBestSeller,
  };
};

const serializeDetailProduct = (product) => ({
  id: product._id,
  name: product.name,
  slug: product.slug,
  description: product.description,
  brand: product.brand,
  gender: product.gender ?? 'men',
  pattern: product.pattern ?? null,
  fit: product.fit ?? null,
  material: product.material ?? null,
  collar: product.collar ?? null,
  sleeves: product.sleeves ?? null,
  deliveryTime: product.deliveryTime ?? null,
  price: product.price,
  discountPrice: product.discountPrice ?? null,
  category: product.category,
  images: product.images,
  colors: product.colors,
  sizes: product.sizes,
  variants: product.variants,
  stock: calculateProductStock(product),
  stockStatus: getStockStatus(calculateProductStock(product)),
  sku: product.sku,
  tags: product.tags,
  rating: product.rating,
  reviewCount: product.reviewCount,
  isFeatured: product.isFeatured,
  isNew: product.isNew,
  isBestSeller: product.isBestSeller,
  isActive: product.isActive,
});

const create = async (data) => {
  const { name, slug, description, category, ...rest } = data;

  if (!name || !slug || !description || !category) {
    throw new AppError('Name, slug, description and category are required', 400);
  }

  validateProductData(data);
  normalizeProductData(rest);

  const categoryId = await resolveCategory(category);

  try {
    return await Product.create({
      ...rest,
      name: name.trim(),
      slug: slug.trim().toLowerCase(),
      description: description.trim(),
      category: categoryId,
    });
  } catch (error) {
    const duplicateError = handleDuplicateKey(error);
    if (duplicateError) throw duplicateError;
    throw error;
  }
};

const findAll = async (query = {}) => {
  const {
    page,
    limit,
    search,
    category,
    minPrice,
    maxPrice,
    size,
    color,
    brand,
    featured,
    new: isNew,
    bestSeller,
    sort,
  } = query;

  const filter = { isActive: true };
  const orConditions = [];

  if (search) {
    const regex = new RegExp(escapeRegex(search), 'i');
    orConditions.push(
      { name: regex },
      { description: regex },
      { brand: regex },
      { tags: regex }
    );
  }

  if (size) {
    const regex = new RegExp(`^${escapeRegex(size)}$`, 'i');
    orConditions.push({ sizes: regex }, { 'variants.size': regex });
  }

  if (color) {
    const regex = new RegExp(`^${escapeRegex(color)}$`, 'i');
    orConditions.push({ colors: regex }, { 'variants.color': regex });
  }

  const priceRange = {};
  if (minPrice !== undefined && minPrice !== '' && !Number.isNaN(Number(minPrice))) {
    priceRange.$gte = Number(minPrice);
  }
  if (maxPrice !== undefined && maxPrice !== '' && !Number.isNaN(Number(maxPrice))) {
    priceRange.$lte = Number(maxPrice);
  }
  if (Object.keys(priceRange).length > 0) {
    orConditions.push(
      { discountPrice: { $gt: 0, ...priceRange } },
      {
        $or: [
          { discountPrice: { $in: [null, 0] } },
          { discountPrice: { $exists: false } },
        ],
        price: priceRange,
      }
    );
  }

  if (orConditions.length > 0) {
    filter.$or = orConditions;
  }

  const sortBy = SORT_MAP[sort] || SORT_MAP.newest;

  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.min(
    Math.max(parseInt(limit, 10) || DEFAULT_LIMIT, 1),
    MAX_LIMIT
  );

  if (category) {
    const categoryId = await resolveCategoryOptional(category);
    if (!categoryId) {
      return {
        products: [],
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: 0,
          totalPages: 0,
          hasNextPage: false,
          hasPreviousPage: pageNum > 1,
        },
      };
    }
    filter.category = categoryId;
  }

  if (brand) {
    filter.brand = new RegExp(`^${escapeRegex(brand)}$`, 'i');
  }

  if (featured === 'true') filter.isFeatured = true;
  if (isNew === 'true') filter.isNew = true;
  if (bestSeller === 'true') filter.isBestSeller = true;

  const skip = (pageNum - 1) * limitNum;

  const total = await Product.countDocuments(filter);
  const products = await Product.find(filter)
    .select({
      name: 1,
      slug: 1,
      price: 1,
      discountPrice: 1,
      images: 1,
      colors: 1,
      sizes: 1,
      rating: 1,
      reviewCount: 1,
      isFeatured: 1,
      isNew: 1,
      isBestSeller: 1,
      'variants.stock': 1,
      stock: 1,
    })
    .sort(sortBy)
    .skip(skip)
    .limit(limitNum)
    .lean();

  const totalPages = total === 0 ? 0 : Math.ceil(total / limitNum);

  return {
    products: products.map(serializeListProduct),
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages,
      hasNextPage: pageNum < totalPages,
      hasPreviousPage: pageNum > 1,
    },
  };
};

const findBySlug = async (slug) => {
  const product = await Product.findOne({ slug, isActive: true }).populate('category').lean();
  if (!product) {
    throw new AppError('Product not found', 404);
  }
  return serializeDetailProduct(product);
};

const preserveVariantIds = (product, incomingVariants) => {
  const existingById = new Map(
    product.variants.map((variant) => [String(variant._id), variant])
  );
  const existingByKey = new Map(
    product.variants.map((variant) => [
      `${variant.color}|${variant.size}`.toLowerCase(),
      variant,
    ])
  );

  return incomingVariants.map((variant) => {
    const incoming = { ...variant };
    if (incoming._id && existingById.has(String(incoming._id))) return incoming;
    const match = existingByKey.get(
      `${incoming.color}|${incoming.size}`.toLowerCase()
    );
    if (match) incoming._id = match._id;
    return incoming;
  });
};

const update = async (id, data) => {
  if (!mongoose.isValidObjectId(id)) {
    throw new AppError('Invalid product id', 400);
  }

  const product = await Product.findById(id);
  if (!product) {
    throw new AppError('Product not found', 404);
  }

  validateProductData(data);
  normalizeProductData(data);
  if (Array.isArray(data.variants)) {
    data.variants = preserveVariantIds(product, data.variants);
  }

  const allowedFields = [
    'name',
    'slug',
    'description',
    'category',
    'brand',
    'gender',
    'pattern',
    'fit',
    'material',
    'collar',
    'sleeves',
    'deliveryTime',
    'price',
    'discountPrice',
    'images',
    'colors',
    'sizes',
    'variants',
    'stock',
    'sku',
    'tags',
    'isFeatured',
    'isNew',
    'isBestSeller',
    'isActive',
  ];

  for (const field of allowedFields) {
    if (data[field] !== undefined) {
      product[field] = data[field];
    }
  }
  if (data.name) product.name = data.name.trim();
  if (data.slug) product.slug = data.slug.trim().toLowerCase();
  if (data.description) product.description = data.description.trim();
  if (data.category) {
    product.category = await resolveCategory(data.category);
  }

  try {
    await product.save();
  } catch (error) {
    const duplicateError = handleDuplicateKey(error);
    if (duplicateError) throw duplicateError;
    throw error;
  }

  return serializeDetailProduct(product);
};

const deactivate = async (id) => {
  if (!mongoose.isValidObjectId(id)) {
    throw new AppError('Invalid product id', 400);
  }

  const product = await Product.findById(id);
  if (!product) {
    throw new AppError('Product not found', 404);
  }

  product.isActive = false;
  await product.save();
  return product;
};

// ---------------------------------------------------------------------------
// Admin-only product queries (admin dashboard / product management)
// ---------------------------------------------------------------------------

const serializeAdminProduct = (product) => {
  const images = product.images || [];
  const primary = images.find((image) => image.isPrimary) || images[0] || null;
  const stock = calculateProductStock(product);

  return {
    id: product._id,
    name: product.name,
    slug: product.slug,
    category: product.category
      ? { id: product.category._id, name: product.category.name, slug: product.category.slug }
      : null,
    brand: product.brand ?? null,
    price: product.price,
    discountPrice: product.discountPrice ?? null,
    image: primary
      ? { url: primary.url, alt: primary.alt ?? null, publicId: primary.publicId ?? null }
      : null,
    imagesCount: images.length,
    variantsCount: (product.variants || []).length,
    colors: product.colors,
    sizes: product.sizes,
    stock,
    stockStatus: getStockStatus(stock),
    rating: product.rating,
    reviewCount: product.reviewCount,
    isFeatured: product.isFeatured,
    isNew: product.isNew,
    isBestSeller: product.isBestSeller,
    isActive: product.isActive,
    sku: product.sku ?? null,
    createdAt: product.createdAt ?? product.updatedAt ?? null,
    updatedAt: product.updatedAt ?? null,
  };
};

const serializeAdminProductDetail = (product) => ({
  id: product._id,
  name: product.name,
  slug: product.slug,
  description: product.description,
  brand: product.brand ?? null,
  gender: product.gender ?? 'men',
  pattern: product.pattern ?? null,
  fit: product.fit ?? null,
  material: product.material ?? null,
  collar: product.collar ?? null,
  sleeves: product.sleeves ?? null,
  deliveryTime: product.deliveryTime ?? null,
  price: product.price,
  discountPrice: product.discountPrice ?? null,
  category: product.category
    ? { id: product.category._id, name: product.category.name, slug: product.category.slug }
    : product.category,
  images: product.images,
  colors: product.colors,
  sizes: product.sizes,
  variants: product.variants,
  stock: calculateProductStock(product),
  stockStatus: getStockStatus(calculateProductStock(product)),
  sku: product.sku ?? null,
  tags: product.tags,
  rating: product.rating,
  reviewCount: product.reviewCount,
  isFeatured: product.isFeatured,
  isNew: product.isNew,
  isBestSeller: product.isBestSeller,
  isActive: product.isActive,
  createdAt: product.createdAt ?? product.updatedAt ?? null,
  updatedAt: product.updatedAt ?? null,
});

// Admin list: ACTIVE and INACTIVE products, paginated, searchable, filterable
// by category and active state. Sorting reuses the public SORT_MAP.
const findAllForAdmin = async ({
  page = 1,
  limit = 20,
  search,
  category,
  isActive,
  sort,
} = {}) => {
  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.min(
    Math.max(parseInt(limit, 10) || 20, 1),
    MAX_LIMIT
  );

  const filter = {};
  const orConditions = [];

  if (search) {
    const regex = new RegExp(escapeRegex(search), 'i');
    orConditions.push(
      { name: regex },
      { description: regex },
      { brand: regex },
      { tags: regex }
    );
  }

  if (isActive === 'true') filter.isActive = true;
  else if (isActive === 'false') filter.isActive = false;

  if (category) {
    let categoryId = null;
    if (mongoose.isValidObjectId(category)) {
      categoryId = category;
    } else {
      const found = await Category.findOne({
        slug: String(category).toLowerCase(),
      })
        .select('_id')
        .lean();
      categoryId = found ? found._id : null;
    }
    if (!categoryId) {
      return {
        products: [],
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: 0,
          totalPages: 0,
          hasNextPage: false,
          hasPreviousPage: pageNum > 1,
        },
      };
    }
    filter.category = categoryId;
  }

  if (orConditions.length > 0) {
    filter.$or = orConditions;
  }

  const sortBy = SORT_MAP[sort] || SORT_MAP.newest;
  const skip = (pageNum - 1) * limitNum;

  const total = await Product.countDocuments(filter);
  const products = await Product.find(filter)
    .populate('category', 'name slug')
    .select({
      name: 1,
      slug: 1,
      brand: 1,
      price: 1,
      discountPrice: 1,
      images: 1,
      colors: 1,
      sizes: 1,
      stock: 1,
      'variants.stock': 1,
      'variants.color': 1,
      'variants.size': 1,
      rating: 1,
      reviewCount: 1,
      isFeatured: 1,
      isNew: 1,
      isBestSeller: 1,
      isActive: 1,
      sku: 1,
      createdAt: 1,
      updatedAt: 1,
    })
    .sort(sortBy)
    .skip(skip)
    .limit(limitNum)
    .lean();

  const totalPages = total === 0 ? 0 : Math.ceil(total / limitNum);

  return {
    products: products.map(serializeAdminProduct),
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages,
      hasNextPage: pageNum < totalPages,
      hasPreviousPage: pageNum > 1,
    },
  };
};

// Admin detail by ObjectId — returns ACTIVE or INACTIVE products, with
// variants, images and populated category for the future Edit Product page.
const findByIdForAdmin = async (id) => {
  if (!mongoose.isValidObjectId(id)) {
    throw new AppError('Invalid product id', 400);
  }

  const product = await Product.findById(id)
    .populate('category', 'name slug')
    .lean();
  if (!product) {
    throw new AppError('Product not found', 404);
  }

  return serializeAdminProductDetail(product);
};

module.exports = {
  create,
  findAll,
  findBySlug,
  update,
  deactivate,
  findAllForAdmin,
  findByIdForAdmin,
};