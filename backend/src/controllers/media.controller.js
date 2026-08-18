const mediaService = require('../services/media/media.service');

// POST /api/media/upload — multipart/form-data, field "file".
const uploadImage = async (req, res, next) => {
  try {
    const image = await mediaService.uploadImage({
      file: req.file,
      folder: req.body.folder,
    });
    res.status(201).json({
      success: true,
      message: 'Image uploaded successfully',
      data: { image },
    });
  } catch (error) {
    next(error);
  }
};

// DELETE /api/media/:publicId
const deleteImage = async (req, res, next) => {
  try {
    const result = await mediaService.deleteImage(req.params.publicId);
    res.status(200).json({
      success: true,
      message: 'Image deleted successfully',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { uploadImage, deleteImage };