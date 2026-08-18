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

const Product = require('../src/models/Product');
const Notification = require('../src/models/Notification');

let productId;
let adminCookie;

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

const placeOrder = async ({ cookie, addressId, paymentMethod = 'cod' }) => {
  const res = await request('/api/orders', {
    method: 'POST',
    cookie,
    body: {
      items: [{ productId, quantity: 1, variant: null }],
      addressId,
      paymentMethod,
    },
  });
  return res;
};

const createBuyer = async () => {
  const user = await createUserWithAddress();
  const placed = await placeOrder({ cookie: user.cookie, addressId: user.addressId });
  if (placed.status !== 201) {
    throw new Error(`order failed: ${placed.status} ${JSON.stringify(placed.json)}`);
  }
  return { ...user, orderId: placed.json.data.order.id };
};

const createOnlineBuyer = async () => {
  const user = await createUserWithAddress();
  const placed = await placeOrder({ cookie: user.cookie, addressId: user.addressId, paymentMethod: 'online' });
  if (placed.status !== 201) {
    throw new Error(`order failed: ${placed.status} ${JSON.stringify(placed.json)}`);
  }
  return { ...user, orderId: placed.json.data.order.id };
};

const submitReview = ({ cookie, rating, comment = 'Great product' }) =>
  request('/api/reviews', {
    method: 'POST',
    cookie,
    body: { productId, rating, comment },
  });

const publicReviews = () => request(`/api/reviews?product=${productId}`);

const approveReview = async (cookie, reviewId) =>
  request(`/api/admin/reviews/${reviewId}/status`, {
    method: 'PATCH',
    cookie,
    body: { status: 'approved' },
  });

const getProductRating = async () => {
  const product = await Product.findById(productId).lean();
  return { rating: product.rating, reviewCount: product.reviewCount };
};

before(async () => {
  await connectTestDb();
  await startServer();
  const category = await seedCategory();
  const product = await seedProduct({ categoryId: category._id, price: 1000, stock: 100 });
  productId = String(product._id);
  const admin = await createUserWithAddress(true);
  adminCookie = admin.cookie;
});

after(async () => {
  await stopServer();
  await disconnectTestDb();
});

test('cannot review a product that was not purchased', async () => {
  const user = await registerUser();
  const res = await submitReview({ cookie: user.cookie, rating: 5 });
  assert.equal(res.status, 403);
  assert.match(res.json.message, /purchased/i);
});

test('cannot review with an unpaid online order', async () => {
  const buyer = await createOnlineBuyer();
  const res = await submitReview({ cookie: buyer.cookie, rating: 5 });
  assert.equal(res.status, 403);
});

let buyerA;

test('customer can review a purchased product (queued for moderation)', async () => {
  buyerA = await createBuyer();
  const res = await submitReview({ cookie: buyerA.cookie, rating: 5, comment: 'Amazing fit!' });
  assert.equal(res.status, 201);
  assert.equal(res.json.data.review.status, 'pending');
  assert.equal(res.json.data.review.isVerifiedPurchase, true);
  buyerA.reviewId = res.json.data.review.id;
});

test('cannot review the same product twice', async () => {
  const res = await submitReview({ cookie: buyerA.cookie, rating: 4 });
  assert.equal(res.status, 409);
  assert.match(res.json.message, /already reviewed/i);
});

test('rating and comment validation', async () => {
  const cases = [
    { rating: 6, comment: 'ok' },
    { rating: 0, comment: 'ok' },
    { rating: 2.5, comment: 'ok' },
    { rating: 5, comment: '' },
    { rating: 5, comment: 'x'.repeat(1001) },
  ];
  for (const body of cases) {
    const res = await submitReview({ cookie: buyerA.cookie, rating: body.rating, comment: body.comment });
    assert.equal(res.status, 400, `expected 400 for ${JSON.stringify(body)}`);
  }
});

test('public listing only shows approved reviews', async () => {
  const res = await publicReviews();
  assert.equal(res.status, 200);
  assert.equal(res.json.data.reviews.length, 0);
});

test('admin sees pending reviews; customers are blocked from admin routes', async () => {
  const adminList = await request(`/api/admin/reviews?status=pending`, { cookie: adminCookie });
  assert.equal(adminList.status, 200);
  assert.ok(adminList.json.data.reviews.some((r) => r.id === buyerA.reviewId));

  const denied = await request('/api/admin/reviews', { cookie: buyerA.cookie });
  assert.equal(denied.status, 403);
});

test('approving a review makes it public, updates rating and notifies the customer', async () => {
  const res = await approveReview(adminCookie, buyerA.reviewId);
  assert.equal(res.status, 200);
  assert.equal(res.json.data.review.status, 'approved');

  const list = await publicReviews();
  assert.equal(list.status, 200);
  assert.equal(list.json.data.reviews.length, 1);
  assert.equal(list.json.data.reviews[0].rating, 5);
  assert.ok(list.json.data.reviews[0].user.name);

  const { rating, reviewCount } = await getProductRating();
  assert.equal(rating, 5);
  assert.equal(reviewCount, 1);

  const notification = await Notification.findOne({
    user: buyerA.user.id,
    type: 'REVIEW',
  }).lean();
  assert.ok(notification);
  assert.match(notification.message, /live/i);
});

test('rating averages across approved reviews', async () => {
  const ratings = [5, 4, 3, 1];
  const buyers = [];
  for (const rating of ratings) {
    const buyer = await createBuyer();
    const created = await submitReview({ cookie: buyer.cookie, rating });
    assert.equal(created.status, 201);
    buyer.reviewId = created.json.data.review.id;
    buyers.push({ buyer, rating });
  }
  for (const { buyer } of buyers) {
    const approved = await approveReview(adminCookie, buyer.reviewId);
    assert.equal(approved.status, 200);
  }

  // approved ratings: 5 (buyerA), 5, 4, 3, 1 -> avg 3.6
  const { rating, reviewCount } = await getProductRating();
  assert.equal(rating, 3.6);
  assert.equal(reviewCount, 5);

  buyerA.extraReviewers = buyers;
});

test('rejecting a review hides it and recomputes the rating', async () => {
  const rejected = buyerA.extraReviewers.find((r) => r.rating === 1);
  const res = await request(`/api/admin/reviews/${rejected.buyer.reviewId}/status`, {
    method: 'PATCH',
    cookie: adminCookie,
    body: { status: 'rejected' },
  });
  assert.equal(res.status, 200);
  assert.equal(res.json.data.review.status, 'rejected');

  const list = await publicReviews();
  assert.ok(!list.json.data.reviews.some((r) => r.id === rejected.buyer.reviewId));

  // approved: 5, 5, 4, 3 -> avg 4.25 -> 4.3
  const { rating, reviewCount } = await getProductRating();
  assert.equal(rating, 4.3);
  assert.equal(reviewCount, 4);
});

test('editing own review re-queues it for moderation', async () => {
  const target = buyerA.extraReviewers.find((r) => r.rating === 5);
  const res = await request(`/api/reviews/${target.buyer.reviewId}`, {
    method: 'PATCH',
    cookie: target.buyer.cookie,
    body: { rating: 4, comment: 'Edited after purchase' },
  });
  assert.equal(res.status, 200);
  assert.equal(res.json.data.review.status, 'pending');
  assert.equal(res.json.data.review.comment, 'Edited after purchase');

  // approved: 5 (buyerA), 4 (edited), 3 -> avg 4.0
  const { rating, reviewCount } = await getProductRating();
  assert.equal(rating, 4);
  assert.equal(reviewCount, 3);
});

test('cannot edit or delete another user review', async () => {
  const target = buyerA.extraReviewers.find((r) => r.rating === 3);
  const edit = await request(`/api/reviews/${target.buyer.reviewId}`, {
    method: 'PATCH',
    cookie: buyerA.cookie,
    body: { rating: 1 },
  });
  assert.equal(edit.status, 404);

  const del = await request(`/api/reviews/${target.buyer.reviewId}`, {
    method: 'DELETE',
    cookie: buyerA.cookie,
  });
  assert.equal(del.status, 404);
});

test('customer can delete own review and rating is recomputed', async () => {
  const target = buyerA.extraReviewers.find((r) => r.rating === 4);
  const res = await request(`/api/reviews/${target.buyer.reviewId}`, {
    method: 'DELETE',
    cookie: target.buyer.cookie,
  });
  assert.equal(res.status, 200);

  // approved: 5 (buyerA), 3 -> avg 4.0
  const { rating, reviewCount } = await getProductRating();
  assert.equal(rating, 4);
  assert.equal(reviewCount, 2);
});

test('helpful vote counts and prevents duplicates', async () => {
  const voter1 = await registerUser();
  const first = await request(`/api/reviews/${buyerA.reviewId}/helpful`, {
    method: 'POST',
    cookie: voter1.cookie,
  });
  assert.equal(first.status, 200);
  assert.equal(first.json.data.helpfulCount, 1);

  const dup = await request(`/api/reviews/${buyerA.reviewId}/helpful`, {
    method: 'POST',
    cookie: voter1.cookie,
  });
  assert.equal(dup.status, 400);

  const voter2 = await registerUser();
  const second = await request(`/api/reviews/${buyerA.reviewId}/helpful`, {
    method: 'POST',
    cookie: voter2.cookie,
  });
  assert.equal(second.status, 200);
  assert.equal(second.json.data.helpfulCount, 2);
});

test('report flags a review and prevents duplicate reports', async () => {
  const reporter = await registerUser();
  const first = await request(`/api/reviews/${buyerA.reviewId}/report`, {
    method: 'POST',
    cookie: reporter.cookie,
    body: { reason: 'Inappropriate content' },
  });
  assert.equal(first.status, 200);
  assert.equal(first.json.data.reportCount, 1);

  const dup = await request(`/api/reviews/${buyerA.reviewId}/report`, {
    method: 'POST',
    cookie: reporter.cookie,
    body: { reason: 'again' },
  });
  assert.equal(dup.status, 400);

  const reported = await request('/api/admin/reviews?reported=true', { cookie: adminCookie });
  assert.equal(reported.status, 200);
  assert.ok(reported.json.data.reviews.some((r) => r.id === buyerA.reviewId));
  assert.equal(reported.json.data.reviews.find((r) => r.id === buyerA.reviewId).reportCount, 1);
});

test('admin can delete a review and rating is recomputed', async () => {
  const target = buyerA.extraReviewers.find((r) => r.rating === 3);
  const res = await request(`/api/admin/reviews/${target.buyer.reviewId}`, {
    method: 'DELETE',
    cookie: adminCookie,
  });
  assert.equal(res.status, 200);

  // approved: 5 (buyerA) only
  const { rating, reviewCount } = await getProductRating();
  assert.equal(rating, 5);
  assert.equal(reviewCount, 1);
});

test('review moderation requires admin', async () => {
  const customer = await registerUser();
  const res = await request(`/api/admin/reviews/${buyerA.reviewId}/status`, {
    method: 'PATCH',
    cookie: customer.cookie,
    body: { status: 'rejected' },
  });
  assert.equal(res.status, 403);
});
