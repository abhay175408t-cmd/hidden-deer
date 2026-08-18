// DEER featured category cards for the homepage.
//
// Each card shows IMAGE A (lifestyle / person wearing) by default and
// transitions to IMAGE B (clean product-only shot) on hover — the signature
// DEER interaction. Imagery is frontend-managed (no homepage CMS on the
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
    personImage: `${HOME_ASSETS}/categories/shirts-person.svg`,
    productImage: `${HOME_ASSETS}/categories/shirts-product.svg`,
  },
  {
    name: 'T-Shirts',
    slug: 'tshirts',
    href: '/?category=tshirts',
    personImage: `${HOME_ASSETS}/categories/tshirts-person.svg`,
    productImage: `${HOME_ASSETS}/categories/tshirts-product.svg`,
  },
  {
    name: 'Jeans',
    slug: 'jeans',
    href: '/?category=jeans',
    personImage: `${HOME_ASSETS}/categories/jeans-person.svg`,
    productImage: `${HOME_ASSETS}/categories/jeans-product.svg`,
  },
  {
    name: 'Trousers',
    slug: 'trousers',
    href: '/?category=trousers',
    personImage: `${HOME_ASSETS}/categories/trousers-person.svg`,
    productImage: `${HOME_ASSETS}/categories/trousers-product.svg`,
  },
  {
    name: 'Cargos',
    slug: 'cargos',
    href: '/?category=cargos',
    personImage: `${HOME_ASSETS}/categories/cargos-person.svg`,
    productImage: `${HOME_ASSETS}/categories/cargos-product.svg`,
  },
  {
    name: 'Shoes',
    slug: 'shoes',
    href: '/?category=shoes',
    personImage: `${HOME_ASSETS}/categories/shoes-person.svg`,
    productImage: `${HOME_ASSETS}/categories/shoes-product.svg`,
  },
  {
    name: 'Shorts',
    slug: 'shorts',
    href: '/?category=shorts',
    personImage: `${HOME_ASSETS}/categories/shorts-person.svg`,
    productImage: `${HOME_ASSETS}/categories/shorts-product.svg`,
  },
  {
    name: 'Plus Size',
    slug: 'plus-size',
    href: '/?category=plus-size',
    personImage: `${HOME_ASSETS}/categories/plus-size-person.svg`,
    productImage: `${HOME_ASSETS}/categories/plus-size-product.svg`,
  },
  {
    name: 'Perfumes',
    slug: 'perfumes',
    href: '/?category=perfumes',
    personImage: `${HOME_ASSETS}/categories/perfumes-person.svg`,
    productImage: `${HOME_ASSETS}/categories/perfumes-product.svg`,
  },
  {
    name: 'Overshirt',
    slug: 'overshirt',
    href: '/?category=overshirt',
    personImage: `${HOME_ASSETS}/categories/overshirt-person.svg`,
    productImage: `${HOME_ASSETS}/categories/overshirt-product.svg`,
  },
];

// Only render categories that actually exist on the backend, so featured
// cards never dead-end. Matched by slug.
export function filterFeaturedByBackend(backendCategories) {
  const known = new Set((backendCategories || []).map((category) => category.slug));
  return featuredCategories.filter((category) => known.has(category.slug));
}
