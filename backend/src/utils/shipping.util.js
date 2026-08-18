const FREE_SHIPPING_THRESHOLD = 1999; // Rs
const FLAT_SHIPPING_FEE = 99; // Rs
const COD_EXTRA_FEE = 49; // Rs

const roundToPaise = (value) => Math.round(value * 100) / 100;

const computeShippingCharge = (subtotal) => {
  if (subtotal >= FREE_SHIPPING_THRESHOLD) return 0;
  return FLAT_SHIPPING_FEE;
};

const computeTotal = ({ subtotal, discount = 0, couponDiscount = 0, shipping = 0, codFee = 0 }) =>
  roundToPaise(Math.max(0, subtotal - discount - couponDiscount) + shipping + codFee);

const orderSummary = ({ subtotal, discount = 0, couponDiscount = 0, codFee = 0 }) => {
  // Shipping is judged on the payable amount (after coupon discount), which
  // keeps previews identical to the totals stored on the real order.
  const shipping = computeShippingCharge(subtotal - couponDiscount);
  const total = computeTotal({ subtotal, discount, couponDiscount, shipping, codFee });
  return {
    baseAmount: roundToPaise(subtotal),
    couponDiscount: roundToPaise(couponDiscount),
    discountAmount: roundToPaise(discount),
    shippingFee: shipping,
    codFee: roundToPaise(codFee),
    totalPayable: total,
  };
};

module.exports = {
  FREE_SHIPPING_THRESHOLD,
  FLAT_SHIPPING_FEE,
  COD_EXTRA_FEE,
  roundToPaise,
  computeShippingCharge,
  computeTotal,
  orderSummary,
};