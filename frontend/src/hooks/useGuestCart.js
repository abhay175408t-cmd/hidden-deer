import { useMemo, useSyncExternalStore } from 'react';
import * as guestCart from '../lib/guestCart';

/**
 * Single read/write interface for the demo guest bag. Every component —
 * the header counter badge, CartPage, add-to-bag on the detail page —
 * subscribes here, so a change anywhere re-renders everywhere.
 */
export default function useGuestCart() {
  const items = useSyncExternalStore(
    guestCart.subscribe,
    guestCart.getSnapshot,
    guestCart.getServerSnapshot
  );

  return useMemo(() => {
    const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
    const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    return {
      items,
      itemCount,
      subtotal,
      addItem: guestCart.addItem,
      updateQuantity: guestCart.updateQuantity,
      removeItem: guestCart.removeItem,
      clear: guestCart.clear,
    };
  }, [items]);
}
