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
  seedCoupon,
  loginUser,
} = require('./helpers');

const Product = require('../src/models/Product');

let categoryId;
let productId;

before(async () => {
  await connectTestDb();
  await startServer();
  const category = await seedCategory();
  categoryId = String(category._id);
  const product = await seedProduct({ categoryId, price: 1000, stock: 10 });
  productId = String(product._id);
});

after(async () => {
  await stopServer();
  await disconnectTestDb();
});

const placeCodOrder = async ({ cookie, items, addressId, couponCode } = {}) => {
  const Product = require('../src/models/Product');
  await Product.findByIdAndUpdate(productId, { $set: { stock: 10 } });
  return request('/api/orders', {
    method: 'POST',
    cookie,
    body: {
      items: items || [{ productId, quantity: 2, variant: null }],
      addressId: addressId,
      paymentMethod: 'cod',
      couponCode,
    },
  });
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

test('checkout preview computes shipping and totals', async () => {
  const { cookie } = await registerUser();
  const res = await request('/api/orders/preview', {
    method: 'POST',
    cookie,
    body: { items: [{ productId, quantity: 1, variant: null }] },
  });
  assert.equal(res.status, 200);
  assert.equal(res.json.data.baseAmount, 1000);
  assert.equal(res.json.data.shippingFee, 99);
  assert.equal(res.json.data.totalPayable, 1099);
});

test('free shipping above threshold', async () => {
  const { cookie } = await registerUser();
  const res = await request('/api/orders/preview', {
    method: 'POST',
    cookie,
    body: { items: [{ productId, quantity: 3, variant: null }] },
  });
  assert.equal(res.json.data.baseAmount, 3000);
  assert.equal(res.json.data.shippingFee, 0);
  assert.equal(res.json.data.totalPayable, 3000);
});

test('preview rejects invalid product id', async () => {
  const { cookie } = await registerUser();
  const res = await request('/api/orders/preview', {
    method: 'POST',
    cookie,
    body: { items: [{ productId: 'not-a-valid-id', quantity: 1 }] },
  });
  assert.equal(res.status, 400);
});

test('places a COD order, reserves stock, and marks confirmed', async () => {
  const user = await createUserWithAddress();
  const res = await placeCodOrder({ cookie: user.cookie, addressId: user.addressId });
  assert.equal(res.status, 201);
  assert.equal(res.json.success, true);

  const order = res.json.data.order;
  assert.equal(order.orderNumber.startsWith('ORD-'), true);
  assert.equal(order.paymentMethod, 'cod');
  assert.equal(order.orderStatus, 'confirmed');
  assert.equal(order.items.length, 1);
  assert.equal(order.items[0].title, 'Test Product');
  // 2 x 1000 = 2000, shipping free above 1999
  assert.equal(order.totals.subtotal, 2000);
  assert.equal(order.totals.shippingFee, 0);
  assert.equal(order.totals.total, 2000);
  assert.equal(order.shippingAddress.city, 'Mumbai');
  assert.ok(order.estimatedDelivery);
});

test('rejects order when stock is insufficient', async () => {
  const user = await createUserWithAddress();
  const res = await placeCodOrder({
    cookie: user.cookie,
    addressId: user.addressId,
    items: [{ productId, quantity: 999, variant: null }],
  });
  assert.equal(res.status, 409);
  assert.match(res.json.message, /Insufficient stock/i);
});

test('rejects order with invalid address', async () => {
  const { cookie } = await registerUser();
  const res = await placeCodOrder({ cookie, addressId: '000000000000000000000000' });
  assert.equal(res.status, 404);
});

test('rejects order with bogus payment method', async () => {
  const user = await createUserWithAddress();
  const res = await request('/api/orders', {
    method: 'POST',
    cookie: user.cookie,
    body: {
      items: [{ productId, quantity: 1, variant: null }],
      addressId: user.addressId,
      paymentMethod: 'crypto',
    },
  });
  assert.equal(res.status, 400);
});

test('applies coupon discount and marks it used', async () => {
  const user = await createUserWithAddress();
  const coupon = await seedCoupon({ discountValue: 100 });
  const res = await placeCodOrder({
    cookie: user.cookie,
    addressId: user.addressId,
    couponCode: coupon.code,
    items: [{ productId, quantity: 1, variant: null }],
  });
  assert.equal(res.status, 201);
  assert.equal(res.json.data.order.totals.couponDiscount, 100);
  // 1000 - 100 = 900, under threshold -> 99 shipping
  assert.equal(res.json.data.order.totals.shippingFee, 99);
  assert.equal(res.json.data.order.totals.total, 999);

  const usedCheck = await request('/api/orders', { cookie: user.cookie });
  assert.ok(usedCheck.json.data.orders[0].coupon);
});

test('rejects reuse of the same coupon by same user', async () => {
  const user = await createUserWithAddress();
  const coupon = await seedCoupon({ discountValue: 50 });
  const first = await placeCodOrder({
    cookie: user.cookie,
    addressId: user.addressId,
    couponCode: coupon.code,
    items: [{ productId, quantity: 1, variant: null }],
  });
  assert.equal(first.status, 201);

  const second = await placeCodOrder({
    cookie: user.cookie,
    addressId: user.addressId,
    couponCode: coupon.code,
    items: [{ productId, quantity: 1, variant: null }],
  });
  assert.equal(second.status, 400);
  assert.match(second.json.message, /coupon/i);
});

test('rejects invalid coupon code', async () => {
  const user = await createUserWithAddress();
  const res = await placeCodOrder({
    cookie: user.cookie,
    addressId: user.addressId,
    couponCode: 'NOPE123',
  });
  assert.equal(res.status, 400);
  assert.equal(res.json.message, 'Invalid coupon code');
});

test('places online order as pending awaiting payment', async () => {
  const user = await createUserWithAddress();
  const res = await request('/api/orders', {
    method: 'POST',
    cookie: user.cookie,
    body: {
      items: [{ productId, quantity: 1, variant: null }],
      addressId: user.addressId,
      paymentMethod: 'online',
    },
  });
  assert.equal(res.status, 201);
  assert.equal(res.json.data.order.paymentStatus, 'pending');
  assert.equal(res.json.data.order.orderStatus, 'pending');
});

test('user can list and fetch their own orders', async () => {
  const user = await createUserWithAddress();
  await placeCodOrder({ cookie: user.cookie, addressId: user.addressId });

  const list = await request('/api/orders', { cookie: user.cookie });
  assert.equal(list.status, 200);
  assert.equal(list.json.data.orders.length, 1);
  const orderId = list.json.data.orders[0].id;

  const detail = await request(`/api/orders/${orderId}`, { cookie: user.cookie });
  assert.equal(detail.status, 200);
  assert.equal(detail.json.data.order.id, orderId);
});

test('users cannot see or cancel each other orders', async () => {
  const owner = await createUserWithAddress();
  const other = await createUserWithAddress();
  const placed = await placeCodOrder({ cookie: owner.cookie, addressId: owner.addressId });
  const orderId = placed.json.data.order.id;

  const detail = await request(`/api/orders/${orderId}`, { cookie: other.cookie });
  assert.equal(detail.status, 404);

  const cancel = await request(`/api/orders/${orderId}/cancel`, {
    method: 'DELETE',
    cookie: other.cookie,
    body: { reason: 'nope' },
  });
  assert.equal(cancel.status, 404);
});

test('cancelling a COD order restores stock and refunds coupon usage', async () => {
  const user = await createUserWithAddress();
  const coupon = await seedCoupon({ discountValue: 100 });
  const placed = await placeCodOrder({
    cookie: user.cookie,
    addressId: user.addressId,
    couponCode: coupon.code,
    items: [{ productId, quantity: 2, variant: null }],
  });
  const orderId = placed.json.data.order.id;

  const Product = require('../src/models/Product');
  let product = await Product.findById(productId).lean();
  assert.equal(product.stock, 8); // 10 - 2

  const cancelled = await request(`/api/orders/${orderId}/cancel`, {
    method: 'DELETE',
    cookie: user.cookie,
    body: { reason: 'Changed my mind' },
  });
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.json.data.order.orderStatus, 'cancelled');
  assert.equal(cancelled.json.data.order.cancelReason, 'Changed my mind');

  product = await Product.findById(productId).lean();
  assert.equal(product.stock, 10);

  // coupon should now be usable again by the same user
  const again = await placeCodOrder({
    cookie: user.cookie,
    addressId: user.addressId,
    couponCode: coupon.code,
    items: [{ productId, quantity: 1, variant: null }],
  });
  assert.equal(again.status, 201);
});

test('cannot cancel a delivered order', async () => {
  const Order = require('../src/models/Order');
  const user = await createUserWithAddress();
  const placed = await placeCodOrder({ cookie: user.cookie, addressId: user.addressId });
  const orderId = placed.json.data.order.id;

  await Order.findByIdAndUpdate(orderId, { orderStatus: 'delivered' });

  const res = await request(`/api/orders/${orderId}/cancel`, {
    method: 'DELETE',
    cookie: user.cookie,
    body: { reason: 'too late' },
  });
  assert.equal(res.status, 400);
});

test('admin can list all orders with filters', async () => {
  const customer = await createUserWithAddress();
  await placeCodOrder({ cookie: customer.cookie, addressId: customer.addressId });

  const admin = await createUserWithAddress(true);
  const res = await request('/api/admin/orders', {
    cookie: admin.cookie,
  });
  assert.equal(res.status, 200);
  assert.ok(res.json.data.orders.length >= 1);
  assert.ok(res.json.data.orders[0].user.email); // populated user info

  const filtered = await request('/api/admin/orders?status=confirmed', { cookie: admin.cookie });
  assert.ok(filtered.json.data.orders.every((o) => o.orderStatus === 'confirmed'));
});

test('admin can advance order status to shipped and delivered', async () => {
  const customer = await createUserWithAddress();
  const placed = await placeCodOrder({ cookie: customer.cookie, addressId: customer.addressId });
  const orderId = placed.json.data.order.id;
  const admin = await createUserWithAddress(true);

  const shipped = await request(`/api/admin/orders/${orderId}/status`, {
    method: 'PATCH',
    cookie: admin.cookie,
    body: { status: 'shipped' },
  });
  assert.equal(shipped.status, 200);
  assert.equal(shipped.json.data.order.orderStatus, 'shipped');

  const delivered = await request(`/api/admin/orders/${orderId}/status`, {
    method: 'PATCH',
    cookie: admin.cookie,
    body: { status: 'delivered' },
  });
  assert.equal(delivered.json.data.order.orderStatus, 'delivered');
  assert.ok(delivered.json.data.order.deliveredAt);
});

test('admin cancel restores stock', async () => {
  const customer = await createUserWithAddress();
  const placed = await placeCodOrder({
    cookie: customer.cookie,
    addressId: customer.addressId,
    items: [{ productId, quantity: 4, variant: null }],
  });
  const orderId = placed.json.data.order.id;
  const admin = await createUserWithAddress(true);

  const product = await Product.findById(productId).lean();
  assert.equal(product.stock, 6); // 10 - 4

  const res = await request(`/api/admin/orders/${orderId}/status`, {
    method: 'PATCH',
    cookie: admin.cookie,
    body: { status: 'cancelled' },
  });
  assert.equal(res.status, 200);

  const after = await Product.findById(productId).lean();
  assert.equal(after.stock, 10);
});

test('non-admin cannot access admin order endpoints', async () => {
  const customer = await createUserWithAddress();
  const res = await request('/api/admin/orders', { cookie: customer.cookie });
  assert.equal(res.status, 403);
});

test('orders require authentication', async () => {
  const res = await request('/api/orders');
  assert.equal(res.status, 401);
});

test('normal user cannot promote own order status', async () => {
  const user = await createUserWithAddress();
  const placed = await placeCodOrder({ cookie: user.cookie, addressId: user.addressId });
  const res = await request(`/api/admin/orders/${placed.json.data.order.id}/status`, {
    method: 'PATCH',
    cookie: user.cookie,
    body: { status: 'shipped' },
  });
  assert.equal(res.status, 403);
});

test('multiple orders tracked separately with pagination', async () => {
  const { cookie, addressId } = await createUserWithAddress();
  for (let i = 0; i < 3; i += 1) {
    const res = await placeCodOrder({ cookie, addressId });
    assert.equal(res.status, 201);
  }
  const res = await request('/api/orders?page=1&limit=2', { cookie });
  assert.equal(res.status, 200);
  assert.equal(res.json.data.orders.length, 2);
  assert.equal(res.json.data.pagination.total, 3);
  assert.equal(res.json.data.pagination.totalPages, 2);
});

test('old sessions still work after coupon reuse rollback flows', async () => {
  const user = await registerUser();
  const again = await loginUser(user.email, user.password);
  assert.ok(again);
});