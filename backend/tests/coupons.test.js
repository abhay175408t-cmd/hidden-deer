const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const {
  connectTestDb,
  disconnectTestDb,
  startServer,
  stopServer,
  request,
  registerUser,
  makeAdmin,
  seedCategory,
  seedProduct,
  seedAddressPayload,
} = require('./helpers');

const Coupon = require('../src/models/Coupon');
const Order = require('../src/models/Order');

let catA;
let catB;
let productA;
let productB;

const createCoupon = async (overrides = {}) => {
  const coupon = await Coupon.create({
    code: `SAVE${String(Date.now()).slice(-8)}${Math.floor(Math.random() * 1000)}`,
    description: 'Test coupon',
    discountType: 'fixed',
    discountValue: 100,
    maxDiscount: null,
    minCartValue: null,
    firstOrderOnly: false,
    applicableProducts: [],
    applicableCategories: [],
    excludedProducts: [],
    excludedCategories: [],
    expiresAt: null,
    usageLimit: null,
    usageCount: 0,
    usedBy: [],
    isActive: true,
    ...overrides,
  });
  return coupon;
};

const createUserWithAddress = async (admin = false) => {
  const user = await registerUser();
  if (admin) await makeAdmin(user.user.id);
  const addressRes = await request('/api/addresses', {
    method: 'POST',
    cookie: user.cookie,
    body: seedAddressPayload(),
  });
  return { ...user, addressId: addressRes.json.data.address.id };
};

const placeCodOrder = async ({ cookie, addressId, items, couponCode }) => {
  const res = await request('/api/orders', {
    method: 'POST',
    cookie,
    body: {
      items: items || [{ productId: productA, quantity: 2, variant: null }],
      addressId,
      paymentMethod: 'cod',
      couponCode,
    },
  });
  return res;
};

const validateCoupon = ({ cookie, code, items }) =>
  request('/api/coupons/validate', {
    method: 'POST',
    cookie,
    body: {
      code,
      items: items || [{ productId: productA, quantity: 2, variant: null }],
    },
  });

before(async () => {
  await connectTestDb();
  await startServer();
  catA = await seedCategory();
  catB = await seedCategory();
  productA = await seedProduct({ categoryId: catA._id, price: 1000, stock: 100 });
  productB = await seedProduct({ categoryId: catB._id, price: 500, stock: 100 });
  productA = String(productA._id);
  productB = String(productB._id);
  catA = String(catA._id);
  catB = String(catB._id);
});

after(async () => {
  await stopServer();
  await disconnectTestDb();
});

test('validate endpoint returns discount for a fixed coupon', async () => {
  const user = await registerUser();
  const coupon = await createCoupon({ discountValue: 100 });
  const res = await validateCoupon({ cookie: user.cookie, code: coupon.code });
  assert.equal(res.status, 200);
  assert.equal(res.json.data.discount, 100);
  assert.equal(res.json.data.eligibleSubtotal, 2000);
  assert.equal(res.json.data.code, coupon.code);
});

test('validate rejects unknown code', async () => {
  const user = await registerUser();
  const res = await validateCoupon({ cookie: user.cookie, code: 'NOPE123' });
  assert.equal(res.status, 400);
  assert.equal(res.json.message, 'Invalid coupon code');
});

test('validate rejects inactive coupon', async () => {
  const user = await registerUser();
  const coupon = await createCoupon({ isActive: false });
  const res = await validateCoupon({ cookie: user.cookie, code: coupon.code });
  assert.equal(res.status, 400);
  assert.equal(res.json.message, 'Coupon is inactive');
});

test('validate rejects expired coupon', async () => {
  const user = await registerUser();
  const coupon = await createCoupon({ expiresAt: new Date(Date.now() - 1000) });
  const res = await validateCoupon({ cookie: user.cookie, code: coupon.code });
  assert.equal(res.status, 400);
  assert.equal(res.json.message, 'Coupon has expired');
});

test('validate rejects coupon past its usage limit', async () => {
  const user = await registerUser();
  const coupon = await createCoupon({ usageLimit: 1, usageCount: 1 });
  const res = await validateCoupon({ cookie: user.cookie, code: coupon.code });
  assert.equal(res.status, 400);
  assert.equal(res.json.message, 'Coupon usage limit reached');
});

test('validate rejects coupon already used by the user', async () => {
  const user = await createUserWithAddress();
  const coupon = await createCoupon({ discountValue: 50 });
  const first = await placeCodOrder({ cookie: user.cookie, addressId: user.addressId, couponCode: coupon.code });
  assert.equal(first.status, 201);

  const res = await validateCoupon({ cookie: user.cookie, code: coupon.code });
  assert.equal(res.status, 400);
  assert.equal(res.json.message, 'Coupon already used by you');
});

test('percent coupon applies percentage of eligible subtotal', async () => {
  const user = await registerUser();
  const coupon = await createCoupon({ discountType: 'percent', discountValue: 10 });
  // 10% of 2000 = 200
  const res = await validateCoupon({ cookie: user.cookie, code: coupon.code });
  assert.equal(res.status, 200);
  assert.equal(res.json.data.discount, 200);
});

test('percent coupon is capped by maxDiscount', async () => {
  const user = await registerUser();
  const coupon = await createCoupon({
    discountType: 'percent',
    discountValue: 20, // 20% of 2000 = 400
    maxDiscount: 300,
  });
  const res = await validateCoupon({ cookie: user.cookie, code: coupon.code });
  assert.equal(res.status, 200);
  assert.equal(res.json.data.discount, 300);
});

test('coupon with minCartValue rejects below the minimum', async () => {
  const user = await registerUser();
  const coupon = await createCoupon({ discountValue: 100, minCartValue: 3000 });
  const res = await validateCoupon({ cookie: user.cookie, code: coupon.code });
  assert.equal(res.status, 400);
  assert.match(res.json.message, /minimum order value/i);
});

test('coupon with minCartValue passes at or above the minimum', async () => {
  const user = await registerUser();
  const coupon = await createCoupon({ discountValue: 100, minCartValue: 2000 });
  const res = await validateCoupon({ cookie: user.cookie, code: coupon.code });
  assert.equal(res.status, 200);
  assert.equal(res.json.data.discount, 100);
});

test('first-order-only coupon rejected for returning user', async () => {
  const user = await createUserWithAddress();
  const placed = await placeCodOrder({ cookie: user.cookie, addressId: user.addressId });
  assert.equal(placed.status, 201);

  const coupon = await createCoupon({ discountValue: 100, firstOrderOnly: true });
  const res = await validateCoupon({ cookie: user.cookie, code: coupon.code });
  assert.equal(res.status, 400);
  assert.match(res.json.message, /first order/i);
});

test('first-order-only coupon accepted for a new user', async () => {
  const user = await registerUser();
  const coupon = await createCoupon({ discountValue: 100, firstOrderOnly: true });
  const res = await validateCoupon({ cookie: user.cookie, code: coupon.code });
  assert.equal(res.status, 200);
  assert.equal(res.json.data.discount, 100);
});

test('product-scoped coupon only discounts the applicable product', async () => {
  const user = await registerUser();
  const coupon = await createCoupon({
    discountValue: 100,
    applicableProducts: [productA],
  });
  const res = await validateCoupon({
    cookie: user.cookie,
    code: coupon.code,
    items: [
      { productId: productA, quantity: 1, variant: null }, // 1000
      { productId: productB, quantity: 2, variant: null }, // 1000
    ],
  });
  assert.equal(res.status, 200);
  assert.equal(res.json.data.eligibleSubtotal, 1000);
  assert.equal(res.json.data.discount, 100);
});

test('product-scoped coupon yields zero discount when nothing matches', async () => {
  const user = await registerUser();
  const coupon = await createCoupon({
    discountValue: 100,
    applicableProducts: [productA],
  });
  const res = await validateCoupon({
    cookie: user.cookie,
    code: coupon.code,
    items: [{ productId: productB, quantity: 2, variant: null }],
  });
  assert.equal(res.status, 200);
  assert.equal(res.json.data.discount, 0);
});

test('category-scoped coupon only discounts items in that category', async () => {
  const user = await registerUser();
  const coupon = await createCoupon({
    discountValue: 100,
    applicableCategories: [catA],
  });
  const res = await validateCoupon({
    cookie: user.cookie,
    code: coupon.code,
    items: [
      { productId: productA, quantity: 1, variant: null }, // catA
      { productId: productB, quantity: 1, variant: null }, // catB
    ],
  });
  assert.equal(res.status, 200);
  assert.equal(res.json.data.eligibleSubtotal, 1000);
  assert.equal(res.json.data.discount, 100);
});

test('excluded-product coupon skips the excluded item', async () => {
  const user = await registerUser();
  const coupon = await createCoupon({
    discountValue: 100,
    excludedProducts: [productA],
  });
  const res = await validateCoupon({
    cookie: user.cookie,
    code: coupon.code,
    items: [
      { productId: productA, quantity: 1, variant: null },
      { productId: productB, quantity: 1, variant: null }, // 500
    ],
  });
  assert.equal(res.status, 200);
  assert.equal(res.json.data.eligibleSubtotal, 500);
  assert.equal(res.json.data.discount, 100);
});

test('excluded-category coupon skips the excluded category', async () => {
  const user = await registerUser();
  const coupon = await createCoupon({
    discountValue: 100,
    excludedCategories: [catA],
  });
  const res = await validateCoupon({
    cookie: user.cookie,
    code: coupon.code,
    items: [
      { productId: productA, quantity: 1, variant: null },
      { productId: productB, quantity: 1, variant: null }, // 500
    ],
  });
  assert.equal(res.status, 200);
  assert.equal(res.json.data.eligibleSubtotal, 500);
});

test('checkout applies percent coupon with max discount and records usage', async () => {
  const user = await createUserWithAddress();
  const coupon = await createCoupon({
    discountType: 'percent',
    discountValue: 20, // 20% of 2000 = 400
    maxDiscount: 300,
  });
  const res = await placeCodOrder({ cookie: user.cookie, addressId: user.addressId, couponCode: coupon.code });
  assert.equal(res.status, 201);

  const order = res.json.data.order;
  assert.equal(order.totals.couponDiscount, 300);
  // 2000 - 300 = 1700, under free-shipping threshold -> 99 shipping
  assert.equal(order.totals.shippingFee, 99);
  assert.equal(order.totals.total, 1799);
  assert.ok(order.coupon);

  const stored = await Coupon.findById(coupon._id).lean();
  assert.equal(stored.usageCount, 1);
  assert.ok(stored.usedBy.some((id) => String(id) === String(user.user.id)));
});

test('client-sent discount fields are ignored (server computes totals)', async () => {
  const user = await createUserWithAddress();
  const coupon = await createCoupon({ discountValue: 100 });
  const res = await request('/api/orders', {
    method: 'POST',
    cookie: user.cookie,
    body: {
      items: [{ productId: productA, quantity: 1, variant: null }],
      addressId: user.addressId,
      paymentMethod: 'cod',
      couponCode: coupon.code,
      couponDiscount: 99999,
      discountAmount: 99999,
    },
  });
  assert.equal(res.status, 201);
  // 1000 - 100 = 900 -> 99 shipping -> 999 total (server-computed, not 99999)
  assert.equal(res.json.data.order.totals.couponDiscount, 100);
  assert.equal(res.json.data.order.totals.discountAmount, 0);
  assert.equal(res.json.data.order.totals.total, 999);
});

test('preview accepts couponCode and reflects the discount', async () => {
  const user = await registerUser();
  const coupon = await createCoupon({ discountValue: 100 });
  const res = await request('/api/orders/preview', {
    method: 'POST',
    cookie: user.cookie,
    body: {
      items: [{ productId: productA, quantity: 2, variant: null }],
      couponCode: coupon.code,
    },
  });
  assert.equal(res.status, 200);
  assert.equal(res.json.data.baseAmount, 2000);
  assert.equal(res.json.data.couponDiscount, 100);
  assert.equal(res.json.data.totalPayable, 1999);
});

test('coupon usage is released when the order is cancelled', async () => {
  const user = await createUserWithAddress();
  const coupon = await createCoupon({ discountValue: 100 });
  const placed = await placeCodOrder({ cookie: user.cookie, addressId: user.addressId, couponCode: coupon.code });
  assert.equal(placed.status, 201);
  const orderId = placed.json.data.order.id;

  const cancelled = await request(`/api/orders/${orderId}/cancel`, {
    method: 'DELETE',
    cookie: user.cookie,
    body: { reason: 'change of mind' },
  });
  assert.equal(cancelled.status, 200);

  const stored = await Coupon.findById(coupon._id).lean();
  assert.equal(stored.usageCount, 0);
  assert.equal(stored.usedBy.length, 0);
});

test('validate endpoint requires authentication', async () => {
  const coupon = await createCoupon();
  const res = await validateCoupon({ code: coupon.code });
  assert.equal(res.status, 401);
});

// ---------------------------------------------------------------------------
// Admin coupon management
// ---------------------------------------------------------------------------

test('admin can create, list, get, update and deactivate coupons', async () => {
  const admin = await createUserWithAddress(true);

  const created = await request('/api/admin/coupons', {
    method: 'POST',
    cookie: admin.cookie,
    body: {
      code: `WELCOME${Date.now()}`,
      description: 'Welcome offer',
      discountType: 'percent',
      discountValue: 10,
      maxDiscount: 150,
      minCartValue: 500,
    },
  });
  assert.equal(created.status, 201);
  const couponId = created.json.data.coupon.id;

  const list = await request('/api/admin/coupons', { cookie: admin.cookie });
  assert.equal(list.status, 200);
  assert.ok(list.json.data.coupons.some((c) => c.id === couponId));

  const got = await request(`/api/admin/coupons/${couponId}`, { cookie: admin.cookie });
  assert.equal(got.status, 200);
  assert.equal(got.json.data.coupon.code, created.json.data.coupon.code);

  const updated = await request(`/api/admin/coupons/${couponId}`, {
    method: 'PATCH',
    cookie: admin.cookie,
    body: { maxDiscount: 200, isActive: false },
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.json.data.coupon.maxDiscount, 200);
  assert.equal(updated.json.data.coupon.isActive, false);

  const deactivated = await request(`/api/admin/coupons/${couponId}`, {
    method: 'DELETE',
    cookie: admin.cookie,
  });
  assert.equal(deactivated.status, 200);
  assert.equal(deactivated.json.data.coupon.isActive, false);
});

test('admin create rejects duplicate code', async () => {
  const admin = await createUserWithAddress(true);
  const coupon = await createCoupon();
  const res = await request('/api/admin/coupons', {
    method: 'POST',
    cookie: admin.cookie,
    body: { code: coupon.code, discountType: 'fixed', discountValue: 50 },
  });
  assert.equal(res.status, 409);
  assert.match(res.json.message, /already exists/i);
});

test('admin create rejects invalid percent discount and invalid code', async () => {
  const admin = await createUserWithAddress(true);

  const tooBig = await request('/api/admin/coupons', {
    method: 'POST',
    cookie: admin.cookie,
    body: { code: 'BIG100', discountType: 'percent', discountValue: 150 },
  });
  assert.equal(tooBig.status, 400);
  assert.match(tooBig.json.message, /cannot exceed 100/i);

  const badCode = await request('/api/admin/coupons', {
    method: 'POST',
    cookie: admin.cookie,
    body: { code: 'x', discountType: 'fixed', discountValue: 50 },
  });
  assert.equal(badCode.status, 400);
});

test('non-admin cannot access admin coupon routes', async () => {
  const customer = await registerUser();
  const res = await request('/api/admin/coupons', { cookie: customer.cookie });
  assert.equal(res.status, 403);
});
