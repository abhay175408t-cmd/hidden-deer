// HIDDEN DEER featured category cards for the homepage.
//
// Each card shows IMAGE A (lifestyle / person wearing) by default and
// transitions to IMAGE B (clean product-only shot) on hover — the signature
// HIDDEN DEER interaction. Imagery is frontend-managed (no homepage CMS on the
// backend yet); swap the files under public/assets/home/categories/ to
// replace visuals without touching components.
//
// `href` uses the existing discovery route: `/?category=<slug>`, handled by
// HomePage. Slugs must match backend categories so the filter returns items.

const HOME_ASSETS = '/assets/home';

export const featuredCategories = [
  {
    name: 'Shirts',
    slug: 'shirts',
    href: '/?category=shirts',
    personImage: `${HOME_ASSETS}/categories/shirts-person.jpg`,
    productImage: `${HOME_ASSETS}/categories/shirts-product.jpg`,
  },
  {
    name: 'T-Shirts',
    slug: 'tshirts',
    href: '/?category=tshirts',
    personImage: `${HOME_ASSETS}/categories/tshirts-person.jpg`,
    productImage: `${HOME_ASSETS}/categories/tshirts-product.jpg`,
  },
  {
    name: 'Jeans',
    slug: 'jeans',
    href: '/?category=jeans',
    personImage: `${HOME_ASSETS}/categories/jeans-person.jpg`,
    productImage: `${HOME_ASSETS}/categories/jeans-product.jpg`,
  },
  {
    name: 'Trousers',
    slug: 'trousers',
    href: '/?category=trousers',
    personImage: `${HOME_ASSETS}/categories/trousers-person.jpg`,
    productImage: `${HOME_ASSETS}/categories/trousers-product.jpg`,
  },
  {
    name: 'Cargos',
    slug: 'cargos',
    href: '/?category=cargos',
    personImage: `${HOME_ASSETS}/categories/cargos-person.jpg`,
    productImage: `${HOME_ASSETS}/categories/cargos-product.jpg`,
  },
  {
    name: 'Shoes',
    slug: 'shoes',
    href: '/?category=shoes',
    personImage: `${HOME_ASSETS}/categories/shoes-person.jpg`,
    productImage: `${HOME_ASSETS}/categories/shoes-product.jpg`,
  },
  {
    name: 'Shorts',
    slug: 'shorts',
    href: '/?category=shorts',
    personImage: `${HOME_ASSETS}/categories/shorts-person.jpg`,
    productImage: `${HOME_ASSETS}/categories/shorts-product.jpg`,
  },
  {
    name: 'Plus Size',
    slug: 'plus-size',
    href: '/?category=plus-size',
    personImage: `${HOME_ASSETS}/categories/plus-size-person.jpg`,
    productImage: `${HOME_ASSETS}/categories/plus-size-product.jpg`,
  },
  {
    name: 'Perfumes',
    slug: 'perfumes',
    href: '/?category=perfumes',
    personImage: `${HOME_ASSETS}/categories/perfumes-person.jpg`,
    productImage: `${HOME_ASSETS}/categories/perfumes-product.jpg`,
  },
  {
    name: 'Overshirt',
    slug: 'overshirt',
    href: '/?category=overshirt',
    personImage: `${HOME_ASSETS}/categories/overshirt-person.jpg`,
    productImage: `${HOME_ASSETS}/categories/overshirt-product.jpg`,
  },
];

// Only render categories that actually exist on the backend, so featured
// cards never dead-end. Matched by slug.
export function filterFeaturedByBackend(backendCategories) {
  const known = new Set((backendCategories || []).map((category) => category.slug));
  return featuredCategories.filter((category) => known.has(category.slug));
}
