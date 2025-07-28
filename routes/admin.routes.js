const express = require("express");
const router = express.Router();
const adminController = require('../controllers/admin.controller');
const withdrawalController = require('../controllers/withdrawal.controller');
const adminAuth = require('../middlewares/adminAuth.middleware');

router.post("/login", adminController.adminLogin);

router.get("/account-number", adminController.getAccountNumber);
router.put("/account-number", adminAuth, adminController.updateAccountNumber);

router.get("/pending-users", adminAuth, adminController.getPendingUsers);
router.post("/update-user-status", adminAuth, adminController.updateUserStatus);

router.get("/withdrawal-requests", adminAuth, adminController.getWithdrawalRequests);
router.put("/update-withdrawal-status", adminAuth, withdrawalController.updateWithdrawalStatus);

router.get("/stats", adminAuth, adminController.getAdminStats);

module.exports = router;