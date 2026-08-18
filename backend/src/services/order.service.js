const mongoose = require('mongoose');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Address = require('../models/Address');
const Payment = require('../models/Payment');
const AppError = require('../utils/AppError');
const shipping = require('../utils/shipping.util');
const { getEffectiveProductPrice } = require('../utils/pricing.util');
const { withTransaction } = require('../utils/transaction.util');
const notificationService = require('./notification.service');
const couponService = require('./coupon.service');

const ORDER_STATUSES = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'];

const generateOrderNumber = () => {
  const date = new Date();
  const ymd = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  const rand = Math.floor(100000 + Math.random() * 900000);
  return `ORD-${ymd}-${rand}`;
};

const DELIVERY_DAYS = 7;

const buildLineItems = async (items, session) => {
  const unique = new Map();
  for (const item of items) {
    if (!mongoose.isValidObjectId(item.productId)) {
      throw new AppError(`Invalid product id: ${item.productId}`, 400);
    }
    if (!Number.isInteger(item.quantity) || item.quantity < 1) {
      throw new AppError('quantity must be a positive integer', 400);
    }
    const key = `${item.productId}:${item.variant || ''}`;
    if (unique.has(key)) {
      unique.get(key).quantity += item.quantity;
    } else {
      unique.set(key, { productId: item.productId, quantity: item.quantity, variant: item.variant });
    }
  }

  const productIds = [...unique.keys()].map((k) => k.split(':')[0]);
  const products = await Product.find({ _id: { $in: productIds } }, null, session ? { session } : {}).lean();
  const productMap = new Map(products.map((p) => [String(p._id), p]));

  const lines = [];
  for (const { productId, quantity, variant } of unique.values()) {
    const product = productMap.get(productId);
    if (!product) throw new AppError(`Product not found: ${productId}`, 404);
    if (!product.isActive) throw new AppError(`Product "${product.name}" is no longer available`, 400);
    const price = getEffectiveProductPrice(product);
    const primaryImage = product.images?.find((img) => img.isPrimary)?.url
      || product.images?.[0]?.url
      || null;
    lines.push({
      product: product._id,
      category: product.category || null,
      title: product.name,
      image: primaryImage,
      price,
      mrp: product.price,
      quantity,
      variant: variant || null,
    });
  }
  return lines;
};

const assertStock = async (lines, session) => {
  const ops = lines.map((line) =>
    Product.updateOne(
      { _id: line.product, stock: { $gte: line.quantity } },
      { $inc: { stock: -line.quantity } },
      session ? { session } : {}
    )
  );
  const results = await Promise.all(ops);
  results.forEach((result, i) => {
    if (result.matchedCount === 0) {
      throw new AppError(`Insufficient stock for "${lines[i].title}"`, 409);
    }
  });
};

const restoreStock = async (lines, session) => {
  const ops = lines.map((line) =>
    Product.updateOne(
      { _id: line.product },
      { $inc: { stock: +line.quantity } },
      session ? { session } : {}
    )
  );
  await Promise.all(ops);
};

const computeTotals = ({ subtotal, couponDiscount }) => {
  const discountAmount = 0; // flash sales / product-level discounts are applied at price level
  const afterCoupon = subtotal - couponDiscount;
  if (afterCoupon < 1) {
    throw new AppError('Coupon discount cannot exceed subtotal', 400);
  }
  const shippingFee = shipping.computeShippingCharge(afterCoupon);
  const codFee = 0;
  const total = shipping.computeTotal({ subtotal, couponDiscount, discountAmount, shipping: shippingFee, codFee });
  return { subtotal, couponDiscount, discountAmount, shippingFee, codFee, total };
};

const serializeOrder = (order) => ({
  id: order._id,
  orderNumber: order.orderNumber,
  items: order.items,
  totals: {
    subtotal: order.subtotal,
    couponDiscount: order.couponDiscount,
    discountAmount: order.discountAmount,
    shippingFee: order.shippingFee,
    codFee: order.codFee,
    total: order.total,
  },
  paymentMethod: order.paymentMethod,
  paymentStatus: order.paymentStatus,
  orderStatus: order.orderStatus,
  coupon: order.coupon,
  shippingAddress: order.shippingAddress,
  estimatedDelivery: order.estimatedDelivery,
  placedAt: order.placedAt,
  cancelledAt: order.cancelledAt,
  cancelReason: order.cancelReason,
  deliveredAt: order.deliveredAt,
  createdAt: order.createdAt,
});

const getPreviewForUser = async (userId, items, couponCode) => {
  const lines = await buildLineItems(items);
  const subtotal = lines.reduce((sum, l) => sum + l.price * l.quantity, 0);

  let couponDiscount = 0;
  if (couponCode) {
    const result = await couponService.evaluateCoupon({ code: couponCode, userId, lines });
    couponDiscount = result ? result.discount : 0;
  }

  return shipping.orderSummary({ subtotal, couponDiscount });
};

const placeOrder = async ({ userId, items, addressId, couponCode, paymentMethod }) => {
  if (!Array.isArray(items) || items.length === 0) {
    throw new AppError('Items are required to place an order', 400);
  }
  if (!['cod', 'online'].includes(paymentMethod)) {
    throw new AppError('paymentMethod must be "cod" or "online"', 400);
  }
  if (!mongoose.isValidObjectId(addressId)) {
    throw new AppError('Invalid address id', 400);
  }

  const created = await withTransaction(async (session) => {
    const address = await Address.findOne({ _id: addressId, user: userId }, null, session ? { session } : {}).lean();
    if (!address) throw new AppError('Shipping address not found', 404);

    const lines = await buildLineItems(items, session);
    const { coupon, discount: couponDiscount } =
      (await couponService.evaluateCoupon({
        code: couponCode,
        userId,
        lines,
        session,
      })) || { coupon: null, discount: 0 };

    await assertStock(lines, session);
    try {
      const subtotal = lines.reduce((sum, l) => sum + l.price * l.quantity, 0);
      const totals = computeTotals({ subtotal, couponDiscount });
      if (coupon) await couponService.markUsed(coupon, userId, session);

      const orderNumber = generateOrderNumber();
      const estimatedDelivery = new Date(Date.now() + DELIVERY_DAYS * 24 * 60 * 60 * 1000);

      const [orderDoc] = await Order.create(
        [
          {
            orderNumber,
            user: userId,
            // category is only used for coupon scoping and is not persisted
            items: lines.map(({ category, ...item }) => item),
            subtotal: totals.subtotal,
            couponDiscount: totals.couponDiscount,
            discountAmount: totals.discountAmount,
            shippingFee: totals.shippingFee,
            codFee: totals.codFee,
            total: totals.total,
            paymentMethod,
            paymentStatus: paymentMethod === 'online' ? 'pending' : 'pending',
            orderStatus: paymentMethod === 'online' ? 'pending' : 'confirmed',
            coupon: coupon ? coupon._id : null,
            shippingAddress: {
              fullName: address.fullName,
              phone: address.phone,
              addressLine1: address.addressLine1,
              addressLine2: address.addressLine2 || null,
              city: address.city,
              state: address.state,
              postalCode: address.postalCode,
              country: address.country,
            },
            estimatedDelivery,
          },
        ],
        session ? { session } : {}
      );

      return orderDoc;
    } catch (error) {
      // In standalone (non-transaction) mode the stock decrement is not
      // rolled back automatically, restore it manually before rethrowing.
      await restoreStock(lines, session);
      throw error;
    }
  });

  await notificationService.notifyOrderCreated({ order: created, userId });

  return serializeOrder(created);
};

const getOrdersForUser = async (userId, { page = 1, limit = 10 } = {}) => {
  const skip = (page - 1) * limit;
  const [orders, total] = await Promise.all([
    Order.find({ user: userId }).sort({ placedAt: -1 }).skip(skip).limit(limit).lean(),
    Order.countDocuments({ user: userId }),
  ]);
  const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
  return {
    orders: orders.map(serializeOrder),
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  };
};

const getOrderForUser = async (userId, orderId) => {
  if (!mongoose.isValidObjectId(orderId)) throw new AppError('Invalid order id', 400);
  const order = await Order.findOne({ _id: orderId, user: userId }).lean();
  if (!order) throw new AppError('Order not found', 404);
  return serializeOrder(order);
};

const cancelOrder = async (userId, orderId, reason) => {
  if (!mongoose.isValidObjectId(orderId)) throw new AppError('Invalid order id', 400);

  const cancelled = await withTransaction(async (session) => {
    const doc = await Order.findOne({ _id: orderId, user: userId }, null, session ? { session } : {});
    if (!doc) throw new AppError('Order not found', 404);
    if (!['pending', 'confirmed'].includes(doc.orderStatus)) {
      throw new AppError('Only pending or confirmed orders can be cancelled', 400);
    }
    if (doc.orderStatus === 'pending' && doc.paymentMethod === 'online') {
      throw new AppError('Payment pending for this order; contact support to cancel', 400);
    }

    await restoreStock(doc.items, session);
    if (doc.coupon) await couponService.release(doc.coupon, userId, session);

    doc.orderStatus = 'cancelled';
    doc.cancelledAt = new Date();
    doc.cancelReason = reason ? String(reason).slice(0, 500) : null;
    doc.paymentStatus = doc.paymentStatus === 'paid' ? 'refunded' : doc.paymentStatus;
    await doc.save(session ? { session } : {});
    return doc;
  });

  await notificationService.notifyOrderCancelled({ order: cancelled, userId });
  if (cancelled.paymentStatus === 'refunded') {
    await notificationService.notifyRefundCompleted({ order: cancelled, userId });
  }

  return serializeOrder(cancelled);
};

const getOrdersForAdmin = async ({ status, paymentStatus, page = 1, limit = 10, search }) => {
  const filter = {};
  if (status) filter.orderStatus = status;
  if (paymentStatus) filter.paymentStatus = paymentStatus;
  if (search) filter.orderNumber = new RegExp(search, 'i');

  const skip = (page - 1) * limit;
  const [orders, total] = await Promise.all([
    Order.find(filter).sort({ placedAt: -1 }).skip(skip).limit(limit).populate('user', 'name email').lean(),
    Order.countDocuments(filter),
  ]);

  const orderIds = orders.map((o) => o._id);
  const payments = orderIds.length
    ? await Payment.find({ order: { $in: orderIds } }).sort({ createdAt: -1 }).lean()
    : [];
  const paymentsByOrder = new Map();
  for (const payment of payments) {
    if (!paymentsByOrder.has(String(payment.order))) paymentsByOrder.set(String(payment.order), []);
    paymentsByOrder.get(String(payment.order)).push(serializePaymentSafe(payment));
  }

  const serialized = orders.map((order) => ({
    ...serializeOrder(order),
    user: order.user ? { id: order.user._id, name: order.user.name, email: order.user.email } : null,
    payments: paymentsByOrder.get(String(order._id)) || [],
  }));

  const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
  return {
    orders: serialized,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  };
};

// Safe payment summary for admin visibility (no secrets, no raw provider payloads).
const serializePaymentSafe = (payment) => ({
  id: payment._id,
  provider: payment.provider,
  providerOrderId: payment.providerOrderId,
  providerPaymentId: payment.providerPaymentId,
  amount: payment.amount,
  currency: payment.currency,
  status: payment.status,
  method: payment.method,
  failureReason: payment.failureReason,
  signatureVerified: payment.signatureVerified,
  webhookVerified: payment.webhookVerified,
  createdAt: payment.createdAt,
  updatedAt: payment.updatedAt,
});

const updateOrderStatus = async (orderId, newStatus) => {
  if (!mongoose.isValidObjectId(orderId)) throw new AppError('Invalid order id', 400);
  if (!ORDER_STATUSES.includes(newStatus)) {
    throw new AppError(`status must be one of: ${ORDER_STATUSES.join(', ')}`, 400);
  }

  let previousStatus = null;
  const order = await withTransaction(async (session) => {
    const doc = await Order.findById(orderId, null, session ? { session } : {});
    if (!doc) throw new AppError('Order not found', 404);
    if (doc.orderStatus === 'cancelled') {
      throw new AppError('Cannot change status of a cancelled order', 400);
    }
    previousStatus = doc.orderStatus;
    if (newStatus === 'cancelled') {
      await restoreStock(doc.items, session);
      if (doc.coupon) await couponService.release(doc.coupon, doc.user, session);
      doc.cancelledAt = new Date();
      doc.paymentStatus = doc.paymentStatus === 'paid' ? 'refunded' : doc.paymentStatus;
    }
    if (newStatus === 'delivered') doc.deliveredAt = new Date();

    doc.orderStatus = newStatus;
    await doc.save(session ? { session } : {});
    return doc;
  });

  if (previousStatus !== order.orderStatus) {
    const userId = order.user;
    switch (order.orderStatus) {
      case 'confirmed':
        await notificationService.notifyOrderConfirmed({ order, userId });
        break;
      case 'shipped':
        await notificationService.notifyOrderShipped({ order, userId });
        break;
      case 'delivered':
        await notificationService.notifyOrderDelivered({ order, userId });
        break;
      case 'cancelled':
        await notificationService.notifyOrderCancelled({ order, userId });
        if (order.paymentStatus === 'refunded') {
          await notificationService.notifyRefundCompleted({ order, userId });
        }
        break;
      default:
        break;
    }
  }

  return serializeOrder(order);
};

const getOrderForAdmin = async (orderId) => {
  if (!mongoose.isValidObjectId(orderId)) throw new AppError('Invalid order id', 400);

  const order = await Order.findById(orderId).populate('user', 'name email').lean();
  if (!order) throw new AppError('Order not found', 404);

  const payments = await Payment.find({ order: order._id }).sort({ createdAt: -1 }).lean();
  return {
    ...serializeOrder(order),
    user: order.user ? { id: order.user._id, name: order.user.name, email: order.user.email } : null,
    payments: payments.map(serializePaymentSafe),
  };
};

module.exports = {
  placeOrder,
  getPreviewForUser,
  getOrdersForUser,
  getOrderForUser,
  cancelOrder,
  getOrdersForAdmin,
  getOrderForAdmin,
  updateOrderStatus,
  buildLineItems,
};