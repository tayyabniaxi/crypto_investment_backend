const express = require("express");
const router = express.Router();
const dailyProfitController = require('../controllers/dailyProfit.controller');

// Calculate daily profit for specific user
router.post("/calculate", dailyProfitController.calculateDailyProfit);

// Process daily profits for all users (for cron job)
router.post("/process-all", dailyProfitController.processAllDailyProfits);

// Get referral commission history
router.get("/commissions/:userId", dailyProfitController.getReferralCommissions);

module.exports = router;