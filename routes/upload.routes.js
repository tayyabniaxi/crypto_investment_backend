const express = require("express");
const router = express.Router();
const profileImageController = require('../controllers/user.controller'); // Changed to use user controller
const upload = require("../middlewares/upload");

// Upload screenshot (separate endpoint if needed)
router.post('/upload', upload.profileImage.single('screenshot'), profileImageController.uploadScreenshot);

// Get user screenshot
router.get('/:userId', profileImageController.getScreenshot);

module.exports = router;