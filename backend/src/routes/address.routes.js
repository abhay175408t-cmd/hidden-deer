const router = require('express').Router();

const {
  getAddresses,
  createAddress,
  getAddressById,
  updateAddress,
  deleteAddress,
  setDefaultAddress,
} = require('../controllers/address.controller');
const { protect } = require('../middleware/auth.middleware');

router.use(protect);

router.get('/', getAddresses);
router.post('/', createAddress);
router.get('/:id', getAddressById);
router.patch('/:id', updateAddress);
router.delete('/:id', deleteAddress);
router.patch('/:id/default', setDefaultAddress);

module.exports = router;