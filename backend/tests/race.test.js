const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const {
  connectTestDb,
  disconnectTestDb,
  startServer,
  stopServer,
  request,
  registerUser,
  seedCategory,
  seedProduct,
  seedAddressPayload,
} = require('./helpers');

const Product = require('../src/models/Product');
const Order = require('../src/models/Order');

let productId;

const createUserWithAddress = async () => {
  const user = await registerUser();
  const addressRes = await request('/api/addresses', {
    method: 'POST',
    cookie: user.cookie,
    body: seedAddressPayload(),
  });
  return { ...user, addressId: addressRes.json.data.address.id };
};

before(async () => {
  await connectTestDb();
  await startServer();
  const category = await seedCategory();
  const product = await seedProduct({ categoryId: category._id, price: 1000, stock: 1 });
  productId = String(product._id);
});

after(async () => {
  await stopServer();
  await disconnectTestDb();
});

test('concurrent purchases of the last unit: only one succeeds, stock never goes negative', async () => {
  const userA = await createUserWithAddress();
  const userB = await createUserWithAddress();

  const orderPayload = (user) =>
    request('/api/orders', {
      method: 'POST',
      cookie: user.cookie,
      body: {
        items: [{ productId, quantity: 1, variant: null }],
        addressId: user.addressId,
        paymentMethod: 'cod',
      },
    });

  const [resA, resB] = await Promise.all([orderPayload(userA), orderPayload(userB)]);

  const statuses = [resA.status, resB.status].sort();
  assert.deepEqual(statuses, [201, 409]);

  const winner = resA.status === 201 ? resA : resB;
  const loser = resA.status === 201 ? resB : resA;
  assert.match(loser.json.message, /Insufficient stock/i);
  assert.equal(winner.json.data.order.totals.total, 1099); // 1000 + 99 shipping

  // Stock must be exactly zero — never negative.
  const product = await Product.findById(productId).lean();
  assert.equal(product.stock, 0);

  // Exactly one order was created across both users.
  const totalOrders = await Order.countDocuments();
  assert.equal(totalOrders, 1);

  // The winner's order holds the single unit.
  const winnerOrder = await Order.findById(winner.json.data.order.id).lean();
  assert.equal(winnerOrder.items[0].quantity, 1);
});

test('a second purchase after stock hits zero is rejected', async () => {
  const user = await createUserWithAddress();
  const res = await request('/api/orders', {
    method: 'POST',
    cookie: user.cookie,
    body: {
      items: [{ productId, quantity: 1, variant: null }],
      addressId: user.addressId,
      paymentMethod: 'cod',
    },
  });
  assert.equal(res.status, 409);
  assert.match(res.json.message, /Insufficient stock/i);
  const product = await Product.findById(productId).lean();
  assert.equal(product.stock, 0);
});
