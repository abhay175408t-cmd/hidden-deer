const fs = require('fs');
const path = require('path');
const { EMAIL_TYPES } = require('../config/notification.constants');

const TEMPLATES_DIR = path.join(__dirname, '..', 'templates', 'email');

// Centralized subject definitions. Data must contain a safe order snapshot.
const SUBJECTS = {
  [EMAIL_TYPES.ORDER_CREATED]: (d) => `Your order is confirmed — #${d.orderNumber}`,
  [EMAIL_TYPES.ORDER_CONFIRMED]: (d) => `Order confirmed — #${d.orderNumber}`,
  [EMAIL_TYPES.PAYMENT_SUCCESS]: (d) => `Payment successful — Order #${d.orderNumber}`,
  [EMAIL_TYPES.PAYMENT_FAILED]: (d) => `Payment failed — Order #${d.orderNumber}`,
  [EMAIL_TYPES.ORDER_SHIPPED]: (d) => `Your order has shipped — #${d.orderNumber}`,
  [EMAIL_TYPES.ORDER_DELIVERED]: (d) => `Your order has been delivered — #${d.orderNumber}`,
  [EMAIL_TYPES.ORDER_CANCELLED]: (d) => `Your order was cancelled — #${d.orderNumber}`,
  [EMAIL_TYPES.REFUND_INITIATED]: (d) => `Refund initiated — Order #${d.orderNumber}`,
  [EMAIL_TYPES.REFUND_COMPLETED]: (d) => `Refund completed — Order #${d.orderNumber}`,
  [EMAIL_TYPES.REVIEW_APPROVED]: () => 'Your review is live!',
  [EMAIL_TYPES.ADMIN_PAYMENT_FAILED]: (d) => `[Admin] Payment failed — Order #${d.orderNumber}`,
  [EMAIL_TYPES.ADMIN_REFUND]: (d) => `[Admin] Refund processed — Order #${d.orderNumber}`,
};

const TEMPLATE_FILE = {
  [EMAIL_TYPES.ORDER_CREATED]: 'order-confirmation.html',
  [EMAIL_TYPES.ORDER_CONFIRMED]: 'order-confirmation.html',
  [EMAIL_TYPES.PAYMENT_SUCCESS]: 'payment-success.html',
  [EMAIL_TYPES.PAYMENT_FAILED]: 'payment-failed.html',
  [EMAIL_TYPES.ORDER_SHIPPED]: 'order-shipped.html',
  [EMAIL_TYPES.ORDER_DELIVERED]: 'order-delivered.html',
  [EMAIL_TYPES.ORDER_CANCELLED]: 'order-cancelled.html',
  [EMAIL_TYPES.REFUND_INITIATED]: 'refund-initiated.html',
  [EMAIL_TYPES.REFUND_COMPLETED]: 'refund-completed.html',
  [EMAIL_TYPES.REVIEW_APPROVED]: 'review-approved.html',
  [EMAIL_TYPES.ADMIN_PAYMENT_FAILED]: 'payment-failed.html',
  [EMAIL_TYPES.ADMIN_REFUND]: 'refund-completed.html',
};

const templateCache = new Map();

// Escapes user-controlled values before inserting into HTML. This is the only
// boundary where customer input may enter an email body — everything else is
// safe, server-built HTML.
const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const loadTemplate = (type) => {
  const file = TEMPLATE_FILE[type];
  if (!file) throw new Error(`No email template registered for type: ${type}`);
  if (templateCache.has(file)) return templateCache.get(file);
  const raw = fs.readFileSync(path.join(TEMPLATES_DIR, file), 'utf8');
  templateCache.set(file, raw);
  return raw;
};

const renderConditionals = (template, data) => {
  const positive = template.replace(
    /\{\{#([A-Za-z0-9_]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g,
    (match, key, body) => (data[key] ? body : '')
  );
  return positive.replace(
    /\{\{\^([A-Za-z0-9_]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g,
    (match, key, body) => (data[key] ? '' : body)
  );
};

const renderTokens = (template, data) => {
  // Raw/safe blocks first (only used for server-built HTML such as item rows).
  const withSafe = template.replace(
    /\{\{\{\s*([A-Za-z0-9_]+)\s*\}\}\}/g,
    (match, key) => (data[key] === undefined ? '' : String(data[key]))
  );
  // Escaped tokens — customer-controlled values never pass through unescaped.
  return withSafe.replace(
    /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g,
    (match, key) => (data[key] === undefined ? '' : escapeHtml(data[key]))
  );
};

const renderTemplate = (type, data) => {
  const template = loadTemplate(type);
  return renderTokens(renderConditionals(template, data || {}), data || {});
};

const getSubject = (type, data) => {
  const fn = SUBJECTS[type];
  if (!fn) throw new Error(`No email subject registered for type: ${type}`);
  return fn(data || {});
};

const formatMoney = (value) => Number(value || 0).toFixed(2);

// Builds the item rows block for the order confirmation email. Every field is
// escaped before it becomes part of the safe HTML block.
const buildItemsHtml = (items) => {
  if (!Array.isArray(items) || items.length === 0) return '';
  const rows = items
    .map((item) => {
      const title = escapeHtml(item.title || 'Item');
      const variant = item.variant ? escapeHtml(item.variant) : null;
      const qty = Number(item.quantity) || 1;
      const price = formatMoney(item.price);
      const lineTotal = formatMoney((Number(item.price) || 0) * qty);
      const variantHtml = variant
        ? `<div style="font-size:11px;color:#999;">${variant}</div>`
        : '';
      return `<tr>
        <td style="padding:10px 0;border-bottom:1px solid #f2f2f2;">
          <div style="font-size:13px;color:#333;">${title}</div>${variantHtml}
          <div style="font-size:11px;color:#999;">Qty: ${qty}</div>
        </td>
        <td align="right" style="padding:10px 0;border-bottom:1px solid #f2f2f2;font-size:13px;color:#333;">₹${lineTotal}</td>
      </tr>`;
    })
    .join('');
  return `<tr><td style="font-size:12px;color:#888;padding-bottom:4px;">ITEMS</td></tr>${rows}`;
};

module.exports = {
  escapeHtml,
  renderTemplate,
  getSubject,
  buildItemsHtml,
  formatMoney,
  loadTemplate,
};
