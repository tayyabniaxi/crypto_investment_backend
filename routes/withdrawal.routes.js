const express = require("express");
const router = express.Router();
const withdrawalController = require('../controllers/withdrawal.controller');

router.post("/request", withdrawalController.requestWithdrawal);

router.get("/history/:userId", withdrawalController.getWithdrawalHistory);

router.get("/stats/:userId", withdrawalController.getWithdrawalStats);

router.put("/update-status", withdrawalController.updateWithdrawalStatus);

module.exports = router;