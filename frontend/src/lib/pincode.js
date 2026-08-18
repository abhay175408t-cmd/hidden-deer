// Pincode / delivery-location state — LOCAL ONLY for now.
//
// The backend has no endpoint to persist a bare pincode (the Address model
// requires a full address: fullName, phone, addressLine1, city, state, ...).
// Until a delivery-check API exists, the pincode lives in localStorage and
// every function here is isolated so the swap to a real API is a one-file
// change (see the integration notes below).

const STORAGE_KEY = 'deer.pincode.v1';

export function getSavedPincode() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && /^\d{6}$/.test(parsed.pincode) ? parsed.pincode : null;
  } catch {
    return null;
  }
}

export function savePincode(pincode) {
  const normalized = String(pincode || '').trim();
  if (!/^\d{6}$/.test(normalized)) return false;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ pincode: normalized, savedAt: Date.now() }));
    return true;
  } catch {
    return false;
  }
}

export function clearPincode() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* noop */
  }
}

export function isValidPincode(pincode) {
  return /^\d{6}$/.test(String(pincode || '').trim());
}

// ---- Future API integration point -----------------------------------------
// When the backend grows a delivery-check endpoint (e.g. POST /delivery/check
// { pincode } -> { deliverable, etaDays }), swap the implementations above:
//
//   const cache = new Map();
//   export async function checkPincode(pincode) {
//     if (cache.has(pincode)) return cache.get(pincode);
//     const res = await api.post('/delivery/check', { pincode });
//     const result = res.data?.data;
//     cache.set(pincode, result);
//     return result;
//   }
//
// The DeliveryBar component only calls the helpers in this module — nothing
// else needs to change.