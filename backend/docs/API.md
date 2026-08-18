# Deer E-commerce API — Frontend Contract

Base URL (development): `http://localhost:5000/api`

This document is the single source of truth for the backend HTTP contract used
by the frontend. It was generated from the actual route tables in `src/routes/`
so every endpoint listed here exists and is tested.

---

## Conventions

### Authentication

- Sessions are **cookie-based**. `POST /api/auth/login` and
  `POST /api/auth/register` set an `auth_token` HttpOnly cookie.
- Authenticated endpoints return `401` when the cookie is missing, expired or
  invalid. Cookie is sent automatically by browsers (no Authorization header).
- Roles: `customer` (default) and `admin`.

### Response envelope

Success:

```json
{ "success": true, "message": "optional human message", "data": { ... } }
```

Error:

```json
{
  "success": false,
  "message": "human readable message",
  "code": "optional machine code (e.g. INVALID_ID, VALIDATION_ERROR)",
  "errors": "optional field errors array",
  "requestId": "optional x-request-id echo",
  "timestamp": "optional ISO timestamp",
  "stack": "stack trace (development only)"
}
```

### Pagination

List endpoints return the same `data.pagination` shape:

```json
{
  "page": 1,
  "limit": 10,
  "total": 42,
  "totalPages": 5,
  "hasNextPage": true,
  "hasPreviousPage": false
}
```

### Request ID

Every response carries `x-request-id`. Include it when reporting bugs.

### Common HTTP status codes

| Code | Meaning |
| ---- | ------- |
| 400  | Validation / bad request |
| 401  | Not authenticated |
| 403  | Authenticated but not authorized (customer hitting admin route) |
| 404  | Resource not found |
| 409  | Conflict (duplicate, stock race, already used) |
| 413  | Body too large (limit 1 MB) |
| 429  | Rate limited (production only) |
| 501  | Media provider not configured |
| 503  | Payment provider not configured |

---

## PUBLIC endpoints (no auth)

### System

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/api/health` | Liveness probe |
| GET | `/api/health/ready` | Readiness probe (DB connectivity) |
| GET | `/` | API banner |

### Catalog

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/api/products` | List products (filters + pagination) |
| GET | `/api/products/filters` | Available filter values |
| GET | `/api/products/:slug` | Product detail by slug |
| GET | `/api/categories` | Active categories |
| GET | `/api/categories/:slug` | Category by slug |

### Reviews

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/api/reviews?product=<productId>` | **Approved** reviews for a product (pagination) |

### Payments

| Method | Path | Description |
| ------ | ---- | ----------- |
| POST | `/api/payments/webhook` | Razorpay webhook (signed, JSON body, no auth) |

---

## PRODUCT LISTING — `GET /api/products`

Query params:

| Param | Type | Description |
| ----- | ---- | ----------- |
| `page` | int | 1-based page (default 1) |
| `limit` | int | 1..100 (default 20) |
| `search` | string | matches name, description, brand, tags |
| `category` | slug or ObjectId | filter by category |
| `minPrice` / `maxPrice` | number | price range (effective price) |
| `size` | string | exact size in `sizes` or `variants.size` |
| `color` | string | exact color in `colors` or `variants.color` |
| `brand` | string | exact brand |
| `featured` | `true` | only featured |
| `new` | `true` | only new arrivals |
| `bestSeller` | `true` | only best sellers |
| `sort` | enum | `newest` (default), `price_asc`, `price_desc`, `rating`, `popular` |

Response `data`:

```json
{
  "products": [
    {
      "id": "…", "name": "…", "slug": "…",
      "price": 1299, "discountPrice": 999,
      "image": { "url": "…", "alt": null, "isPrimary": true },
      "colors": ["Black"], "sizes": ["M", "L"],
      "rating": 4.3, "reviewCount": 5,
      "stockStatus": "in_stock | low_stock | out_of_stock",
      "isFeatured": false, "isNew": true, "isBestSeller": false
    }
  ],
  "pagination": { "...": "standard shape above" }
}
```

---

## AUTH

| Method | Path | Auth | Body / notes |
| ------ | ---- | ---- | ------------ |
| POST | `/api/auth/register` | — | `{ name, email, password, phone? }` → `201` sets cookie |
| POST | `/api/auth/login` | — | `{ email, password }` → `200` sets cookie |
| POST | `/api/auth/logout` | — | clears cookie → `200` |
| GET | `/api/auth/me` | ✅ | returns current user `{ user }` |

`register`/`login` are rate limited (default 20 / 15 min in production).

---

## CART — all require auth

| Method | Path | Body | Description |
| ------ | ---- | ---- | ----------- |
| GET | `/api/cart` | — | Full cart with server-priced line totals |
| POST | `/api/cart/items` | `{ productId, variantId?, quantity }` | Add item (variant required if product has variants) |
| PATCH | `/api/cart/items/:itemId` | `{ quantity }` | Update quantity |
| DELETE | `/api/cart/items/:itemId` | — | Remove item |
| DELETE | `/api/cart` | — | Clear cart |

Cart response `data.cart`:

```json
{
  "items": [{
    "id": "…", "product": { "id": "…", "name": "…", "image": "…" },
    "variant": { "id": "…", "color": "Black", "size": "M" } | null,
    "quantity": 2, "price": 999, "lineTotal": 1998,
    "available": true, "stock": 10
  }],
  "subtotal": 1998, "itemCount": 1, "totalQuantity": 2
}
```

---

## WISHLIST — all require auth

| Method | Path | Body | Description |
| ------ | ---- | ---- | ----------- |
| GET | `/api/wishlist` | — | List wishlist products |
| POST | `/api/wishlist/items` | `{ productId }` | Add (409 if already present) |
| DELETE | `/api/wishlist/items/:productId` | — | Remove |

---

## ADDRESSES — all require auth (ownership enforced)

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/api/addresses` | List my addresses |
| POST | `/api/addresses` | Create |
| GET | `/api/addresses/:id` | Get one |
| PATCH | `/api/addresses/:id` | Update |
| DELETE | `/api/addresses/:id` | Delete |
| PATCH | `/api/addresses/:id/default` | Set as default |

Create body:

```json
{
  "fullName": "Test User", "phone": "9876543210",
  "addressLine1": "42 Test Street", "addressLine2": "Second Floor",
  "city": "Mumbai", "state": "Maharashtra", "postalCode": "400001",
  "country": "India", "addressType": "home", "isDefault": false
}
```

---

## ORDERS & CHECKOUT — all require auth (ownership enforced)

| Method | Path | Body | Description |
| ------ | ---- | ---- | ----------- |
| POST | `/api/orders/preview` | `{ items, couponCode? }` | Server price + shipping + discount preview |
| POST | `/api/orders` | `{ items, addressId, couponCode?, paymentMethod }` | Place order (`cod` or `online`) → `201` |
| GET | `/api/orders` | `?page&limit` | My orders |
| GET | `/api/orders/:id` | — | One order |
| DELETE | `/api/orders/:id/cancel` | `{ reason? }` | Cancel pending/confirmed order; restores stock & coupon |

`items`:

```json
[{ "productId": "…", "quantity": 2, "variant": null }]
```

Preview response `data`:

```json
{
  "baseAmount": 2000,
  "couponDiscount": 100,
  "discountAmount": 0,
  "shippingFee": 99,
  "codFee": 0,
  "totalPayable": 1999
}
```

Order response `data.order`:

```json
{
  "id": "…", "orderNumber": "ORD-20260813-123456",
  "items": [{ "product": "…", "title": "…", "image": "…", "price": 1000, "mrp": 1299, "quantity": 2, "variant": null }],
  "totals": { "subtotal": 2000, "couponDiscount": 100, "discountAmount": 0, "shippingFee": 99, "codFee": 0, "total": 1999 },
  "paymentMethod": "cod", "paymentStatus": "pending|paid|failed|refunded",
  "orderStatus": "pending|confirmed|shipped|delivered|cancelled",
  "coupon": "coupon id or null",
  "shippingAddress": { "...": "snapshot" },
  "estimatedDelivery": "ISO date", "placedAt": "ISO date",
  "cancelledAt": null, "cancelReason": null, "deliveredAt": null
}
```

> Server-side pricing: price, discount and totals are always recomputed on the
> server. Client-supplied price fields are ignored.

---

## COUPONS — all require auth

| Method | Path | Body | Description |
| ------ | ---- | ---- | ----------- |
| POST | `/api/coupons/validate` | `{ code, items }` | Validate a coupon against the cart → `200` or `400` with reason |

Validate response `data`:

```json
{
  "code": "SAVE100", "description": "Test coupon",
  "discountType": "fixed | percent", "discountValue": 100,
  "maxDiscount": null, "minCartValue": null, "expiresAt": null,
  "eligibleSubtotal": 2000, "discount": 100
}
```

Coupon rules enforced server-side at order time:

- inactive / expired / invalid code → 400
- total `usageLimit` reached → 400
- already used by this user → 400 (usage is released when an order is cancelled)
- `firstOrderOnly` coupons reject users with any previous order → 400
- `minCartValue` below eligible subtotal → 400
- product/category scoped coupons only discount matching items
- percent coupons are capped by `maxDiscount` and never exceed eligible subtotal
- exactly one coupon per order (non-stackable)

---

## REVIEWS

### Public (no auth)

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/api/reviews?product=<productId>&page&limit` | Approved reviews only |

Public review:

```json
{
  "id": "…", "rating": 5, "comment": "Amazing fit!",
  "isVerifiedPurchase": true, "helpfulCount": 2,
  "createdAt": "ISO", "updatedAt": "ISO",
  "user": { "id": "…", "name": "Buyer" }
}
```

### Customer (auth required, ownership enforced)

| Method | Path | Body | Description |
| ------ | ---- | ---- | ----------- |
| POST | `/api/reviews` | `{ productId, rating, comment }` | Submit → `201` queued `pending` |
| GET | `/api/reviews/mine` | `?page&limit` | My reviews (all statuses) |
| PATCH | `/api/reviews/:id` | `{ rating?, comment? }` | Edit own review (re-queued for moderation) |
| DELETE | `/api/reviews/:id` | — | Delete own review |
| POST | `/api/reviews/:id/helpful` | — | Upvote (duplicate → 400) |
| POST | `/api/reviews/:id/report` | `{ reason? }` | Report (duplicate → 400) |

Rules:

- `rating` must be an integer 1..5; `comment` required, max 1000 chars.
- Only purchasers may review: a non-cancelled order containing the product
  (online orders must be paid). Otherwise → `403`.
- One review per user per product (duplicate → `409`).
- Only **approved** reviews are public and count toward
  `product.rating` / `product.reviewCount` (recomputed server-side on
  approve/reject/edit/delete, rounded to 1 decimal).

---

## PAYMENTS — all require auth (ownership enforced)

| Method | Path | Body | Description |
| ------ | ---- | ---- | ----------- |
| POST | `/api/payments/create` | `{ orderId }` | Create/reuse Razorpay order → `201` (or `200` if reused) |
| POST | `/api/payments/verify` | `{ orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature }` | Verify signature → marks order paid |
| GET | `/api/payments/order/:orderId` | — | Payment status |

`create` returns `data.payment`:

```json
{
  "keyId": "rzp_test_…",
  "razorpayOrderId": "order_…",
  "orderId": "…",
  "amount": 109900,
  "currency": "INR",
  "status": "created"
}
```

Returns `503` when Razorpay is not configured (test/dev).

---

## NOTIFICATIONS — all require auth (ownership enforced)

| Method | Path | Body | Description |
| ------ | ---- | ---- | ----------- |
| GET | `/api/notifications` | `?page&limit&unreadOnly=true` | My notifications |
| GET | `/api/notifications/unread-count` | — | `{ unreadCount }` |
| GET | `/api/notifications/preferences` | — | Preference flags |
| PATCH | `/api/notifications/preferences` | `{ emailOrderUpdates?: bool, ... }` | Update preferences |
| PATCH | `/api/notifications/read-all` | — | Mark all read |
| PATCH | `/api/notifications/:id/read` | — | Mark one read |
| DELETE | `/api/notifications/:id` | — | Delete one |

Notification:

```json
{
  "id": "…", "type": "ORDER | PAYMENT | SHIPPING | DELIVERY | REFUND | REVIEW | ACCOUNT | PROMOTION",
  "title": "…", "message": "…", "data": {},
  "isRead": false, "readAt": null, "createdAt": "ISO", "updatedAt": "ISO"
}
```

---

## ADMIN — all require `admin` role (else 403)

### Orders

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/api/admin/orders?status&paymentStatus&search&page&limit` | All orders + payments |
| GET | `/api/admin/orders/:id` | Single order + user + safe payment summaries |
| PATCH | `/api/admin/orders/:id/status` | `{ status: pending\|confirmed\|shipped\|delivered\|cancelled }` |

`cancelled` restores stock, releases coupon usage and sets refunds. Cancelled
orders can never change status again.

### Products

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/api/admin/products?page&limit&search&category&isActive&sort` | Active AND inactive products (admin product table) |
| GET | `/api/admin/products/:id` | Full product incl. variants, images, category |

List filters: `search` (name/description/brand/tags), `category` (id or slug),
`isActive` (`true`/`false`, default both), `sort` (reuses public options:
`newest`, `price_asc`, `price_desc`, `rating`, `popular`). Pagination follows
the standard envelope (`{ products, pagination }`).

### Dashboard

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/api/admin/dashboard/stats` | Real DB aggregates for the admin dashboard |

Response shape:

```json
{
  "success": true,
  "data": {
    "products": { "total": 4, "active": 3, "inactive": 1, "lowStock": 1, "outOfStock": 1 },
    "orders": { "total": 6, "pending": 1, "confirmed": 1, "shipped": 1, "delivered": 1, "cancelled": 2 },
    "customers": { "total": 1 },
    "sales": { "revenue": 1400, "orderCount": 2, "averageOrderValue": 700, "last7Days": [], "last30Days": [] },
    "recent": { "orders": [], "reviews": [] },
    "generatedAt": "2026-08-14T00:00:00.000Z"
  }
}
```

Definitions:
- `revenue` = sum of `Order.total` where `paymentStatus === "paid"` (online
  payments captured; COD orders stay `pending`, cancelled paid orders flip to
  `refunded`, so both are excluded).
- `lowStock`/`outOfStock` use the same `calculateProductStock` +
  `getStockStatus` helpers as the catalog (`LOW_STOCK_THRESHOLD`, default 5).
- `last7Days`/`last30Days` are per-day paid-sales series (UTC buckets,
  zero-filled), `{ date: "YYYY-MM-DD", orders, revenue }`.

### Coupons

| Method | Path | Body | Description |
| ------ | ---- | ---- | ----------- |
| GET | `/api/admin/coupons?page&limit&isActive&search` | — | List |
| POST | `/api/admin/coupons` | coupon payload | Create (duplicate code → 409) |
| GET | `/api/admin/coupons/:id` | — | Get |
| PATCH | `/api/admin/coupons/:id` | partial coupon payload | Update |
| DELETE | `/api/admin/coupons/:id` | — | Deactivate |

Coupon payload:

```json
{
  "code": "WELCOME10",
  "description": "10% off first order",
  "discountType": "percent",
  "discountValue": 10,
  "maxDiscount": 150,
  "minCartValue": 500,
  "firstOrderOnly": true,
  "applicableProducts": [],
  "applicableCategories": [],
  "excludedProducts": [],
  "excludedCategories": [],
  "expiresAt": "2026-12-31T23:59:59.000Z",
  "usageLimit": 100,
  "isActive": true
}
```

`code`: 3-20 uppercase letters/digits/dashes. `percent` discountValue 1-100.

### Reviews (moderation)

| Method | Path | Body | Description |
| ------ | ---- | ---- | ----------- |
| GET | `/api/admin/reviews?status&product&reported&page&limit` | — | All reviews incl. pending/rejected |
| PATCH | `/api/admin/reviews/:id/status` | `{ status: approved\|rejected }` | Moderate (approve notifies customer + recomputes rating) |
| DELETE | `/api/admin/reviews/:id` | — | Remove |

### Notifications & email logs

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/api/admin/notifications` | Admin's own notifications |
| GET | `/api/admin/emails?status&type&page&limit` | Email delivery logs |
| POST | `/api/admin/emails/:id/retry` | Retry a failed email |

### Catalog & media (write operations are admin-only)

| Method | Path | Auth |
| ------ | ---- | ---- |
| POST `/api/products` · PATCH `/api/products/:id` · DELETE `/api/products/:id` | admin |
| POST `/api/categories` · PATCH `/api/categories/:id` · DELETE `/api/categories/:id` | admin |

## MEDIA — image upload/delete (admin only, 403 for customers, 401 unauthenticated)

| Method | Path | Description |
| ------ | ---- | ----------- |
| POST | `/api/media/upload` | Upload one image via **multipart/form-data** |
| DELETE | `/api/media/:publicId` | Delete an image from Cloudinary (URL-encode the publicId) |

### Upload — `POST /api/media/upload`

- **Content-Type:** `multipart/form-data` (browser `FormData`). The API does
  **not** accept JSON bodies or server filesystem paths (`filePath` is
  rejected — any such payload returns `400 NO_FILE`).
- **Field name:** `file` (exactly one file per request).
- **Optional field:** `folder` — strictly allowlisted to
  `deer/products` (default), `deer/categories`, `deer/misc`. Anything else →
  `400 INVALID_FOLDER`.
- **Supported formats:** JPEG, PNG, WebP (MIME type **and** content magic
  bytes are validated).
- **Maximum size:** 5 MB (`413 FILE_TOO_LARGE` above that).
- The `publicId` is always generated server-side; client input is never used
  for Cloudinary paths.

Success (`201`):

```json
{
  "success": true,
  "message": "Image uploaded successfully",
  "data": {
    "image": {
      "url": "https://res.cloudinary.com/<cloud>/image/upload/v1/deer/products/<public-id>.jpg",
      "publicId": "deer/products/<public-id>",
      "width": 1200,
      "height": 1500,
      "format": "jpg",
      "bytes": 48213
    }
  }
}
```

Errors:

| Status | Code | Meaning |
| ------ | ---- | ------- |
| 400 | `NO_FILE` | missing `file` field (incl. JSON `filePath` payloads) |
| 400 | `UNSUPPORTED_FILE_TYPE` | non-JPEG/PNG/WebP MIME |
| 400 | `INVALID_IMAGE_CONTENT` | magic bytes don't match declared MIME |
| 400 | `INVALID_FOLDER` | folder outside the allowlist |
| 413 | `FILE_TOO_LARGE` | > 5 MB |
| 501 | `MEDIA_PROVIDER_NOT_CONFIGURED` | Cloudinary not configured |
| 502 | `CLOUDINARY_UPLOAD_FAILED` | provider failure (message is sanitized) |

### Delete — `DELETE /api/media/:publicId`

- URL-encode the publicId (it contains `/`), e.g.
  `DELETE /api/media/deer%2Fproducts%2Fabc123`.
- **Reference guard:** if the publicId is currently used by any product's
  images (product or variant level), the delete returns
  `409 IMAGE_IN_USE` and nothing is removed. Remove the image from the product
  (via `PATCH /api/products/:id` with an updated `images` array) first, then
  delete.
- Missing/blank publicId → `400 INVALID_PUBLIC_ID`.

### Product integration

The returned `url` + `publicId` are stored directly on `Product.images`
(`{ url, publicId, alt?, position, isPrimary }`) when creating or updating a
product. Cloudinary assets are never stored as local filesystem paths.

### Environment variables

```
MEDIA_PROVIDER=cloudinary
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
```

When `MEDIA_PROVIDER` is anything other than `cloudinary`, or the Cloudinary
credentials are missing, media endpoints return `501 MEDIA_PROVIDER_NOT_CONFIGURED`.
Credentials live only in `.env` (git-ignored) and never appear in responses.

---

## Webhook (Razorpay)

`POST /api/payments/webhook` with raw JSON body; signature validated with
`RAZORPAY_WEBHOOK_SECRET` using the `X-Razorpay-Signature` header. Replays are
idempotent. Amount tampering is rejected without marking the order paid.
Not subject to the general API rate limiter (signed delivery bursts).

---

## Notes for the frontend team

1. Always read totals from `order.totals` / preview `data` — never trust the
   client cart for checkout amounts.
2. `stockStatus` (`in_stock | low_stock | out_of_stock`) drives UI badges;
   `stock` (number) is returned only in cart items, not in the product list.
3. Product detail `category` is a populated category object.
4. `rating` / `reviewCount` on products are aggregates of approved reviews only
   and are already rounded to 1 decimal.
5. Order/notification/review pagination all share the standard
   `pagination` shape.
6. Error responses always carry a human-readable `message` — show it directly.
