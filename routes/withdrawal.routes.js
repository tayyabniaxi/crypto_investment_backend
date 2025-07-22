const express = require("express");
const router = express.Router();
const withdrawalController = require('../controllers/withdrawal.controller');

// Request withdrawal
router.post("/request", withdrawalController.requestWithdrawal);

// Get withdrawal history
router.get("/history/:userId", withdrawalController.getWithdrawalHistory);

// Get withdrawal stats
router.get("/stats/:userId", withdrawalController.getWithdrawalStats);

// Admin: Update withdrawal status
router.put("/update-status", withdrawalController.updateWithdrawalStatus);

module.exports = router;