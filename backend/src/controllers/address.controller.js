const addressService = require('../services/address.service');

const getAddresses = async (req, res, next) => {
  try {
    const addresses = await addressService.getUserAddresses(req.user._id);
    res.status(200).json({ success: true, data: { addresses } });
  } catch (error) {
    next(error);
  }
};

const createAddress = async (req, res, next) => {
  try {
    const address = await addressService.createAddress(req.user._id, req.body);
    res.status(201).json({
      success: true,
      message: 'Address created successfully',
      data: { address },
    });
  } catch (error) {
    next(error);
  }
};

const getAddressById = async (req, res, next) => {
  try {
    const address = await addressService.getAddressById(req.user._id, req.params.id);
    res.status(200).json({ success: true, data: { address } });
  } catch (error) {
    next(error);
  }
};

const updateAddress = async (req, res, next) => {
  try {
    const address = await addressService.updateAddress(req.user._id, req.params.id, req.body);
    res.status(200).json({
      success: true,
      message: 'Address updated successfully',
      data: { address },
    });
  } catch (error) {
    next(error);
  }
};

const deleteAddress = async (req, res, next) => {
  try {
    await addressService.deleteAddress(req.user._id, req.params.id);
    res.status(200).json({
      success: true,
      message: 'Address deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

const setDefaultAddress = async (req, res, next) => {
  try {
    const address = await addressService.setDefaultAddress(req.user._id, req.params.id);
    res.status(200).json({
      success: true,
      message: 'Default address updated',
      data: { address },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAddresses,
  createAddress,
  getAddressById,
  updateAddress,
  deleteAddress,
  setDefaultAddress,
};