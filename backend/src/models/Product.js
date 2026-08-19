const mongoose = require('mongoose');
const {
  MAX_PRODUCT_IMAGES,
  MAX_VARIANT_IMAGES,
} = require('../config/constants');

const imageSchema = new mongoose.Schema(
  {
    url: {
      type: String,
      required: true,
      trim: true,
    },
    publicId: {
      type: String,
      trim: true,
    },
    alt: {
      type: String,
      trim: true,
    },
    position: {
      type: Number,
      default: 0,
      min: 0,
    },
    isPrimary: {
      type: Boolean,
      default: false,
    },
  },
  { _id: false }
);

const variantImageSchema = new mongoose.Schema(
  {
    url: {
      type: String,
      required: true,
      trim: true,
    },
    publicId: {
      type: String,
      trim: true,
    },
    alt: {
      type: String,
      trim: true,
    },
    position: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { _id: false }
);

const variantSchema = new mongoose.Schema(
  {
    color: {
      type: String,
      required: true,
      trim: true,
    },
    size: {
      type: String,
      required: true,
      trim: true,
    },
    sku: {
      type: String,
      required: true,
      trim: true,
    },
    price: {
      type: Number,
      min: 0,
    },
    discountPrice: {
      type: Number,
      min: 0,
    },
    stock: {
      type: Number,
      default: 0,
      min: 0,
    },
    images: {
      type: [variantImageSchema],
      default: [],
      validate: {
        validator: (value) => value.length <= MAX_VARIANT_IMAGES,
        message: `A variant cannot have more than ${MAX_VARIANT_IMAGES} images`,
      },
    },
  },
  { _id: true }
);

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: true,
    },
    brand: {
      type: String,
      trim: true,
    },
    gender: {
      type: String,
      enum: ['men', 'women', 'unisex'],
      default: 'men',
      lowercase: true,
      trim: true,
    },
    pattern: {
      type: String,
      trim: true,
    },
    fit: {
      type: String,
      trim: true,
    },
    material: {
      type: String,
      trim: true,
    },
    collar: {
      type: String,
      trim: true,
    },
    sleeves: {
      type: String,
      trim: true,
    },
    deliveryTime: {
      type: String,
      trim: true,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    discountPrice: {
      type: Number,
      min: 0,
    },
    images: {
      type: [imageSchema],
      default: [],
      validate: {
        validator: (value) => value.length <= MAX_PRODUCT_IMAGES,
        message: `A product cannot have more than ${MAX_PRODUCT_IMAGES} images`,
      },
    },
    colors: {
      type: [String],
      default: [],
    },
    sizes: {
      type: [String],
      default: [],
    },
    variants: {
      type: [variantSchema],
      default: [],
    },
    stock: {
      type: Number,
      default: 0,
      min: 0,
    },
    sku: {
      type: String,
      trim: true,
    },
    tags: {
      type: [String],
      default: [],
    },
    isFeatured: {
      type: Boolean,
      default: false,
    },
    isNew: {
      type: Boolean,
      default: false,
    },
    isBestSeller: {
      type: Boolean,
      default: false,
    },
    rating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },
    reviewCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true, suppressReservedKeysWarning: true }
);

// Normalize images (assign positions, keep a single primary, sort by position)
// before validation/save so stored documents are always consistent.
productSchema.pre('validate', function () {
  if (Array.isArray(this.images)) {
    let primaryAssigned = false;
    this.images = this.images
      .map((image, index) => {
        const position =
          image.position === undefined || image.position === null
            ? index
            : image.position;
        const isPrimary = image.isPrimary === true && !primaryAssigned;
        if (image.isPrimary === true) primaryAssigned = true;
        return { ...image, position, isPrimary };
      })
      .sort((a, b) => a.position - b.position);
  }

  if (Array.isArray(this.variants)) {
    for (const variant of this.variants) {
      if (Array.isArray(variant.images)) {
        variant.images = variant.images
          .map((image, index) => ({
            ...image,
            position:
              image.position === undefined || image.position === null
                ? index
                : image.position,
          }))
          .sort((a, b) => a.position - b.position);
      }
    }
  }
});

productSchema.index({ category: 1, isActive: 1 });
productSchema.index({ category: 1, isActive: 1, price: 1 });
productSchema.index({ gender: 1, category: 1 });
productSchema.index({ tags: 1 });
productSchema.index({ isFeatured: 1 });
// Default catalog listing filter (active products, newest first).
productSchema.index({ isActive: 1, createdAt: -1 });
productSchema.index({ createdAt: -1 });
productSchema.index({ sku: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Product', productSchema);