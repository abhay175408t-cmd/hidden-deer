const mongoose = require('mongoose');
const Address = require('../models/Address');
const AppError = require('../utils/AppError');

const ALLOWED_FIELDS = [
  'fullName',
  'phone',
  'addressLine1',
  'addressLine2',
  'city',
  'state',
  'postalCode',
  'country',
  'landmark',
  'addressType',
  'isDefault',
];

const validateAddressData = (data) => {
  const required = ['fullName', 'phone', 'addressLine1', 'city', 'state', 'postalCode', 'country'];
  for (const field of required) {
    if (!data[field] || !String(data[field]).trim()) {
      throw new AppError(`${field} is required`, 400);
    }
  }
  if (!['home', 'work', 'other'].includes(data.addressType || 'home')) {
    throw new AppError('addressType must be one of: home, work, other', 400);
  }
};

const unsetDefaultForUser = async (userId, session) => {
  await Address.updateMany(
    { user: userId, isDefault: true },
    { $set: { isDefault: false } },
    session ? { session } : {}
  );
};

const serializeAddress = (address) => ({
  id: address._id,
  fullName: address.fullName,
  phone: address.phone,
  addressLine1: address.addressLine1,
  addressLine2: address.addressLine2 ?? null,
  city: address.city,
  state: address.state,
  postalCode: address.postalCode,
  country: address.country,
  landmark: address.landmark ?? null,
  addressType: address.addressType,
  isDefault: address.isDefault,
  createdAt: address.createdAt,
});

const getUserAddresses = async (userId) => {
  const addresses = await Address.find({ user: userId })
    .sort({ isDefault: -1, createdAt: -1 })
    .lean();
  return addresses.map(serializeAddress);
};

const createAddress = async (userId, data) => {
  validateAddressData(data);

  const effectiveDefault = data.isDefault === true;
  if (effectiveDefault) {
    await unsetDefaultForUser(userId);
  }

  let address;
  if (!effectiveDefault) {
    const count = await Address.countDocuments({ user: userId });
    if (count === 0) data.isDefault = true;
  }

  address = await Address.create({
    user: userId,
    fullName: data.fullName.trim(),
    phone: data.phone.trim(),
    addressLine1: data.addressLine1.trim(),
    addressLine2: data.addressLine2?.trim(),
    city: data.city.trim(),
    state: data.state.trim(),
    postalCode: data.postalCode.trim(),
    country: data.country.trim(),
    landmark: data.landmark?.trim(),
    addressType: data.addressType || 'home',
    isDefault: data.isDefault === true,
  });

  return serializeAddress(address);
};

const getAddressById = async (userId, addressId) => {
  if (!mongoose.isValidObjectId(addressId)) {
    throw new AppError('Invalid address id', 400);
  }
  const address = await Address.findOne({ _id: addressId, user: userId }).lean();
  if (!address) {
    throw new AppError('Address not found', 404);
  }
  return serializeAddress(address);
};

const updateAddress = async (userId, addressId, data) => {
  if (!mongoose.isValidObjectId(addressId)) {
    throw new AppError('Invalid address id', 400);
  }
  const address = await Address.findOne({ _id: addressId, user: userId });
  if (!address) {
    throw new AppError('Address not found', 404);
  }

  const patch = {};
  for (const field of ALLOWED_FIELDS) {
    if (data[field] !== undefined) patch[field] = data[field];
  }
  if (Object.keys(patch).length === 0) {
    throw new AppError('No valid fields to update', 400);
  }
  validateAddressData({ ...address.toObject(), ...patch });

  if (patch.isDefault === true) {
    await unsetDefaultForUser(userId);
  }

  Object.assign(address, patch);
  await address.save();
  return serializeAddress(address);
};

const deleteAddress = async (userId, addressId) => {
  if (!mongoose.isValidObjectId(addressId)) {
    throw new AppError('Invalid address id', 400);
  }
  const address = await Address.findOneAndDelete({ _id: addressId, user: userId });
  if (!address) {
    throw new AppError('Address not found', 404);
  }
  // If the deleted address was the default, no other address is promoted.
  return { id: address._id };
};

const setDefaultAddress = async (userId, addressId) => {
  if (!mongoose.isValidObjectId(addressId)) {
    throw new AppError('Invalid address id', 400);
  }
  const address = await Address.findOne({ _id: addressId, user: userId });
  if (!address) {
    throw new AppError('Address not found', 404);
  }

  await unsetDefaultForUser(userId);
  address.isDefault = true;
  await address.save();
  return serializeAddress(address);
};

module.exports = {
  getUserAddresses,
  createAddress,
  getAddressById,
  updateAddress,
  deleteAddress,
  setDefaultAddress,
};