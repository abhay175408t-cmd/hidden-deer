# Deer E-commerce — Backend Report (for Frontend Development)

Generated from the backend source in `backend/`. This is a companion to
`backend/docs/API.md` (the exact HTTP contract) — this report adds the
architecture, data shapes, business rules, and integration gotchas a frontend
team needs before writing code.

---

## 1. Overview

**"Deer"** is a fashion/clothing e-commerce REST API built with the MERN stack.

| Layer      | Tech |
| ---------- | ---- |
| Runtime    | Node.js + Express 5 |
| Database   | MongoDB + Mongoose 9 |
| Auth       | JWT (HS256) in an **HttpOnly cookie** |
| Payments   | Razorpay (order creation, signature + webhook verification) |
| Email      | Nodemailer (SMTP or dev "log" provider) with retry + logs |
| Media      | Cloudinary (optional; effectively not usable out-of-the-box — see §8) |
| Security   | helmet, CORS allow-list, rate limiting (production only), request IDs |
| Tests      | Node built-in test runner (`npm test`), ~9 suites |

### Run it

```bash
cd backend
npm install
copy .env.example .env   # fill in values
npm run dev              # http://localhost:5000
```

- `npm run create:admin` creates an admin user from `ADMIN_*` env vars
  (development only).
- Server refuses to boot if `JWT_SECRET` is missing (`src/config/env.js`).
- Payments are opt-in: with `RAZORPAY_ENABLED` unset/false, payment endpoints
  return `503` and the rest of the app works normally.

### Folder layout

```
backend/src/
  app.js            Express app, middleware + route mounting
  server.js         Bootstrapping (env validation, DB connect, graceful shutdown)
  config/           env, cors, rateLimit, db, constants, notification.constants
  routes/           Per-domain routers (public, customer, admin variants)
  controllers/      Thin HTTP layer (parse request, call service, serialize response)
  services/         Business logic (pricing, coupons, orders, payments, notifications)
  models/           Mongoose schemas (14 models)
  middleware/       auth (protect), admin (adminOnly), error handler, requestId, 404
  utils/            pricing, shipping, inventory, payment, token, transactions
  templates/email/  HTML email templates (11)
scripts/            createAdmin.js, migrateProductImages.js
tests/              Node test-runner suites + helpers.js
```

---

## 2. Global Conventions (read this first)

### 2.1 Authentication — cookie-based, NOT bearer tokens

- `POST /api/auth/login` and `POST /api/auth/register` set an `auth_token`
  HttpOnly cookie (`SameSite=Lax`, `Secure` in production, 7 days).
- All authenticated routes read the cookie only (`src/middleware/auth.middleware.js`).
  **There is no Authorization header.**
- **Frontend requirement:** every fetch/XHR must use `credentials: "include"`
  (fetch) or `withCredentials: true` (axios). The cookie is sent automatically
  after that — no token storage, no interceptor logic needed.
- The cookie is refreshed only by logging in again. If the token expires you get
  `401 { success:false, message:"Not authorized, invalid or expired token" }`.
- Roles: `customer` (default) and `admin`. Admin routes return `403` for
  customers. There is no endpoint to change a user's role from the API — admins
  are created via `npm run create:admin`.

### 2.2 Response envelope

Success: `{ success: true, message?: string, data: {...} }`
Error:

```json
{
  "success": false,
  "message": "human-readable, show it directly in the UI",
  "code": "INVALID_ID | VALIDATION_ERROR | DUPLICATE_KEY | ... (optional)",
  "errors": [{ "field": "...", "message": "..." }] (validation only),
  "requestId": "uuid",
  "timestamp": "ISO"
}
```

`stack` is included in development only. Every response has an
`x-request-id` header — echo it in bug reports / support forms.

### 2.3 Pagination shape (all list endpoints)

```json
{ "page": 1, "limit": 10, "total": 42, "totalPages": 5,
  "hasNextPage": true, "hasPreviousPage": false }
```

Endpoints: products, reviews (public/mine/admin), orders (user/admin),
notifications (user/admin), coupons (admin), email logs (admin).

### 2.4 HTTP status codes you'll see

| Code | Meaning |
| ---- | ------- |
| 400  | Validation / bad request (message explains why) |
| 401  | Not authenticated (missing/expired cookie) |
| 403  | Authenticated but not allowed (customer on admin route, review without purchase) |
| 404  | Resource not found |
| 409  | Conflict: duplicate (email, slug, coupon code, review, wishlist item), stock race, already-used coupon |
| 413  | JSON body > 1 MB |
| 429  | Rate limited (**production only**; dev/test are unbounded) |
| 501  | Media provider not configured |
| 502  | Razorpay upstream failure |
| 503  | Payments disabled (Razorpay not configured) |

### 2.5 CORS

- Allowed origins: comma-separated `ALLOWED_ORIGINS`, else `CLIENT_URL`,
  default `http://localhost:5173` (Vite default).
- `credentials: true`, methods GET/POST/PUT/PATCH/DELETE/OPTIONS.
- **Frontend must run on an allowed origin**, or every request fails with a
  `403 CORS_DENIED` error.

### 2.6 Money

- Currency is **INR** throughout.
- All API amounts are in **rupees** (numbers, 2 decimals) EXCEPT
  `POST /api/payments/create` where `data.payment.amount` is in **paise**
  (integer) for the Razorpay Checkout API.
- Server always recomputes prices/discounts/totals — client-supplied price
  fields are ignored. Never trust client cart totals for checkout.

### 2.7 Rate limiting (production only)

General API 300/15min, auth 20/15min, admin 100/15min, coupon validate
30/15min, review submit 20/15min. Health + webhook are exempt. In dev these are
effectively disabled — no need to code around them.

---

## 3. Domain Overview & Suggested Frontend Pages

| Backend domain | Maps to frontend pages |
| -------------- | ---------------------- |
| Health | (ops only, not UI) |
| Auth | Login, Register, Logout, "Who am I" (session restore) |
| Categories | Nav bar, category landing pages |
| Products | Home (featured/new/bestsellers), category/shop listing with filters, product detail, search results |
| Media | Admin product image management (backend-side only — see §8) |
| Cart | Cart drawer/page |
| Wishlist | Wishlist page + heart icons on product cards |
| Addresses | Address book, checkout address step |
| Checkout & Orders | Checkout, order preview, order confirmation, order history, order detail, cancel flow |
| Payments | Razorpay Checkout integration + payment status screen |
| Coupons | Promo-code input at checkout |
| Reviews | Product page reviews, "my reviews", helpful/report buttons |
| Notifications | Notification bell/dropdown, notification preferences |
| Admin: orders/coupons/reviews/emails | Admin dashboard pages |

No guest cart / guest checkout — cart, wishlist, and checkout all require
authentication.

---

## 4. Complete Endpoint Inventory

Base: `http://localhost:5000/api`

### 4.1 Public (no auth)

| Method | Path | Notes |
| ------ | ---- | ----- |
| GET | `/health` | `{ success, message, environment, timestamp }` |
| GET | `/health/ready` | 200 when DB connected, 503 otherwise; `{ status, database, uptime }` |
| GET | `/` | API banner |
| GET | `/products` | Search/filter/list, paginated |
| GET | `/products/filters` | Facet values: categories, sizes, colors, brands, gender, price min/max |
| GET | `/products/:slug` | Product detail (slug, **not** id) |
| GET | `/categories` | Active categories, sorted by name |
| GET | `/categories/:slug` | Category by slug |
| GET | `/reviews?product=<productId>&page&limit` | **Approved only** |
| POST | `/payments/webhook` | Razorpay → server only; do not call from the browser |

### 4.2 Auth

| Method | Path | Body | Result |
| ------ | ---- | ---- | ------ |
| POST | `/auth/register` | `{ name, email, password (min 8), phone? }` | 201, sets cookie, `{ user: { id, name, email, role } }`; 409 if email taken |
| POST | `/auth/login` | `{ email, password }` | 200, sets cookie, same `user` shape |
| POST | `/auth/logout` | — | clears cookie |
| GET | `/auth/me` | — | current user |

> No profile-update, password-change, or password-reset endpoints exist.

### 4.3 Products — `GET /products` query params

| Param | Type | Notes |
| ----- | ---- | ----- |
| `page`, `limit` | int | limit 1..100, default 20 |
| `search` | string | matches name, description, brand, tags (max 100 chars) |
| `category` | string | **comma-separated category slugs** (e.g. `?category=men,tshirts`). ObjectIds are NOT accepted on this route |
| `minPrice`, `maxPrice` | number | effective price range (0..1,000,000) |
| `size`, `color` | string | comma-separated exact values; matches `sizes`/`variants.size`, `colors`/`variants.color` |
| `brand` | string | comma-separated exact brands |
| `gender` | string | ⚠️ vestigial — the Product model has **no gender field**; using it filters to zero results (see §10) |
| `minDiscount` | number | 0..100, percent off |
| `minRating` | number | 0..5 |
| `inStock` | `true`/`false` | stock > 0 (variant-aware) |
| `sort` | enum | `newest` (default), `price_asc`, `price_desc`, `name_asc`, `name_desc`, `rating_desc`, `discount_desc`, `popular` |

List item shape (note: **no description, no variants, no stock number**):

```json
{
  "id": "...", "name": "...", "slug": "...",
  "price": 1299, "discountPrice": 999,
  "image": { "url": "...", "alt": null },
  "colors": ["Black"], "sizes": ["M", "L"],
  "rating": 4.3, "reviewCount": 5,
  "stockStatus": "in_stock | low_stock | out_of_stock",
  "isFeatured": false, "isNew": true, "isBestSeller": false
}
```

`GET /products/filters` returns:

```json
{ "categories": [{ "name": "...", "slug": "..." }],
  "sizes": ["M","L"], "colors": ["Black"], "brands": ["..."] ,
  "gender": [], "price": { "min": 199, "max": 4999 } }
```

### 4.4 Product detail — `GET /products/:slug`

Full product incl. `description`, `brand`, `category` (**populated category
object**), all `images` (`{ url, publicId, alt, position, isPrimary }`), all
`variants` (`{ _id, color, size, sku, price, discountPrice, stock, images }`),
`stock` (aggregate number), `stockStatus`, `tags`, `sku`.

**Variants matter:** products with variants require the frontend to pick a
variant (color+size) before adding to cart — each variant has its own price,
stock, and images.

### 4.5 Cart (auth)

| Method | Path | Body |
| ------ | ---- | ---- |
| GET | `/cart` | — |
| POST | `/cart/items` | `{ productId, variantId?, quantity }` — variantId required if the product has variants |
| PATCH | `/cart/items/:itemId` | `{ quantity }` |
| DELETE | `/cart/items/:itemId` | — |
| DELETE | `/cart` | — |

Cart response `data.cart`:

```json
{
  "items": [{
    "id": "cart item id",
    "product": { "id": "...", "name": "...", "slug": "...", "isActive": true, "image": { "url": "...", "alt": null } },
    "variant": { "id": "...", "color": "Black", "size": "M", "sku": "..." } | null,
    "selectedColor": "Black" | null, "selectedSize": "M" | null,
    "quantity": 2,
    "priceAtAddition": 999, "currentPrice": 999, "lineTotal": 1998,
    "priceChanged": false, "previousPrice": 999,
    "available": true, "availableStock": 10,
    "stockStatus": "in_stock | low_stock | out_of_stock"
  }],
  "subtotal": 1998, "itemCount": 2, "totalQuantity": 3
}
```

Frontend notes:
- `subtotal` only counts **available** items.
- `priceChanged` (current ≠ at-addition) should trigger a "price updated"
  notice; `available: false` items should be flagged with `availableStock` and
  `stockStatus`.
- No cart exists for a new user → empty cart object (not 404).

### 4.6 Wishlist (auth)

| Method | Path | Body |
| ------ | ---- | ---- |
| GET | `/wishlist` | — |
| POST | `/wishlist/items` | `{ productId }` (409 if already added) |
| DELETE | `/wishlist/items/:productId` | — |

Response `data.wishlist`: `{ products: [...], itemCount }` where each product
has `{ id, name, slug, image, price, discountPrice, colors, sizes, rating,
reviewCount, stockStatus, isActive, available, availableStock, addedAt }`.

### 4.7 Addresses (auth, ownership enforced)

| Method | Path | Notes |
| ------ | ---- | ----- |
| GET | `/addresses` | sorted: defaults first, then newest |
| POST | `/addresses` | create; first address auto-becomes default |
| GET | `/addresses/:id` | — |
| PATCH | `/addresses/:id` | partial update |
| DELETE | `/addresses/:id` | deletes; no auto-promotion of a new default |
| PATCH | `/addresses/:id/default` | sets default (unsets others) |

Body fields: `{ fullName, phone (10-15 digits/+), addressLine1, addressLine2?,
city, state, postalCode (6-digit Indian PIN — regex enforced), country
(default "India"), landmark?, addressType: home|work|other, isDefault? }`

### 4.8 Checkout & Orders (auth)

| Method | Path | Body |
| ------ | ---- | ---- |
| POST | `/orders/preview` | `{ items: [{ productId, quantity, variant? }], couponCode? }` |
| POST | `/orders` | `{ items, addressId, couponCode?, paymentMethod: "cod" | "online" }` |
| GET | `/orders?page&limit` | my orders, newest first |
| GET | `/orders/:id` | one order |
| DELETE | `/orders/:id/cancel` | `{ reason? }` — see cancel rules |

Preview response `data`:

```json
{ "baseAmount": 2000, "couponDiscount": 100, "discountAmount": 0,
  "shippingFee": 99, "codFee": 0, "totalPayable": 1999 }
```

Shipping rule: **free above ₹1,999, else flat ₹99** (computed after coupon).
(`codFee` is defined as ₹49 in utils but is currently hardcoded to 0.)

Order response `data.order`:

```json
{
  "id": "...", "orderNumber": "ORD-20260813-123456",
  "items": [{ "product": "id", "title": "...", "image": "url|null", "price": 1000, "mrp": 1299, "quantity": 2, "variant": "Black-M|null" }],
  "totals": { "subtotal": 2000, "couponDiscount": 100, "discountAmount": 0, "shippingFee": 99, "codFee": 0, "total": 1999 },
  "paymentMethod": "cod|online",
  "paymentStatus": "pending|paid|failed|refunded",
  "orderStatus": "pending|confirmed|shipped|delivered|cancelled",
  "coupon": "id|null", "shippingAddress": { "fullName", "phone", "addressLine1", "addressLine2|null", "city", "state", "postalCode", "country" },
  "estimatedDelivery": "ISO (placed + 7 days)", "placedAt": "ISO",
  "cancelledAt": null, "cancelReason": null, "deliveredAt": null,
  "createdAt": "ISO"
}
```

Order lifecycle:
- **COD:** placed → `confirmed` immediately.
- **Online:** placed → `pending` (orderStatus) until payment captured, then
  admin moves it `confirmed → shipped → delivered` (or cancels).
- **Cancel rules:** only `pending`/`confirmed` orders; an online order still
  `pending` payment **cannot** be cancelled by the user (error message says
  contact support). Cancelling a paid order flips paymentStatus to `refunded`,
  restores stock, releases the coupon.
- Cancelled orders can never change status again.

**Recommended flow for checkout:** cart → preview (`/orders/preview`, pass the
cart items + coupon) → show totals → address step → place order → if
`paymentMethod: "online"` run Razorpay Checkout (§4.9) → verify.

### 4.9 Payments (auth)

| Method | Path | Body / notes |
| ------ | ---- | ------------ |
| POST | `/payments/create` | `{ orderId }` → creates (or reuses) a Razorpay order; **503 if Razorpay disabled** |
| POST | `/payments/verify` | `{ orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature }` |
| GET | `/payments/order/:orderId` | payment record for an order |

`create` response `data.payment`:

```json
{ "keyId": "rzp_test_...", "razorpayOrderId": "order_...",
  "orderId": "...", "amount": 109900, "currency": "INR", "status": "created" }
```

**Payment integration recipe (frontend):**
1. Place order with `paymentMethod: "online"` → get `order.id`.
2. `POST /payments/create` → get `keyId` + `razorpayOrderId` + `amount` (paise).
3. Load Razorpay Checkout JS (`https://checkout.razorpay.com/v1/checkout.js`)
   and open with `key`, `order_id`, `amount`, `currency`, handler that receives
   `razorpay_payment_id`, `razorpay_order_id`, `razorpay_signature`.
4. In the success handler call `POST /payments/verify` with those 3 values +
   `orderId`; response confirms `paymentStatus: "paid"`.
5. Poll `GET /payments/order/:orderId` for status updates (also updated via
   webhook server-side).

Payment statuses (payment record): `created | pending | authorized | captured |
failed | refunded`.

### 4.10 Coupons (auth)

| Method | Path | Body |
| ------ | ---- | ---- |
| POST | `/coupons/validate` | `{ code, items: [{productId, quantity, variant?}] }` |

Response `data`:

```json
{ "code": "SAVE100", "description": "...", "discountType": "fixed|percent",
  "discountValue": 100, "maxDiscount": null, "minCartValue": null,
  "expiresAt": null, "eligibleSubtotal": 2000, "discount": 100 }
```

Errors are 400s with a display-ready message ("Coupon has expired",
"Coupon already used by you", "requires a minimum order value of ₹500", ...).
Non-stackable (one coupon per order). Usage is consumed at order time and
released on cancellation.

### 4.11 Reviews

Public: `GET /reviews?product=<productId>&page&limit` — approved only:

```json
{ "reviews": [{ "id": "...", "rating": 5, "comment": "...",
    "isVerifiedPurchase": true, "helpfulCount": 2,
    "createdAt": "ISO", "updatedAt": "ISO",
    "user": { "id": "...", "name": "Buyer" } }], "pagination": {...} }
```

Customer (auth):

| Method | Path | Body |
| ------ | ---- | ---- |
| POST | `/reviews` | `{ productId, rating (int 1-5), comment (≤1000 chars) }` → 201, status `pending` |
| GET | `/reviews/mine?page&limit` | all statuses, includes `product`, `order`, `status`, `editedAt` |
| PATCH | `/reviews/:id` | `{ rating?, comment? }` — re-queued for moderation |
| DELETE | `/reviews/:id` | — |
| POST | `/reviews/:id/helpful` | upvote; duplicate → 400 |
| POST | `/reviews/:id/report` | `{ reason? (≤300) }`; duplicate → 400 |

Rules the UI must respect:
- **Only purchasers can review** (non-cancelled order containing the product;
  online orders must be paid) → 403 otherwise. Enable the review UI only for
  purchased products (check order items).
- One review per user per product → 409.
- New/edited reviews are `pending` and invisible publicly until an admin
  approves. "Your review is pending moderation" messaging is important.
- `product.rating` / `reviewCount` are aggregates of approved reviews only,
  rounded to 1 decimal.

### 4.12 Notifications (auth)

| Method | Path | Notes |
| ------ | ---- | ----- |
| GET | `/notifications?page&limit&unreadOnly=true` | own notifications |
| GET | `/notifications/unread-count` | `{ unreadCount }` |
| GET | `/notifications/preferences` | 7 boolean flags |
| PATCH | `/notifications/preferences` | partial update; only boolean values accepted |
| PATCH | `/notifications/read-all` | `{ updatedCount }` |
| PATCH | `/notifications/:id/read` | single |
| DELETE | `/notifications/:id` | — |

Notification shape:

```json
{ "id": "...", "type": "ORDER|PAYMENT|SHIPPING|DELIVERY|REFUND|REVIEW|ACCOUNT|PROMOTION",
  "title": "...", "message": "...", "data": { "orderId": "...", "orderNumber": "..." },
  "isRead": false, "readAt": null, "createdAt": "ISO", "updatedAt": "ISO" }
```

Preferences defaults: email order/payment/shipping/review updates `true`;
email promotions + in-app promotions `false`.

> No WebSocket/SSE — the frontend must poll unread-count (e.g. on an interval
> or on route change).

### 4.13 Admin (all require admin role → 403 otherwise; rate limited)

| Method | Path | Notes |
| ------ | ---- | ----- |
| GET | `/admin/orders?status&paymentStatus&search&page&limit` | all orders; each includes `user: {id,name,email}` and `payments: [...]` |
| PATCH | `/admin/orders/:id/status` | `{ status }`; statuses `pending|confirmed|shipped|delivered|cancelled` |
| GET | `/admin/coupons?page&limit&isActive&search` | list with usage stats |
| POST | `/admin/coupons` | create coupon (see payload in §6) |
| GET | `/admin/coupons/:id` | — |
| PATCH | `/admin/coupons/:id` | partial update |
| DELETE | `/admin/coupons/:id` | **deactivates** (isActive=false), not hard delete |
| GET | `/admin/reviews?status&product&reported&page&limit` | incl. pending/rejected; `reported=true` filters reports |
| PATCH | `/admin/reviews/:id/status` | `{ status: "approved"|"rejected" }` |
| DELETE | `/admin/reviews/:id` | hard delete |
| GET | `/admin/notifications` | the **admin's own** notifications (same shape as user) |
| GET | `/admin/emails?status&type&page&limit` | email delivery logs |
| POST | `/admin/emails/:id/retry` | retry a failed email |
| POST | `/products` · PATCH `/products/:id` · DELETE `/products/:id` | product CRUD (create requires name, slug, description, category; category = ObjectId **or slug**; DELETE = deactivate) |
| POST | `/categories` · PATCH `/categories/:id` · DELETE `/categories/:id` | category CRUD (slug unique; DELETE = deactivate) |
| POST | `/media/upload` | ⚠️ server-side path upload, see §8 |
| DELETE | `/media/:publicId` | Cloudinary delete |

Coupon create/update payload:

```json
{ "code": "WELCOME10",              // 3-20 chars: A-Z, 0-9, dashes (uppercased)
  "description": "...",
  "discountType": "percent|fixed",  // default fixed
  "discountValue": 10,              // percent: 1-100; fixed: ≥1
  "maxDiscount": 150,               // percent cap, null = none
  "minCartValue": 500,              // null = none
  "firstOrderOnly": true,
  "applicableProducts": [], "applicableCategories": [],
  "excludedProducts": [], "excludedCategories": [],
  "expiresAt": "2026-12-31T23:59:59.000Z" | null,
  "usageLimit": 100 | null, "isActive": true }
```

---

## 5. Pricing & Stock Rules (single source of truth = server)

- Effective price = `discountPrice` when present, > 0 and ≤ `price`, else
  `price`. Variant price overrides product price when the variant defines one.
  (`src/utils/pricing.util.js`)
- Stock: if a product has variants, total stock = sum of variant stocks;
  otherwise the product `stock` field. (`src/utils/inventory.util.js`)
- `stockStatus`: `out_of_stock` (0), `low_stock` (≤5, `LOW_STOCK_THRESHOLD`),
  `in_stock`.
- Cart line price at addition is snapshotted; `priceChanged` flags drift.
- Checkout/orders always recompute prices, coupon discount, shipping, totals.

## 6. Data Models (for typing the API client)

14 models in `src/models/`:

| Model | Key fields |
| ----- | ---------- |
| User | name, email (unique), password (bcrypt, select:false), phone, role (customer/admin), avatar, addresses[] (embedded) |
| Category | name, slug (unique), description, image, isActive |
| Product | name, slug (unique), description, category (ref), brand, price, discountPrice, images[] (url/publicId/alt/position/isPrimary), colors[], sizes[], variants[] (color,size,sku,price,discountPrice,stock,images), stock, sku (unique sparse), tags[], isFeatured, isNew, isBestSeller, rating, reviewCount, isActive |
| Cart | user (unique), items[] (product, variantId, quantity, selectedColor, selectedSize, priceAtAddition) |
| Wishlist | user (unique), products[] (product, addedAt) |
| Address | user, fullName, phone, addressLine1/2, city, state, postalCode (6-digit PIN), country, landmark, addressType, isDefault |
| Order | orderNumber (unique), user, items[] (snapshot: product,title,image,price,mrp,quantity,variant), subtotal, discountAmount, couponDiscount, shippingFee, codFee, total, paymentMethod, paymentStatus, orderStatus, coupon, shippingAddress (snapshot), deliveryDays, estimatedDelivery, placedAt, cancelledAt, cancelReason, deliveredAt |
| Payment | order, user, provider (razorpay), providerOrderId (unique), providerPaymentId, amount, currency (INR), status (created/pending/authorized/captured/failed/refunded), method, failureReason, signatureVerified, webhookVerified, metadata |
| Coupon | code (unique), description, discountType, discountValue, maxDiscount, minCartValue, firstOrderOnly, applicableProducts/Categories, excludedProducts/Categories, expiresAt, usageLimit, usageCount, usedBy[], isActive |
| Review | user, product, order (purchase verification), rating (1-5), comment (≤1000), status (pending/approved/rejected), isVerifiedPurchase, helpful[], helpfulCount, reports[] (user,reason), reportCount, editedAt; unique (user, product) |
| Notification | user, type (8 enum values), title, message, data (Mixed), key (unique idempotency), isRead, readAt |
| NotificationPreference | user (unique), 7 boolean flags |
| EmailLog | user?, order?, type, key (unique), recipient, subject, html (select:false), provider, status (queued/sending/sent/failed), providerMessageId, attempts, lastError, nextRetryAt, sentAt |
| WebhookEvent | provider, eventId (unique with provider), eventType, processed, payloadHash, receivedAt, processedAt |

## 7. Error Handling Behavior

- Validation errors → 400 with `errors: [{field, message}]`.
- Duplicate keys (email/slug/coupon code/unique index) → 409.
- Stock races → 409 "Only X items are available".
- All `message` strings are user-displayable English — surface them directly
  with the appropriate status-based styling.

## 8. Known Gaps & Caveats (important before you build)

1. **Media upload now works from the browser.** `POST /api/media/upload`
   accepts **multipart/form-data** with a single `file` field (JPEG/PNG/WebP,
   max 5 MB), requires admin auth, validates MIME + magic bytes, and returns
   `{ url, publicId, width, height, format, bytes }` from Cloudinary. The old
   server-side `filePath` contract was removed — sending `{ filePath: ... }`
   returns `400 NO_FILE`. Folder is optional and allowlisted
   (`deer/products` default, `deer/categories`, `deer/misc`). Delete via
   `DELETE /api/media/:publicId` (URL-encode the id); images referenced by a
   product return `409 IMAGE_IN_USE` until removed from the product. Requires
   `MEDIA_PROVIDER=cloudinary` + `CLOUDINARY_*` credentials, otherwise `501`.
   Use the returned `url`/`publicId` directly in product create/update
   `images` arrays (`{ url, publicId, alt, position, isPrimary }`).
2. **`gender` filter is vestigial.** The search service filters on a
   `gender` field that doesn't exist on the Product model; `gender` in
   `GET /products/filters` always returns `[]`. Don't build gender facets
   unless the backend is extended.
3. **No guest checkout, no cart persistence across devices** (cart is a single
   doc per user), no order tracking numbers, no returns/refund-request flow,
   no user profile/avatar upload, no password reset.
4. **Payments require Razorpay test keys**; without them `/payments/*` → 503.
5. **Emails are logs in dev** (`EMAIL_ENABLED` unset); admin email logs + retry
   endpoints are for ops.
6. **Webhook endpoint** is for Razorpay only — never call it from the frontend.
7. **`DELETE` on products/categories/coupons = deactivate** (soft), so admin
   lists should show active/inactive states.
8. **Order cancellation of an unpaid online order is blocked** — the error
   tells users to contact support (there's no support channel in the API).

## 9. Frontend Integration Checklist

- [ ] Axios/fetch with `credentials: "include"` on every request.
- [ ] Login/register → backend sets cookie; call `GET /auth/me` on app load to
      restore session (401 → logged out state).
- [ ] 401 interceptor → redirect to login; 403 → route guard for admin area.
- [ ] Parse `success/message/code/errors/requestId` uniformly; show `message`.
- [ ] Use server cart as source of truth (subtotal, availability, priceChanged).
- [ ] Product detail: if `variants.length > 0`, require variant selection;
      variant has its own price/stock/images.
- [ ] Checkout: preview → place → (online) Razorpay Checkout → verify →
      success screen with order number + estimated delivery.
- [ ] Free shipping threshold ₹1,999 — show progress on cart/checkout.
- [ ] Reviews: pending-moderation UX; only enable for purchased products;
      show "verified purchase" badge from `isVerifiedPurchase`.
- [ ] Notifications: poll `unread-count`; preferences page for the 7 flags.
- [ ] Admin: order status stepper (pending → confirmed → shipped → delivered),
      review moderation queue, coupon CRUD (remember: delete = deactivate),
      email logs with retry.
- [ ] Standard pagination component for all list endpoints.

## 10. Tests

`npm test` runs 9 suites (security, reviews, race, payment, order, notification,
coupons, address, helpers) with Node's built-in runner. Payment tests inject a
fake Razorpay transport (`razorpayService.__setInstance`). Frontend devs can
rely on the contract being covered, e.g. race tests cover stock/coupon
concurrency.