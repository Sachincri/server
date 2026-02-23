import { body, ValidationChain } from "express-validator";

export const paymentValidatorts: ValidationChain[] =  [
    body('razorpay_payment_id')
      .exists().withMessage('razorpay_payment_id is required')
      .isString()
      .matches(/^pay_/).withMessage('invalid payment id format'),
    body('razorpay_order_id')
      .exists().withMessage('razorpay_order_id is required')
      .isString()
      .matches(/^order_/).withMessage('invalid order id format'),
    body('razorpay_signature')
      .exists().withMessage('razorpay_signature is required')
      .isString(),
    body('orderOptions')
      .exists().withMessage('orderOptions is required')
      .isObject().withMessage('orderOptions must be an object'),
    body('orderOptions.totalPrice')
      .exists().withMessage('orderOptions.totalPrice is required')
      .isFloat({ gt: 0 }).withMessage('orderOptions.totalPrice must be > 0'),
    // Basic shipping info validation (optional — controllers validate more deeply)
    body('orderOptions.shippingInfo.address').optional().isString().isLength({ min: 10 }),
    body('orderOptions.shippingInfo.city').optional().isString().isLength({ min: 2 }),
    body('orderOptions.shippingInfo.state').optional().isString().isLength({ min: 2 }),
    body('orderOptions.shippingInfo.country').optional().isString().isLength({ min: 2 }),
    body('orderOptions.shippingInfo.pinCode').optional().isNumeric(),
    body('orderOptions.shippingInfo.phoneNo').optional().isString(),
    // order items basic checks
    body('orderOptions.orderItems').optional().isArray({ min: 1 }),
    body('orderOptions.orderItems.*.product').optional().isMongoId(),
    body('orderOptions.orderItems.*.quantity').optional().isInt({ min: 1 }),
  ];

export const validateOrderOptions = (orderOptions: any): string[] => {
  const errors: string[] = [];

  if (!orderOptions) {
    errors.push("Order options are required");
    return errors;
  }

  // Validate shipping info
  if (!orderOptions.shippingInfo) {
    errors.push("Shipping information is required");
  } else {
    const { address, city, state, country, pinCode, phoneNo } =
      orderOptions.shippingInfo;

    if (!address || address.trim().length < 10) {
      errors.push("Valid shipping address is required");
    }
    if (!city || city.trim().length < 2) {
      errors.push("Valid city is required");
    }
    if (!state || state.trim().length < 2) {
      errors.push("Valid state is required");
    }
    if (!country || country.trim().length < 2) {
      errors.push("Valid country is required");
    }
    if (!pinCode || !/^\d{4,10}$/.test(pinCode.toString())) {
      errors.push("Valid pin code is required");
    }
    if (!phoneNo || !/^\d{10,15}$/.test(phoneNo.toString())) {
      errors.push("Valid phone number is required");
    }
  }

  // Validate order items
  if (
    !orderOptions.orderItems ||
    !Array.isArray(orderOptions.orderItems) ||
    orderOptions.orderItems.length === 0
  ) {
    errors.push("Order items are required");
  }

  // Validate prices
  if (
    typeof orderOptions.itemsPrice !== "number" ||
    orderOptions.itemsPrice <= 0
  ) {
    errors.push("Valid items price is required");
  }
  if (typeof orderOptions.taxPrice !== "number" || orderOptions.taxPrice < 0) {
    errors.push("Valid tax price is required");
  }
  if (
    typeof orderOptions.shippingPrice !== "number" ||
    orderOptions.shippingPrice < 0
  ) {
    errors.push("Valid shipping price is required");
  }
  if (
    typeof orderOptions.totalPrice !== "number" ||
    orderOptions.totalPrice <= 0
  ) {
    errors.push("Valid total price is required");
  }

  return errors;
};