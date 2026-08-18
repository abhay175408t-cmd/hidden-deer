const mongoose = require('mongoose');
const Category = require('../models/Category');
const AppError = require('../utils/AppError');

const create = async (data) => {
  const { name, slug, description, image, isActive } = data;

  if (!name || !slug) {
    throw new AppError('Name and slug are required', 400);
  }

  try {
    return await Category.create({
      name: name.trim(),
      slug: slug.trim().toLowerCase(),
      description: description?.trim(),
      image,
      isActive,
    });
  } catch (error) {
    if (error.code === 11000) {
      throw new AppError('Category slug already exists', 409);
    }
    throw error;
  }
};

const findAll = () => Category.find({ isActive: true }).sort({ name: 1 }).lean();

const findBySlug = async (slug) => {
  const category = await Category.findOne({ slug, isActive: true }).lean();
  if (!category) {
    throw new AppError('Category not found', 404);
  }
  return category;
};

const update = async (id, data) => {
  if (!mongoose.isValidObjectId(id)) {
    throw new AppError('Invalid category id', 400);
  }

  const category = await Category.findById(id);
  if (!category) {
    throw new AppError('Category not found', 404);
  }

  const allowedFields = ['name', 'slug', 'description', 'image', 'isActive'];
  for (const field of allowedFields) {
    if (data[field] !== undefined) {
      category[field] = data[field];
    }
  }
  if (data.name) category.name = data.name.trim();
  if (data.slug) category.slug = data.slug.trim().toLowerCase();
  if (data.description !== undefined) {
    category.description = data.description === null ? data.description : data.description.trim();
  }

  try {
    await category.save();
  } catch (error) {
    if (error.code === 11000) {
      throw new AppError('Category slug already exists', 409);
    }
    throw error;
  }

  return category;
};

const deactivate = async (id) => {
  if (!mongoose.isValidObjectId(id)) {
    throw new AppError('Invalid category id', 400);
  }

  const category = await Category.findById(id);
  if (!category) {
    throw new AppError('Category not found', 404);
  }

  category.isActive = false;
  await category.save();
  return category;
};

module.exports = { create, findAll, findBySlug, update, deactivate };