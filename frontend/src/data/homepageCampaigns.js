// Centralized DEER homepage campaign configuration.
//
// The backend has no homepage CMS/banner API yet, so campaign imagery lives
// in the frontend asset system (public/assets/home/). Replace the asset files
// (or swap the paths below) without touching any component. When a homepage
// CMS is added later, this module is the single place to wire it up.

const HOME_ASSETS = '/assets/home';

/**
 * A campaign ad. `width` controls the editorial marquee card width.
 *   narrow | medium | wide | tall
 */
export const marqueeAds = [
  {
    key: 'summer-shirts',
    image: `${HOME_ASSETS}/campaigns/marquee-summer.jpg`,
    title: 'Summer Shirts',
    subtitle: 'Breathable layers for the warm months',
    price: 'Starting at ₹899',
    cta: 'Shop Now',
    categorySlug: 'shirts',
    width: 'wide',
  },
  {
    key: 'formal-wear',
    image: `${HOME_ASSETS}/campaigns/marquee-formal.jpg`,
    title: 'Formal Wear',
    subtitle: 'Sharp silhouettes, quiet fabric',
    price: null,
    cta: 'Explore',
    categorySlug: 'shirts',
    width: 'tall',
  },
  {
    key: 'denim-edit',
    image: `${HOME_ASSETS}/posters/poster-denim.jpg`,
    title: 'The Denim Edit',
    subtitle: 'Wash them in. Live in them.',
    price: 'Starting at ₹1,299',
    cta: 'Shop Jeans',
    categorySlug: 'jeans',
    width: 'medium',
  },
  {
    key: 'travel-capsule',
    image: `${HOME_ASSETS}/campaigns/marquee-travel.jpg`,
    title: 'Travel Capsule',
    subtitle: 'Five pieces. Every itinerary.',
    price: null,
    cta: 'Discover',
    categorySlug: 'trousers',
    width: 'narrow',
  },
  {
    key: 'the-basics',
    image: `${HOME_ASSETS}/campaigns/marquee-basics.jpg`,
    title: 'The Basics',
    subtitle: 'Everyday essentials in natural fibres',
    price: 'Starting at ₹499',
    cta: 'Shop Now',
    categorySlug: 'tshirts',
    width: 'wide',
  },
  {
    key: 'footwear',
    image: `${HOME_ASSETS}/campaigns/marquee-shoes.jpg`,
    title: 'Footwear',
    subtitle: 'Ground the outfit',
    price: null,
    cta: 'Explore',
    categorySlug: 'shoes',
    width: 'medium',
  },
  {
    key: 'quiet-luxury',
    image: `${HOME_ASSETS}/campaigns/marquee-luxury.jpg`,
    title: 'Quiet Luxury',
    subtitle: 'Small runs, considered details',
    price: null,
    cta: 'Discover',
    categorySlug: 'overshirt',
    width: 'narrow',
  },
];

/**
 * Campaign posters — fashion editorial cards. All clickable, routed to the
 * existing `/` + `?category=` discovery experience.
 */
export const campaignPosters = [
  {
    key: 'poster-formal',
    image: `${HOME_ASSETS}/posters/poster-formal.jpg`,
    title: 'Formal Wear',
    subtitle: 'Tailored for the long hour',
    cta: 'Explore',
    categorySlug: 'shirts',
    span: 7,
  },
  {
    key: 'poster-luxury',
    image: `${HOME_ASSETS}/posters/poster-luxury.jpg`,
    title: 'Luxury Edit',
    subtitle: 'Quiet clothes, made to last',
    cta: 'Explore',
    categorySlug: 'perfumes',
    span: 5,
  },
  {
    key: 'poster-basics',
    image: `${HOME_ASSETS}/posters/poster-basic.jpg`,
    title: 'Basics',
    subtitle: 'The foundation of everything',
    cta: 'Shop',
    categorySlug: 'tshirts',
    span: 5,
  },
  {
    key: 'poster-summer',
    image: `${HOME_ASSETS}/posters/poster-summer.jpg`,
    title: 'Summer',
    subtitle: 'Light layers, long days',
    cta: 'Shop',
    categorySlug: 'shorts',
    span: 7,
  },
  {
    key: 'poster-denim',
    image: `${HOME_ASSETS}/posters/poster-denim.jpg`,
    title: 'Denim',
    subtitle: 'Wash them in. Live in them.',
    cta: 'Shop Jeans',
    categorySlug: 'jeans',
    span: 4,
  },
  {
    key: 'poster-travel',
    image: `${HOME_ASSETS}/posters/poster-travel.jpg`,
    title: 'Travel',
    subtitle: 'Packs small, goes far',
    cta: 'Explore',
    categorySlug: 'trousers',
    span: 4,
  },
  {
    key: 'poster-shoes',
    image: `${HOME_ASSETS}/posters/poster-shoes.jpg`,
    title: 'Shoes',
    subtitle: 'Ground the outfit',
    cta: 'Shop',
    categorySlug: 'shoes',
    span: 4,
  },
];

/**
 * Full-width main offer advertisement.
 */
export const fullWidthCampaign = {
  image: `${HOME_ASSETS}/campaigns/banner-sales.jpg`,
  eyebrow: 'Last Chance',
  title: 'Up to 60% Off',
  subtitle: 'The season sale is ending soon. New pieces at their best price.',
  cta: 'Shop the Sale',
  categorySlug: null, // null → routes to the full discovery page
  alt: 'DEER season sale — up to 30% off',
};
