const express = require("express");
const router = express.Router();
const referralController = require('../controllers/referral.controller');

router.get("/stats/:userId", referralController.getReferralStats);

router.get("/users/:userId", referralController.getReferredUsers);

router.post("/generate/:userId", referralController.generateReferralCode);

module.exports = router;