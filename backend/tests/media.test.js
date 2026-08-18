const { test, before, after, beforeEach } = require('node:test');
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
} = require('./helpers');

const cloudinaryProvider = require('../src/services/media/cloudinary.provider');

let baseUrl;
let uploadCount = 0;
let destroyCount = 0;

// Minimal image payloads — only magic bytes are inspected by the service.
const JPEG_BUFFER = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
  0x01, 0x00, 0x00, 0x01,
]);
const PNG_BUFFER = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  0x49, 0x48, 0x44, 0x52,
]);
const WEBP_BUFFER = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.from([0x24, 0x00, 0x00, 0x00]),
  Buffer.from('WEBPVP8 '),
  Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
]);

const TEST_SECRET = 'TEST_CLOUDINARY_API_SECRET_XYZ';

const fakeCloudinary = {
  uploader: {
    upload: async (buffer, options) => {
      uploadCount += 1;
      return {
        secure_url: `https://res.cloudinary.com/${options.folder}/image/upload/v1/${options.public_id}.jpg`,
        public_id: `${options.folder}/${options.public_id}`,
        width: 1200,
        height: 1500,
        format: 'jpg',
        bytes: buffer.length,
      };
    },
    destroy: async (publicId) => {
      destroyCount += 1;
      return { result: 'ok' };
    },
  },
};

const failingCloudinary = {
  uploader: {
    upload: async () => {
      throw new Error('provider exploded');
    },
    destroy: async () => {
      throw new Error('provider exploded');
    },
  },
};

const makeForm = (buffer, { type, name = 'test.bin', folder } = {}) => {
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: type || 'image/jpeg' }), name);
  if (folder) form.append('folder', folder);
  return form;
};

const uploadRequest = async (path, { cookie, form, method = 'POST' } = {}) => {
  const options = { method };
  if (cookie) options.headers = { Cookie: cookie };
  options.body = form;
  const response = await fetch(`${baseUrl}${path}`, options);
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // non-JSON body
  }
  return { status: response.status, json, headers: response.headers };
};

before(async () => {
  process.env.MEDIA_PROVIDER = 'cloudinary';
  process.env.CLOUDINARY_CLOUD_NAME = 'test-cloud';
  process.env.CLOUDINARY_API_KEY = 'test-key';
  process.env.CLOUDINARY_API_SECRET = TEST_SECRET;
  cloudinaryProvider.__setTransport(fakeCloudinary);

  await connectTestDb();
  baseUrl = await startServer();
});

after(async () => {
  cloudinaryProvider.__setTransport(null);
  delete process.env.MEDIA_PROVIDER;
  delete process.env.CLOUDINARY_CLOUD_NAME;
  delete process.env.CLOUDINARY_API_KEY;
  delete process.env.CLOUDINARY_API_SECRET;
  await stopServer();
  await disconnectTestDb();
});

beforeEach(() => {
  uploadCount = 0;
  destroyCount = 0;
});

const registerAdmin = async () => {
  const user = await registerUser();
  await makeAdmin(user.user.id);
  return user;
};

test('unauthenticated upload returns 401', async () => {
  const res = await uploadRequest('/api/media/upload', { form: makeForm(JPEG_BUFFER) });
  assert.equal(res.status, 401);
  assert.equal(res.json.success, false);
  assert.equal(uploadCount, 0);
});

test('customer upload returns 403', async () => {
  const { cookie } = await registerUser();
  const res = await uploadRequest('/api/media/upload', { cookie, form: makeForm(JPEG_BUFFER) });
  assert.equal(res.status, 403);
  assert.equal(res.json.success, false);
  assert.equal(uploadCount, 0);
});

test('admin upload of a valid JPEG succeeds', async () => {
  const { cookie } = await registerAdmin();
  const res = await uploadRequest('/api/media/upload', {
    cookie,
    form: makeForm(JPEG_BUFFER, { name: 'photo.jpg' }),
  });
  assert.equal(res.status, 201);
  assert.equal(res.json.success, true);
  assert.ok(res.json.data.image.url.startsWith('https://res.cloudinary.com/'));
  assert.ok(res.json.data.image.publicId.startsWith('deer/products/'));
  assert.equal(res.json.data.image.width, 1200);
  assert.equal(res.json.data.image.height, 1500);
  assert.equal(res.json.data.image.format, 'jpg');
  assert.equal(typeof res.json.data.image.bytes, 'number');
  assert.equal(uploadCount, 1);
});

test('admin upload of a valid PNG succeeds', async () => {
  const { cookie } = await registerAdmin();
  const res = await uploadRequest('/api/media/upload', {
    cookie,
    form: makeForm(PNG_BUFFER, { type: 'image/png', name: 'photo.png' }),
  });
  assert.equal(res.status, 201);
  assert.equal(res.json.success, true);
  assert.ok(res.json.data.image.publicId.startsWith('deer/products/'));
});

test('admin upload of a valid WebP succeeds', async () => {
  const { cookie } = await registerAdmin();
  const res = await uploadRequest('/api/media/upload', {
    cookie,
    form: makeForm(WEBP_BUFFER, { type: 'image/webp', name: 'photo.webp' }),
  });
  assert.equal(res.status, 201);
  assert.equal(res.json.success, true);
});

test('invalid file type is rejected with 400', async () => {
  const { cookie } = await registerAdmin();
  const res = await uploadRequest('/api/media/upload', {
    cookie,
    form: makeForm(Buffer.from('%PDF-1.4 fake'), { type: 'application/pdf', name: 'doc.pdf' }),
  });
  assert.equal(res.status, 400);
  assert.equal(res.json.code, 'UNSUPPORTED_FILE_TYPE');
  assert.equal(uploadCount, 0);
});

test('oversized file is rejected with 413', async () => {
  const { cookie } = await registerAdmin();
  const big = Buffer.alloc(5 * 1024 * 1024 + 1, 0xff);
  const res = await uploadRequest('/api/media/upload', {
    cookie,
    form: makeForm(big, { type: 'image/jpeg' }),
  });
  assert.equal(res.status, 413);
  assert.equal(res.json.code, 'FILE_TOO_LARGE');
  assert.equal(uploadCount, 0);
});

test('missing file is rejected with 400', async () => {
  const { cookie } = await registerAdmin();
  const emptyForm = new FormData();
  const res = await uploadRequest('/api/media/upload', { cookie, form: emptyForm });
  assert.equal(res.status, 400);
  assert.equal(res.json.code, 'NO_FILE');
});

test('content that does not match the declared MIME type is rejected', async () => {
  const { cookie } = await registerAdmin();
  const res = await uploadRequest('/api/media/upload', {
    cookie,
    form: makeForm(Buffer.from('this is not an image at all'), {
      type: 'image/jpeg',
      name: 'fake.jpg',
    }),
  });
  assert.equal(res.status, 400);
  assert.equal(res.json.code, 'INVALID_IMAGE_CONTENT');
  assert.equal(uploadCount, 0);
});

test('unallowlisted folder is rejected with 400', async () => {
  const { cookie } = await registerAdmin();
  const res = await uploadRequest('/api/media/upload', {
    cookie,
    form: makeForm(JPEG_BUFFER, { folder: 'evil/nested/../../outside' }),
  });
  assert.equal(res.status, 400);
  assert.equal(res.json.code, 'INVALID_FOLDER');
  assert.equal(uploadCount, 0);
});

test('allowlisted custom folder is accepted', async () => {
  const { cookie } = await registerAdmin();
  const res = await uploadRequest('/api/media/upload', {
    cookie,
    form: makeForm(JPEG_BUFFER, { folder: 'deer/categories' }),
  });
  assert.equal(res.status, 201);
  assert.ok(res.json.data.image.publicId.startsWith('deer/categories/'));
});

test('unconfigured media provider returns 501 MEDIA_PROVIDER_NOT_CONFIGURED', async () => {
  const { cookie } = await registerAdmin();
  process.env.MEDIA_PROVIDER = 'dev';
  try {
    const res = await uploadRequest('/api/media/upload', {
      cookie,
      form: makeForm(JPEG_BUFFER),
    });
    assert.equal(res.status, 501);
    assert.equal(res.json.code, 'MEDIA_PROVIDER_NOT_CONFIGURED');
    assert.equal(uploadCount, 0);
  } finally {
    process.env.MEDIA_PROVIDER = 'cloudinary';
  }
});

test('missing Cloudinary credentials return 501 without leaking secrets', async () => {
  delete process.env.CLOUDINARY_API_SECRET;
  const { cookie } = await registerAdmin();
  try {
    const res = await uploadRequest('/api/media/upload', {
      cookie,
      form: makeForm(JPEG_BUFFER),
    });
    assert.equal(res.status, 501);
    assert.equal(res.json.code, 'MEDIA_PROVIDER_NOT_CONFIGURED');
    assert.equal(JSON.stringify(res.json).includes(TEST_SECRET), false);
  } finally {
    process.env.CLOUDINARY_API_SECRET = TEST_SECRET;
  }
});

test('Cloudinary upload failure returns a safe 502', async () => {
  cloudinaryProvider.__setTransport(failingCloudinary);
  const { cookie } = await registerAdmin();
  try {
    const res = await uploadRequest('/api/media/upload', {
      cookie,
      form: makeForm(JPEG_BUFFER),
    });
    assert.equal(res.status, 502);
    assert.equal(res.json.code, 'CLOUDINARY_UPLOAD_FAILED');
    assert.equal(JSON.stringify(res.json).includes(TEST_SECRET), false);
  } finally {
    cloudinaryProvider.__setTransport(fakeCloudinary);
  }
});

test('no server filesystem path is accepted', async () => {
  const { cookie } = await registerAdmin();
  const res = await request('/api/media/upload', {
    method: 'POST',
    cookie,
    body: { filePath: 'C:\\Users\\admin\\secret.jpg' },
  });
  assert.equal(res.status, 400);
  assert.equal(res.json.code, 'NO_FILE');
  assert.equal(uploadCount, 0);
});

test('uploaded url/publicId can be stored on a product', async () => {
  const { cookie } = await registerAdmin();
  const category = await seedCategory();

  const up = await uploadRequest('/api/media/upload', {
    cookie,
    form: makeForm(JPEG_BUFFER, { name: 'product.jpg' }),
  });
  assert.equal(up.status, 201);
  const { url, publicId } = up.json.data.image;

  const created = await request('/api/products', {
    method: 'POST',
    cookie,
    body: {
      name: 'Media Test Shirt',
      slug: `media-test-shirt-${Date.now()}`,
      description: 'Upload integration test product.',
      category: String(category._id),
      price: 999,
      images: [{ url, publicId, alt: 'Media test shirt', position: 0, isPrimary: true }],
    },
  });
  assert.equal(created.status, 201);
  const image = created.json.data.product.images[0];
  assert.equal(image.url, url);
  assert.equal(image.publicId, publicId);
  assert.equal(image.alt, 'Media test shirt');
  assert.equal(image.isPrimary, true);
});

test('delete requires authentication (401) and admin role (403)', async () => {
  const unauth = await uploadRequest('/api/media/deer%2Fproducts%2F123', { method: 'DELETE', form: new FormData() });
  assert.equal(unauth.status, 401);

  const { cookie } = await registerUser();
  const customer = await uploadRequest('/api/media/deer%2Fproducts%2F123', { method: 'DELETE', cookie, form: new FormData() });
  assert.equal(customer.status, 403);
});

test('admin can delete an unreferenced image', async () => {
  const { cookie } = await registerAdmin();
  const up = await uploadRequest('/api/media/upload', {
    cookie,
    form: makeForm(JPEG_BUFFER),
  });
  assert.equal(up.status, 201);
  const { publicId } = up.json.data.image;

  const encoded = encodeURIComponent(publicId);
  const res = await uploadRequest(`/api/media/${encoded}`, { method: 'DELETE', cookie, form: new FormData() });
  assert.equal(res.status, 200);
  assert.equal(res.json.success, true);
  assert.equal(destroyCount >= 1, true);
});

test('referenced product image cannot be deleted (409)', async () => {
  const { cookie } = await registerAdmin();
  const category = await seedCategory();

  const up = await uploadRequest('/api/media/upload', {
    cookie,
    form: makeForm(JPEG_BUFFER),
  });
  const { publicId } = up.json.data.image;

  const created = await request('/api/products', {
    method: 'POST',
    cookie,
    body: {
      name: 'Referenced Image Product',
      slug: `referenced-image-${Date.now()}`,
      description: 'Product that holds a media image.',
      category: String(category._id),
      price: 500,
      images: [{ url: up.json.data.image.url, publicId, position: 0, isPrimary: true }],
    },
  });
  assert.equal(created.status, 201);

  const encoded = encodeURIComponent(publicId);
  const res = await uploadRequest(`/api/media/${encoded}`, { method: 'DELETE', cookie, form: new FormData() });
  assert.equal(res.status, 409);
  assert.equal(res.json.code, 'IMAGE_IN_USE');
  assert.equal(res.json.success, false);

  // After the reference is removed from the product, delete succeeds.
  // Product create returns the raw document (uses `_id`, not serialized `id`).
  const removed = await request(`/api/products/${created.json.data.product._id}`, {
    method: 'PATCH',
    cookie,
    body: { images: [] },
  });
  assert.equal(removed.status, 200);
  assert.equal(removed.json.data.product.images.length, 0);

  const deleted = await uploadRequest(`/api/media/${encoded}`, { method: 'DELETE', cookie, form: new FormData() });
  assert.equal(deleted.status, 200);
});

test('delete of an invalid publicId returns 400', async () => {
  const { cookie } = await registerAdmin();
  const res = await uploadRequest('/api/media/%20', { method: 'DELETE', cookie, form: new FormData() });
  assert.equal(res.status, 400);
  assert.equal(res.json.code, 'INVALID_PUBLIC_ID');
});