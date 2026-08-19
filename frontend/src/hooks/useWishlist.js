import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../api/axios';
import { unwrap } from '../api/axios';

/**
 * Wishlist state for product cards.
 *
 * The wishlist endpoints are auth-protected. When a signed-in session exists
 * the toggle persists to the backend; otherwise the toggle stays local and the
 * `authRequired` flag lets the UI surface a gentle "sign in to save" note.
 * Local ids are tracked in a module-level set so toggles survive navigation.
 */
const localWishlist = new Set();

export default function useWishlist() {
  const [ids, setIds] = useState(() => new Set(localWishlist));
  const [loading, setLoading] = useState(true);
  const [authRequired, setAuthRequired] = useState(false);
  const activeRef = useRef(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get('/wishlist')
      .then((res) => {
        const items = unwrap(res)?.items;
        const next = new Set(ids);
        if (Array.isArray(items)) {
          for (const item of items) {
            const id = item.product?._id || item.productId || item._id;
            if (id) next.add(String(id));
          }
        }
        localWishlist.clear();
        next.forEach((id) => localWishlist.add(id));
        if (!cancelled && activeRef.current) setIds(next);
      })
      .catch((err) => {
        if (err.response?.status === 401) {
          if (!cancelled) setAuthRequired(true);
        }
      })
      .finally(() => {
        if (!cancelled && activeRef.current) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isSaved = useCallback((productId) => ids.has(String(productId)), [ids]);

  const toggle = useCallback(
    async (product) => {
      const pid = String(product?.id || product?._id);
      if (!pid) return;

      const optimistic = new Set(ids);
      const adding = !optimistic.has(pid);
      if (adding) optimistic.add(pid);
      else optimistic.delete(pid);
      localWishlist.clear();
      optimistic.forEach((id) => localWishlist.add(id));
      setIds(optimistic);

      try {
        if (adding) {
          await api.post('/wishlist/items', { productId: pid });
        } else {
          await api.delete(`/wishlist/items/${pid}`);
        }
      } catch (err) {
        if (err.response?.status === 401) {
          setAuthRequired(true);
          return;
        }
        // Revert on real failures (network, server).
        const reverted = new Set(ids);
        localWishlist.clear();
        reverted.forEach((id) => localWishlist.add(id));
        setIds(reverted);
      }
    },
    [ids]
  );

  useEffect(() => () => { activeRef.current = false; }, []);

  return { isSaved, toggle, loading, authRequired };
}