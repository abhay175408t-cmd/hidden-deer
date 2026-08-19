// Shared helpers for building the /api/products query string from the
// category listing filter state. Single source of truth so the plain and the
// infinite-scroll hooks (and the category page) never drift apart.

export const FILTER_KEYS = [
  'color',
  'size',
  'brand',
  'pattern',
  'fit',
  'material',
  'collar',
  'sleeves',
  'deliveryTime',
];

export const SORT_OPTIONS = [
  'newest',
  'popular',
  'price_asc',
  'price_desc',
  'rating_desc',
  'name_asc',
  'name_desc',
  'discount_desc',
];

export const EMPTY_FILTERS = {
  color: [],
  size: [],
  brand: [],
  pattern: [],
  fit: [],
  material: [],
  collar: [],
  sleeves: [],
  deliveryTime: [],
  minPrice: null,
  maxPrice: null,
  inStock: null,
};

export function isDefaultFilters(filters) {
  if (!filters) return true;
  if (filters.inStock !== null && filters.inStock !== undefined) return false;
  if (filters.minPrice !== null && filters.minPrice !== undefined) return false;
  if (filters.maxPrice !== null && filters.maxPrice !== undefined) return false;
  return FILTER_KEYS.every((key) => !Array.isArray(filters[key]) || filters[key].length === 0);
}

/**
 * Serialize a filters object into an array of URLSearchParams key/values.
 * Array filters become comma-separated values (color=black,navy).
 */
export function serializeFilters(filters = {}) {
  const params = [];
  for (const key of FILTER_KEYS) {
    const values = Array.isArray(filters[key]) ? filters[key].filter(Boolean) : [];
    if (values.length > 0) params.push([key, values.join(',')]);
  }
  if (filters.minPrice !== null && filters.minPrice !== undefined && filters.minPrice !== '') {
    params.push(['minPrice', String(filters.minPrice)]);
  }
  if (filters.maxPrice !== null && filters.maxPrice !== undefined && filters.maxPrice !== '') {
    params.push(['maxPrice', String(filters.maxPrice)]);
  }
  if (filters.inStock === true) params.push(['inStock', 'true']);
  else if (filters.inStock === false) params.push(['inStock', 'false']);
  return params;
}

/**
 * Build a URLSearchParams instance for GET /api/products.
 */
export function buildProductParams({ category, filters = {}, sort = 'newest', page = 1, limit = 20 }) {
  const params = new URLSearchParams();
  if (category && category !== 'discover') params.set('category', category);
  for (const [key, value] of serializeFilters(filters)) params.set(key, value);
  if (sort) params.set('sort', sort);
  params.set('page', String(page));
  params.set('limit', String(limit));
  return params;
}