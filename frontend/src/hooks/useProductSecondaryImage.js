import { useEffect, useRef, useState } from 'react';
import api from '../api/axios';
import { unwrap } from '../api/axios';

// The product LIST endpoint returns a single primary image per product.
// The full `images[]` array (person/lifestyle + product shots) only exists on
// the DETAIL endpoint (GET /products/:slug). This hook lazily fetches the
// detail of a card only when it approaches the viewport, then exposes a
// secondary image if the product actually has one. If the product only has
// one image, `secondary` stays null and the card renders single-image —
// nothing is ever faked.
//
// Module-level cache: a product's secondary image is fetched at most once per
// session, even if the card appears in multiple sections.
const detailCache = new Map();

function pickSecondary(detail) {
  const images = Array.isArray(detail?.images) ? detail.images : [];
  if (images.length < 2) return null;
  const primary = images.find((image) => image.isPrimary) || images[0];
  const secondary = images.find((image) => image !== primary);
  return secondary || null;
}

/**
 * @param {object} product  product in list shape ({ id, slug, image })
 * @returns {{ secondary, loading, rootRef }}
 *   Attach rootRef to the card root element so the fetch triggers when the
 *   card approaches the viewport.
 */
export default function useProductSecondaryImage(product) {
  const [secondary, setSecondary] = useState(null);
  const [loading, setLoading] = useState(false);
  const rootRef = useRef(null);
  const requestedRef = useRef(false);

  useEffect(() => {
    requestedRef.current = false;
    setSecondary(null);
    setLoading(false);
    const pid = product?.id;
    if (!pid || !product?.image?.url) return undefined;

    if (detailCache.has(pid)) {
      const cached = detailCache.get(pid);
      if (cached.status === 'ok') {
        setSecondary(cached.secondary);
      }
      return undefined;
    }

    const node = rootRef.current;
    let cancelled = false;

    const load = () => {
      if (cancelled || requestedRef.current) return;
      requestedRef.current = true;
      setLoading(true);
      api
        .get(`/products/${product.slug}`)
        .then((res) => {
          const detail = unwrap(res)?.product;
          const found = pickSecondary(detail);
          detailCache.set(pid, { status: 'ok', secondary: found });
          if (!cancelled) setSecondary(found);
        })
        .catch(() => {
          detailCache.set(pid, { status: 'error', secondary: null });
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    };

    if (node && typeof IntersectionObserver !== 'undefined') {
      const observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            observer.disconnect();
            load();
          }
        },
        { rootMargin: '300px 0px' }
      );
      observer.observe(node);
      return () => {
        cancelled = true;
        observer.disconnect();
      };
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [product?.id, product?.slug, product?.image?.url]);

  return { secondary, loading, rootRef };
}
