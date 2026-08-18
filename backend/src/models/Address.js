const mongoose = require('mongoose');

const VALID_PIN_REGEX = /^[1-9][0-9]{5}$/;

const addressSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    fullName: {
      type: String,
      required: [true, 'Full name is required'],
      trim: true,
      maxlength: 120,
    },
    phone: {
      type: String,
      required: [true, 'Phone number is required'],
      trim: true,
      match: [/^[+]?[\d\s-]{10,15}$/, 'Please provide a valid phone number'],
    },
    addressLine1: {
      type: String,
      required: [true, 'Address is required'],
      trim: true,
      maxlength: 300,
    },
    addressLine2: {
      type: String,
      trim: true,
      maxlength: 300,
    },
    city: {
      type: String,
      required: [true, 'City is required'],
      trim: true,
      maxlength: 100,
    },
    state: {
      type: String,
      required: [true, 'State is required'],
      trim: true,
      maxlength: 100,
    },
    postalCode: {
      type: String,
      required: [true, 'Postal code is required'],
      trim: true,
      match: [VALID_PIN_REGEX, 'Postal code must be a 6-digit PIN'],
    },
    country: {
      type: String,
      required: [true, 'Country is required'],
      trim: true,
      maxlength: 100,
      default: 'India',
    },
    landmark: {
      type: String,
      trim: true,
      maxlength: 200,
    },
    addressType: {
      type: String,
      enum: ['home', 'work', 'other'],
      default: 'home',
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

addressSchema.index({ user: 1, isDefault: 1 });

module.exports = mongoose.model('Address', addressSchema);