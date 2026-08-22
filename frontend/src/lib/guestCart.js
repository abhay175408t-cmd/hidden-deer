// DEMO BYPASS — guest cart backed by localStorage.
//
// The real backend (backend/src/routes/cart.routes.js) guards every /cart
// route with `protect`, so unauthenticated visitors get a 401. Until auth is
// wired up for the demo, the bag lives entirely client-side under the
// `demo_cart` key. Swapping back to the API later only requires replacing the
// four exported mutators with api.post('/cart/items', ...) calls — every
// consumer reads through useGuestCart().

const STORAGE_KEY = 'demo_cart';
const CHANGE_EVENT = 'demo-cart-change';

let cachedItems = null;
const listeners = new Set();

function readStorage() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeStorage(items) {
  cachedItems = items;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Storage full/blocked (private mode) — keep the in-memory copy working.
  }
  listeners.forEach((listener) => listener());
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

// Keep other browser tabs in sync too.
window.addEventListener('storage', (event) => {
  if (event.key === STORAGE_KEY || event.key === null) {
    cachedItems = null;
    listeners.forEach((listener) => listener());
  }
});

/** useSyncExternalStore subscription — stable identity across renders. */
export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSnapshot() {
  if (!cachedItems) cachedItems = readStorage();
  return cachedItems;
}

export function getServerSnapshot() {
  return [];
}

/**
 * Normalize a product into the compact shape we persist. `options` carries
 * the size/colour picked on the detail page so variants stay distinct lines.
 */
export function addItem(product, { quantity = 1, size = null, color = null } = {}) {
  const items = [...getSnapshot()];
  const lineKey = `${product.id}-${size || ''}-${color || ''}`;
  const existing = items.find((item) => item.lineKey === lineKey);

  if (existing) {
    return writeStorage(
      items.map((item) =>
        item.lineKey === lineKey ? { ...item, quantity: item.quantity + quantity } : item
      )
    );
  }

  const images = Array.isArray(product.images) ? product.images : [];
  writeStorage([
    ...items,
    {
      lineKey,
      id: product.id,
      slug: product.slug,
      name: product.name,
      price: product.discountPrice || product.price,
      image: images[0]?.url || null,
      size,
      color,
      quantity,
    },
  ]);
}

export function updateQuantity(lineKey, quantity) {
  const bounded = Math.max(1, Math.min(99, Number(quantity) || 1));
  writeStorage(
    getSnapshot().map((item) =>
      item.lineKey === lineKey ? { ...item, quantity: bounded } : item
    )
  );
}

export function removeItem(lineKey) {
  writeStorage(getSnapshot().filter((item) => item.lineKey !== lineKey));
}

export function clear() {
  writeStorage([]);
}
