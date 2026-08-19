const mongoose = require('mongoose');
const Product = require('../models/Product');
const Category = require('../models/Category');
const AppError = require('../utils/AppError');
const { getEffectiveProductPrice, getEffectiveVariantPrice } = require('../utils/pricing.util');
const { calculateProductStock, getStockStatus } = require('../utils/inventory.util');

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;
const MAX_SEARCH_LENGTH = 100;

const SORT_MAP = {
  newest: { createdAt: -1, _id: -1 },
  price_asc: { price: 1, _id: 1 },
  price_desc: { price: -1, _id: -1 },
  name_asc: { name: 1, _id: 1 },
  name_desc: { name: -1, _id: -1 },
  rating_desc: { rating: -1, _id: -1 },
  discount_desc: { discountPrice: -1, _id: -1 },
  popular: { rating: -1, reviewCount: -1, _id: -1 },
};

const ALLOWED_SORTS = Object.keys(SORT_MAP);

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizeSearch = (search) => {
  if (!search || typeof search !== 'string') return null;
  const trimmed = search.trim().replace(/\s+/g, ' ');
  if (trimmed.length === 0) return null;
  if (trimmed.length > MAX_SEARCH_LENGTH) {
    throw new AppError(`Search query exceeds maximum length of ${MAX_SEARCH_LENGTH} characters`, 400);
  }
  return trimmed;
};

const parseCommaSeparated = (value) => {
  if (!value) return [];
  return String(value)
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)
    .map((v) => v.toLowerCase());
};

const parseBoolean = (value) => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
};

const parseNumber = (value, { min, max, name } = {}) => {
  if (value === undefined || value === '' || value === null) return undefined;
  const num = Number(value);
  if (Number.isNaN(num)) {
    throw new AppError(`${name || 'Value'} must be a valid number`, 400);
  }
  if (min !== undefined && num < min) {
    throw new AppError(`${name || 'Value'} must be at least ${min}`, 400);
  }
  if (max !== undefined && num > max) {
    throw new AppError(`${name || 'Value'} must be at most ${max}`, 400);
  }
  return num;
};

const parseIntPositive = (value, { max, name } = {}) => {
  if (value === undefined || value === '' || value === null) return undefined;
  const num = parseInt(value, 10);
  if (Number.isNaN(num) || num < 1) {
    throw new AppError(`${name || 'Value'} must be a positive integer`, 400);
  }
  if (max !== undefined && num > max) {
    throw new AppError(`${name || 'Value'} must be at most ${max}`, 400);
  }
  return num;
};

const buildTextSearch = (search) => {
  const terms = search.split(/\s+/).map((t) => escapeRegex(t));
  return terms.map((t) => `(?=.*${t})`).join('') + '.*';
};

const buildPriceRange = (minPrice, maxPrice) => {
  const range = {};
  if (minPrice !== undefined) range.$gte = minPrice;
  if (maxPrice !== undefined) range.$lte = maxPrice;
  return Object.keys(range).length > 0 ? range : null;
};

const buildEffectivePriceQuery = (priceRange) => {
  if (!priceRange) return null;

  return {
    $or: [
      { discountPrice: { $gt: 0, ...priceRange } },
      {
        $and: [
          { $or: [{ discountPrice: { $in: [null, 0] } }, { discountPrice: { $exists: false } }] },
          { price: priceRange },
        ],
      },
    ],
  };
};

const resolveCategorySlug = async (slug) => {
  const category = await Category.findOne({ slug: slug.toLowerCase(), isActive: true }).select('_id').lean();
  if (!category) {
    throw new AppError(`Category not found: ${slug}`, 404);
  }
  return category._id;
};

// Exact-match (case-insensitive) filter for a scalar string attribute such as
// brand, gender, pattern, fit, material, collar, sleeves or deliveryTime.
const buildScalarFieldQuery = (field, values) => {
  if (!values || values.length === 0) return null;
  return {
    [field]: { $in: values.map((value) => new RegExp(`^${escapeRegex(value)}$`, 'i')) },
  };
};

const buildFilterQuery = async (parsed) => {
  const filter = { isActive: true };
  const orConditions = [];

  if (parsed.search) {
    const searchRegex = buildTextSearch(parsed.search);
    const regex = new RegExp(searchRegex, 'i');
    orConditions.push(
      { name: regex },
      { description: regex },
      { brand: regex },
      { tags: regex }
    );
  }

  if (parsed.categorySlugs && parsed.categorySlugs.length > 0) {
    const categoryIds = [];
    for (const slug of parsed.categorySlugs) {
      try {
        const catId = await resolveCategorySlug(slug);
        categoryIds.push(catId);
      } catch (e) {
        return { filter: null, earlyReturn: { products: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false } } };
      }
    }
    filter.category = { $in: categoryIds };
  }

  const scalarFilters = [
    ['brand', parsed.brand],
    ['gender', parsed.gender],
    ['pattern', parsed.pattern],
    ['fit', parsed.fit],
    ['material', parsed.material],
    ['collar', parsed.collar],
    ['sleeves', parsed.sleeves],
    ['deliveryTime', parsed.deliveryTime],
  ];
  for (const [field, values] of scalarFilters) {
    const scalarQuery = buildScalarFieldQuery(field, values);
    if (scalarQuery) Object.assign(filter, scalarQuery);
  }

  if (parsed.minDiscount !== undefined) {
    filter.$expr = {
      $gte: [
        {
          $cond: [
            { $and: [{ $gt: ['$discountPrice', 0] }, { $lte: ['$discountPrice', '$price'] }] },
            { $multiply: [{ $subtract: ['$price', '$discountPrice'] }, 100, { $divide: [1, '$price'] }] },
            0,
          ],
        },
        parsed.minDiscount,
      ],
    };
  }

  if (parsed.minRating !== undefined) {
    filter.rating = { $gte: parsed.minRating };
  }

  const priceRange = buildPriceRange(parsed.minPrice, parsed.maxPrice);
  if (priceRange) {
    orConditions.push(buildEffectivePriceQuery(priceRange));
  }

  if (parsed.size && parsed.size.length > 0) {
    const sizeRegex = parsed.size.map((s) => new RegExp(`^${escapeRegex(s)}$`, 'i'));
    orConditions.push(
      { sizes: { $in: sizeRegex } },
      { 'variants.size': { $in: sizeRegex } }
    );
  }

  if (parsed.color && parsed.color.length > 0) {
    const colorRegex = parsed.color.map((c) => new RegExp(`^${escapeRegex(c)}$`, 'i'));
    orConditions.push(
      { colors: { $in: colorRegex } },
      { 'variants.color': { $in: colorRegex } }
    );
  }

  if (parsed.inStock === true) {
    orConditions.push(
      { $or: [{ stock: { $gt: 0 } }, { 'variants.stock': { $gt: 0 } }] }
    );
  } else if (parsed.inStock === false) {
    orConditions.push(
      { $and: [{ $or: [{ stock: { $lte: 0 } }, { stock: { $exists: false } }] }, { 'variants.stock': { $lte: 0 } }] }
    );
  }

  if (orConditions.length > 0) {
    filter.$or = orConditions;
  }

  return { filter };
};

const getSort = (sort) => {
  if (!sort) return SORT_MAP.newest;
  if (!ALLOWED_SORTS.includes(sort)) {
    throw new AppError(`Invalid sort option. Allowed: ${ALLOWED_SORTS.join(', ')}`, 400);
  }
  return SORT_MAP[sort];
};

const serializeProduct = (product) => {
  const images = product.images || [];
  const primary = images.find((img) => img.isPrimary) || images[0] || null;
  const stock = product.variants?.length > 0
    ? product.variants.reduce((sum, v) => sum + (Number(v.stock) || 0), 0)
    : Number(product.stock) || 0;

  return {
    id: product._id,
    name: product.name,
    slug: product.slug,
    price: product.price,
    discountPrice: product.discountPrice ?? null,
    image: product.images?.[0] ? { url: product.images[0].url, alt: product.images[0].alt ?? null } : null,
    images: product.images
      ? product.images.slice(0, 2).map((img) => ({ url: img.url, alt: img.alt }))
      : [],
    colors: product.colors || [],
    sizes: product.sizes || [],
    rating: product.rating,
    reviewCount: product.reviewCount,
    stockStatus: stock > 0 ? 'in_stock' : 'out_of_stock',
    isFeatured: product.isFeatured,
    isNew: product.isNew,
    isBestSeller: product.isBestSeller,
  };
};

const searchProducts = async (query) => {
  const parsed = {
    search: normalizeSearch(query.search),
    categorySlugs: parseCommaSeparated(query.category),
    minPrice: parseNumber(query.minPrice, { min: 0, max: 1000000, name: 'minPrice' }),
    maxPrice: parseNumber(query.maxPrice, { min: 0, max: 1000000, name: 'maxPrice' }),
    size: parseCommaSeparated(query.size),
    color: parseCommaSeparated(query.color),
    brand: parseCommaSeparated(query.brand),
    gender: parseCommaSeparated(query.gender),
    pattern: parseCommaSeparated(query.pattern),
    fit: parseCommaSeparated(query.fit),
    material: parseCommaSeparated(query.material),
    collar: parseCommaSeparated(query.collar),
    sleeves: parseCommaSeparated(query.sleeves),
    deliveryTime: parseCommaSeparated(query.deliveryTime),
    minDiscount: parseNumber(query.minDiscount, { min: 0, max: 100, name: 'minDiscount' }),
    minRating: parseNumber(query.minRating, { min: 0, max: 5, name: 'minRating' }),
    inStock: parseBoolean(query.inStock),
    sort: query.sort,
    page: parseIntPositive(query.page, { max: 10000, name: 'page' }) || 1,
    limit: parseIntPositive(query.limit, { max: MAX_LIMIT, name: 'limit' }) || DEFAULT_LIMIT,
  };

  if (parsed.minPrice !== undefined && parsed.maxPrice !== undefined && parsed.minPrice > parsed.maxPrice) {
    throw new AppError('minPrice cannot be greater than maxPrice', 400);
  }

  const { filter, earlyReturn } = await buildFilterQuery(parsed);
  if (earlyReturn) return earlyReturn;

  const sortBy = getSort(parsed.sort);

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
    .skip((parsed.page - 1) * parsed.limit)
    .limit(parsed.limit)
    .lean();

  const totalPages = total === 0 ? 0 : Math.ceil(total / parsed.limit);

  return {
    products: products.map(serializeProduct),
    pagination: {
      page: parsed.page,
      limit: parsed.limit,
      total,
      totalPages,
      hasNextPage: parsed.page < totalPages,
      hasPreviousPage: parsed.page > 1,
    },
  };
};

// ---------------------------------------------------------------------------
// Filter metadata — category-scoped, computed via a single $facet aggregation.
// ---------------------------------------------------------------------------

// Collect values from a product array field AND the matching variant field,
// e.g. sizes + variants[].size, colors + variants[].color.
const combinedArrayFacet = (arrayField, variantField) => [
  {
    $project: {
      all: {
        $concatArrays: [
          { $ifNull: [`$${arrayField}`, []] },
          {
            $map: {
              input: { $ifNull: ['$variants', []] },
              as: 'v',
              in: `$$v.${variantField}`,
            },
          },
        ],
      },
    },
  },
  { $unwind: '$all' },
  { $match: { all: { $ne: null } } },
  { $group: { _id: null, values: { $addToSet: '$all' } } },
];

// Distinct non-null values of a scalar string attribute.
const scalarFacet = (field) => [
  { $match: { [field]: { $ne: null } } },
  { $group: { _id: null, values: { $addToSet: `$${field}` } } },
];

// min/max over the effective price (discountPrice when valid, else price).
const priceFacet = () => [
  {
    $project: {
      effectivePrice: {
        $cond: [
          {
            $and: [
              { $gt: ['$discountPrice', 0] },
              { $lte: ['$discountPrice', '$price'] },
            ],
          },
          '$discountPrice',
          '$price',
        ],
      },
    },
  },
  {
    $group: {
      _id: null,
      min: { $min: '$effectivePrice' },
      max: { $max: '$effectivePrice' },
    },
  },
];

const getProductFilters = async (query = {}) => {
  const categorySlugs = parseCommaSeparated(query.category);
  const categoryIds = [];
  for (const slug of categorySlugs) {
    const category = await Category.findOne({
      slug: slug.toLowerCase(),
      isActive: true,
    })
      .select('_id')
      .lean();
    if (category) categoryIds.push(category._id);
  }

  const match = { isActive: true };
  if (categoryIds.length > 0) {
    match.category = { $in: categoryIds };
  }

  const pipeline = [
    { $match: match },
    {
      $facet: {
        sizes: combinedArrayFacet('sizes', 'size'),
        colors: combinedArrayFacet('colors', 'color'),
        brands: scalarFacet('brand'),
        genders: scalarFacet('gender'),
        patterns: scalarFacet('pattern'),
        fits: scalarFacet('fit'),
        materials: scalarFacet('material'),
        collars: scalarFacet('collar'),
        sleeves: scalarFacet('sleeves'),
        deliveryTimes: scalarFacet('deliveryTime'),
        price: priceFacet(),
      },
    },
  ];

  const [result] = await Product.aggregate(pipeline);

  const pickValues = (bucket) =>
    bucket && bucket[0] && Array.isArray(bucket[0].values) ? bucket[0].values : [];
  const sortValues = (values) =>
    Array.from(values).sort((a, b) => String(a).localeCompare(String(b), 'en'));

  const categories = await Category.find({ isActive: true })
    .select('_id name slug')
    .lean();

  const scopedCategory =
    categoryIds.length === 1
      ? categories.find((category) => String(category._id) === String(categoryIds[0])) || null
      : null;

  return {
    category: scopedCategory
      ? { id: scopedCategory._id, name: scopedCategory.name, slug: scopedCategory.slug }
      : null,
    categories: categories.map((category) => ({
      id: category._id,
      name: category.name,
      slug: category.slug,
    })),
    genders: sortValues(pickValues(result.genders)),
    sizes: sortValues(pickValues(result.sizes)),
    colors: sortValues(pickValues(result.colors)),
    brands: sortValues(pickValues(result.brands)),
    patterns: sortValues(pickValues(result.patterns)),
    fits: sortValues(pickValues(result.fits)),
    materials: sortValues(pickValues(result.materials)),
    collars: sortValues(pickValues(result.collars)),
    sleeves: sortValues(pickValues(result.sleeves)),
    deliveryTime: sortValues(pickValues(result.deliveryTimes)),
    price: (result.price && result.price[0]) || { min: 0, max: 0 },
  };
};

module.exports = {
  searchProducts,
  getProductFilters,
  parseCommaSeparated,
  normalizeSearch,
  escapeRegex,
  ALLOWED_SORTS,
  SORT_MAP,
  MAX_LIMIT,
  DEFAULT_LIMIT,
};