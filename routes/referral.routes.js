const express = require("express");
const router = express.Router();
const referralController = require('../controllers/referral.controller');

// Get referral stats
router.get("/stats/:userId", referralController.getReferralStats);

// Get referred users list
router.get("/users/:userId", referralController.getReferredUsers);

// Generate referral code
router.post("/generate/:userId", referralController.generateReferralCode);

module.exports = router;