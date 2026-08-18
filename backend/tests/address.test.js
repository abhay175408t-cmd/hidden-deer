const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const {
  connectTestDb,
  disconnectTestDb,
  startServer,
  stopServer,
  request,
  registerUser,
  seedAddressPayload,
} = require('./helpers');

before(async () => {
  await connectTestDb();
  await startServer();
});

after(async () => {
  await stopServer();
  await disconnectTestDb();
});

test('creating a first address makes it default automatically', async () => {
  const { cookie } = await registerUser();
  const res = await request('/api/addresses', {
    method: 'POST',
    cookie,
    body: seedAddressPayload(),
  });
  assert.equal(res.status, 201);
  assert.equal(res.json.success, true);
  assert.equal(res.json.data.address.isDefault, true);
  assert.equal(res.json.data.address.postalCode, '400001');
});

test('creating a second non-default address keeps first one default', async () => {
  const { cookie } = await registerUser();
  await request('/api/addresses', { method: 'POST', cookie, body: seedAddressPayload() });
  const res = await request('/api/addresses', {
    method: 'POST',
    cookie,
    body: seedAddressPayload({ addressLine1: '99 Other Street' }),
  });
  assert.equal(res.status, 201);
  assert.equal(res.json.data.address.isDefault, false);

  const list = await request('/api/addresses', { cookie });
  assert.equal(list.status, 200);
  const defaults = list.json.data.addresses.filter((a) => a.isDefault);
  assert.equal(defaults.length, 1);
});

test('creating an address with isDefault=true unsets the previous default', async () => {
  const { cookie } = await registerUser();
  await request('/api/addresses', { method: 'POST', cookie, body: seedAddressPayload() });
  const res = await request('/api/addresses', {
    method: 'POST',
    cookie,
    body: seedAddressPayload({ addressLine1: '77 New Main Rd', isDefault: true }),
  });
  assert.equal(res.json.data.address.isDefault, true);

  const list = await request('/api/addresses', { cookie });
  const defaults = list.json.data.addresses.filter((a) => a.isDefault);
  assert.equal(defaults.length, 1);
  assert.equal(defaults[0].addressLine1, '77 New Main Rd');
});

test('rejects address with invalid postal code', async () => {
  const { cookie } = await registerUser();
  const res = await request('/api/addresses', {
    method: 'POST',
    cookie,
    body: seedAddressPayload({ postalCode: '40' }),
  });
  assert.equal(res.status, 400);
  assert.equal(res.json.success, false);
});

test('rejects address missing required fields', async () => {
  const { cookie } = await registerUser();
  const res = await request('/api/addresses', {
    method: 'POST',
    cookie,
    body: seedAddressPayload({ city: '' }),
  });
  assert.equal(res.status, 400);
  assert.equal(res.json.success, false);
});

test('listing addresses returns empty array for new user', async () => {
  const { cookie } = await registerUser();
  const res = await request('/api/addresses', { cookie });
  assert.equal(res.status, 200);
  assert.deepEqual(res.json.data.addresses, []);
});

test('addresses are scoped per user (no leakage)', async () => {
  const userA = await registerUser();
  const userB = await registerUser();
  await request('/api/addresses', {
    method: 'POST',
    cookie: userA.cookie,
    body: seedAddressPayload(),
  });

  const resB = await request('/api/addresses', { cookie: userB.cookie });
  assert.equal(resB.json.data.addresses.length, 0);
});

test('can update an address', async () => {
  const { cookie } = await registerUser();
  const created = await request('/api/addresses', {
    method: 'POST',
    cookie,
    body: seedAddressPayload(),
  });
  const id = created.json.data.address.id;

  const res = await request(`/api/addresses/${id}`, {
    method: 'PATCH',
    cookie,
    body: { city: 'Delhi', addressLine1: '5 Updated Lane' },
  });
  assert.equal(res.status, 200);
  assert.equal(res.json.data.address.city, 'Delhi');
  assert.equal(res.json.data.address.addressLine1, '5 Updated Lane');
});

test('can set an address as default via dedicated endpoint', async () => {
  const { cookie } = await registerUser();
  const first = await request('/api/addresses', {
    method: 'POST',
    cookie,
    body: seedAddressPayload(),
  });
  const second = await request('/api/addresses', {
    method: 'POST',
    cookie,
    body: seedAddressPayload({ addressLine1: '88 Rank Two Rd' }),
  });
  const secondId = second.json.data.address.id;

  const res = await request(`/api/addresses/${secondId}/default`, {
    method: 'PATCH',
    cookie,
  });
  assert.equal(res.status, 200);
  assert.equal(res.json.data.address.isDefault, true);
  assert.notEqual(first.json.data.address.id, secondId);

  const list = await request('/api/addresses', { cookie });
  const defaultAddress = list.json.data.addresses.find((a) => a.isDefault);
  assert.equal(defaultAddress.id, secondId);
});

test('can delete an address', async () => {
  const { cookie } = await registerUser();
  const created = await request('/api/addresses', {
    method: 'POST',
    cookie,
    body: seedAddressPayload(),
  });
  const id = created.json.data.address.id;

  const res = await request(`/api/addresses/${id}`, { method: 'DELETE', cookie });
  assert.equal(res.status, 200);
  assert.equal(res.json.success, true);

  const list = await request('/api/addresses', { cookie });
  assert.equal(list.json.data.addresses.length, 0);
});

test('cannot access another user address', async () => {
  const userA = await registerUser();
  const userB = await registerUser();
  const created = await request('/api/addresses', {
    method: 'POST',
    cookie: userA.cookie,
    body: seedAddressPayload(),
  });
  const id = created.json.data.address.id;

  const res = await request(`/api/addresses/${id}`, { cookie: userB.cookie });
  assert.equal(res.status, 404);
});

test('addresses require authentication', async () => {
  const res = await request('/api/addresses');
  assert.equal(res.status, 401);
});