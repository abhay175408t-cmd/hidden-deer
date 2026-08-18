require('dotenv').config();

const mongoose = require('mongoose');
const connectDatabase = require('../src/config/db');
const Product = require('../src/models/Product');

const toImageObject = (value, index) => {
  if (typeof value === 'string') {
    return {
      url: value,
      position: index,
      isPrimary: index === 0,
    };
  }
  return value;
};

const run = async () => {
  await connectDatabase();

  const affected = await Product.find({
    $or: [
      { images: { $elemMatch: { $type: 'string' } } },
      { variants: { $elemMatch: { images: { $elemMatch: { $type: 'string' } } } } },
    ],
  });

  let modified = 0;

  for (const product of affected) {
    if (Array.isArray(product.images) && product.images.some((img) => typeof img === 'string')) {
      product.images = product.images.map(toImageObject);
    }
    if (Array.isArray(product.variants)) {
      for (const variant of product.variants) {
        if (Array.isArray(variant.images) && variant.images.some((img) => typeof img === 'string')) {
          variant.images = variant.images.map(toImageObject);
        }
      }
    }
    await product.save();
    modified += 1;
  }

  console.log(`Migration complete. ${affected.length} product(s) found, ${modified} modified.`);
};

run()
  .catch((error) => {
    console.error('Migration failed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });