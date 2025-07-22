const express = require("express");
const router = express.Router();
const userController = require('../controllers/user.controller');
const upload = require("../middlewares/upload");

router.post("/signup", upload.profileImage.single('screenshot'), userController.signup);

router.post("/login", userController.login);

router.get("/plan/:userId", userController.getUserPlan);

module.exports = router;