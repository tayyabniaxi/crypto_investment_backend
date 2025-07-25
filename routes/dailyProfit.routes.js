const express = require("express");
const router = express.Router();
const dailyProfitController = require('../controllers/dailyProfit.controller');

router.post("/calculate", dailyProfitController.calculateDailyProfit);

router.post("/process-all", dailyProfitController.processAllDailyProfits);

router.get("/commissions/:userId", dailyProfitController.getReferralCommissions);

module.exports = router;