require('dotenv').config();

const mongoose = require('mongoose');
const Category = require('../models/Category');
const Product = require('../models/Product');

const CATEGORY_NAMES = [
  'Cargo Pants',
  'Jeans',
  'Overshirt',
  'Shirts',
  'Shoes',
  'Shorts',
  'T-shirts',
  'Trousers',
];

// Distinct product names per category so every generated product is unique.
const PRODUCT_NAMES = {
  'Cargo Pants': ['Classic Cargo Pants', 'Tactical Cargo Pants', 'Slim Cargo Pants', 'Relaxed Cargo Pants', 'Utility Cargo Pants', 'Zip Pocket Cargo Pants', 'Cargo Jogger Pants', 'Hiking Cargo Pants', 'Oversized Cargo Pants', 'Stretch Cargo Pants'],
  Jeans: ['Slim Fit Jeans', 'Straight Leg Jeans', 'Relaxed Jeans', 'Skinny Jeans', 'Bootcut Jeans', 'Baggy Jeans', 'Distressed Jeans', 'Carpenter Jeans', 'High Rise Jeans', 'Tapered Jeans'],
  Overshirt: ['Flannel Overshirt', 'Corduroy Overshirt', 'Utility Overshirt', 'Wool Blend Overshirt', 'Denim Overshirt', 'Chore Overshirt', 'Linen Overshirt', 'Check Overshirt', 'Brushed Overshirt', 'Padded Overshirt'],
  Shirts: ['Classic Oxford Shirt', 'Cuban Collar Shirt', 'Flannel Shirt', 'Linen Shirt', 'Checked Shirt', 'Striped Shirt', 'Hawaiian Shirt', 'Slim Fit Shirt', 'Poplin Shirt', 'Oversized Shirt'],
  Shoes: ['Canvas Sneakers', 'Leather Sneakers', 'Running Sneakers', 'High Top Sneakers', 'Loafers', 'Derby Shoes', 'Slip On Shoes', 'Chunky Sneakers', 'Court Sneakers', 'Trail Shoes'],
  Shorts: ['Chino Shorts', 'Cargo Shorts', 'Denim Shorts', 'Running Shorts', 'Linen Shorts', 'Sweat Shorts', 'Bermuda Shorts', 'Gym Shorts', 'Pleated Shorts', 'Relaxed Shorts'],
  'T-shirts': ['Classic Crew Neck T-Shirt', 'Oversized T-Shirt', 'V-Neck T-Shirt', 'Boxy T-Shirt', 'Graphic Print T-Shirt', 'Striped T-Shirt', 'Pocket T-Shirt', 'Heavyweight T-Shirt', 'Longline T-Shirt', 'Raglan T-Shirt'],
  Trousers: ['Pleated Trousers', 'Tapered Trousers', 'Straight Leg Trousers', 'Wide Leg Trousers', 'Chino Trousers', 'Dress Trousers', 'Cuffed Trousers', 'Relaxed Trousers', 'Smart Trousers', 'Stretch Trousers'],
};

const TOP_CATEGORIES = ['Shirts', 'T-shirts', 'Overshirt'];
const SHOES_CATEGORY = 'Shoes';

const COLORS = ['Black', 'White', 'Navy', 'Olive', 'Beige', 'Grey', 'Maroon'];
const LETTER_SIZES = ['S', 'M', 'L', 'XL', 'XXL'];
const NUMERIC_SIZES = ['8', '9', '10', '11'];
const GENDERS = ['men', 'unisex'];
const PATTERNS = ['Solid', 'Checked', 'Striped', 'Printed', 'Abstract'];
const FITS = ['Slim Fit', 'Regular Fit', 'Oversized', 'Relaxed'];
const MATERIALS = ['Cotton', 'Denim', 'Linen', 'Polyester Blend', 'Corduroy'];
const COLLARS = ['Cuban', 'Mandarin', 'Spread', 'Polo', 'Crew Neck'];
const SLEEVES = ['Short Sleeves', 'Long Sleeves', 'Sleeveless'];
const DELIVERY_TIMES = ['2-3 Business Days', '5-7 Business Days'];
const BRANDS = ['Deer Clothing', 'Urban Threads', 'Nomad Co.', 'Bare Bones', 'Common Craft'];

const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = (arr) => arr[randomInt(0, arr.length - 1)];
const pickSubset = (arr, max) => {
  const count = randomInt(1, max);
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
};

const slugify = (str) =>
  String(str)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

// Use dynamic image generation to guarantee unique, unbroken images for testing layouts.
// We append the product's unique slug as a seed so the images remain consistent for that product.
const buildImages = (slug, categoryName) => {
  // Base URL sizes: 800x1000 for portrait clothing aspect ratio
  const mainUrl = `https://picsum.photos/seed/${slug}-main/800/1000`;
  const hoverUrl = `https://picsum.photos/seed/${slug}-hover/800/1000`;

  return [
    { url: mainUrl, isPrimary: true, position: 0 },
    { url: hoverUrl, isPrimary: false, position: 1 }
  ];
};

const buildProduct = ({ categoryId, categoryName, index }) => {
  const name = PRODUCT_NAMES[categoryName][index];
  const generatedSlug = slugify(name + '-' + index); // Ensure totally unique slug
  const isTop = TOP_CATEGORIES.includes(categoryName);
  const isShoes = categoryName === SHOES_CATEGORY;
  const price = randomInt(499, 2999);
  const hasDiscount = Math.random() < 0.4;
  const discountPrice = hasDiscount
    ? price - randomInt(100, Math.floor(price * 0.35))
    : undefined;

  return {
    name,
    slug: generatedSlug,
    description: `${name} — ${pick(MATERIALS).toLowerCase()} ${pick(FITS).toLowerCase()}. Made for everyday wear with a ${pick(PATTERNS).toLowerCase()} finish.`,
    category: categoryId,
    brand: pick(BRANDS),
    gender: pick(GENDERS),
    pattern: pick(PATTERNS),
    fit: pick(FITS),
    material: pick(MATERIALS),
    collar: isTop ? pick(COLLARS) : undefined,
    sleeves: isTop ? pick(SLEEVES) : undefined,
    deliveryTime: pick(DELIVERY_TIMES),
    price,
    discountPrice,
    images: buildImages(generatedSlug, categoryName),
    colors: pickSubset(COLORS, 3),
    sizes: isShoes ? pickSubset(NUMERIC_SIZES, NUMERIC_SIZES.length) : pickSubset(LETTER_SIZES, LETTER_SIZES.length),
    stock: index % 5 === 0 ? 0 : randomInt(1, 50),
    sku: `${slugify(categoryName).toUpperCase().slice(0, 4)}-${String(index + 1).padStart(2, '0')}`,
    tags: [categoryName, pick(GENDERS)],
    isFeatured: Math.random() < 0.2,
    isNew: Math.random() < 0.3,
    isBestSeller: Math.random() < 0.15,
    isActive: true,
  };
};

const ensureCategories = async () => {
  const categories = [];
  for (const name of CATEGORY_NAMES) {
    const targetSlug = slugify(name);
    let category = await Category.findOne({ slug: targetSlug }).lean();
    if (!category) {
      category = await Category.create({
        name,
        slug: targetSlug,
        description: `All ${name}`,
        isActive: true,
      });
      console.log(`Created category: ${name}`);
    }
    categories.push({ _id: category._id, name: category.name, canonicalName: name });
    console.log(`Category ready: ${category.name} (${category._id})`);
  }
  return categories;
};

const run = async () => {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!mongoUri) {
    throw new Error('MONGO_URI (or MONGODB_URI) is not defined in the environment');
  }

  const conn = await mongoose.connect(mongoUri);
  console.log(`MongoDB connected: ${conn.connection.host}`);

  const categories = await ensureCategories();

  const products = categories.flatMap((category) =>
    Array.from({ length: 10 }, (_, index) =>
      buildProduct({ categoryId: category._id, categoryName: category.canonicalName, index })
    )
  );

  await Product.deleteMany({ category: { $in: categories.map((c) => c._id) } });

  const inserted = await Product.insertMany(products, { ordered: false });
  console.log(`Inserted ${inserted.length} products`);
  return inserted.length;
};

run()
  .then((count) => {
    console.log(`Seed complete: ${count} products inserted`);
  })
  .catch((error) => {
    console.error('Seed failed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.connection.close();
    console.log('Database connection closed');
  });