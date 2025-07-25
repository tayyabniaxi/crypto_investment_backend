const express = require("express");
const router = express.Router();
const profileImageController = require('../controllers/user.controller');
const upload = require("../middlewares/upload");

router.post('/upload', upload.profileImage.single('screenshot'), profileImageController.uploadScreenshot);

router.get('/:userId', profileImageController.getScreenshot);

module.exports = router;