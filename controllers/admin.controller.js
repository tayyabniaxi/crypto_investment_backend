const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('config');
const User = require('../models/user.model');

// Admin login
exports.adminLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Admin credentials check (you can move this to database later)
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@seashell.com';
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin12@';

    if (email !== adminEmail || password !== adminPassword) {
      return res.status(401).json({
        meta: { statusCode: 401, status: false, message: "Invalid admin credentials" }
      });
    }

    // Generate admin token
    const token = jwt.sign(
      { adminId: 'admin', role: 'admin' },
      config.get("jwtSecret"),
      { expiresIn: "24h" }
    );

    return res.status(200).json({
      meta: { statusCode: 200, status: true, message: "Admin login successful" },
      data: { token, role: 'admin' }
    });

  } catch (error) {
    console.error("Admin login error:", error);
    return res.status(500).json({
      meta: { statusCode: 500, status: false, message: "Server error" }
    });
  }
};

exports.getPendingUsers = async (req, res) => {
  try {
    const pendingUsers = await User.find(
      { verificationStatus: 'pending' },
      {
        email: 1,
        profileImage: 1,
        selectedPlan: 1,
        createdAt: 1,
        verificationStatus: 1
      }
    ).sort({ createdAt: -1 });

    const formattedUsers = pendingUsers.map(user => ({
      id: user._id,
      email: user.email,
      plan: user.selectedPlan?.planName || 'No Plan',
      investmentAmount: user.selectedPlan?.investmentAmount || '$0',
      screenshot: user.profileImage?.url || null,
      registeredAt: new Date(user.createdAt).toLocaleDateString(),
      status: user.verificationStatus
    }));

    return res.status(200).json({
      meta: { statusCode: 200, status: true, message: "Pending users retrieved successfully" },
      data: formattedUsers
    });

  } catch (error) {
    console.error("Error getting pending users:", error);
    return res.status(500).json({
      meta: { statusCode: 500, status: false, message: "Server error" }
    });
  }
};

// Approve or reject user registration
exports.updateUserStatus = async (req, res) => {
  try {
    const { userId, status, adminNotes } = req.body;

    if (!userId || !status) {
      return res.status(400).json({
        meta: { statusCode: 400, status: false, message: "User ID and status are required" }
      });
    }

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({
        meta: { statusCode: 400, status: false, message: "Invalid status. Use 'approved' or 'rejected'" }
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        meta: { statusCode: 404, status: false, message: "User not found" }
      });
    }

    if (status === 'approved') {
      user.verificationStatus = 'approved';
      user.isVerified = true;
      
      // Activate user's plan
      if (user.selectedPlan) {
        user.selectedPlan.isActive = true;
        user.selectedPlan.startDate = new Date();
      }
      
      await user.save();

      return res.status(200).json({
        meta: { statusCode: 200, status: true, message: "User approved successfully" },
        data: { userId, status: 'approved', email: user.email }
      });

    } else if (status === 'rejected') {
      // Delete user account
      await User.findByIdAndDelete(userId);

      return res.status(200).json({
        meta: { statusCode: 200, status: true, message: "User rejected and account deleted" },
        data: { userId, status: 'rejected' }
      });
    }

  } catch (error) {
    console.error("Error updating user status:", error);
    return res.status(500).json({
      meta: { statusCode: 500, status: false, message: "Server error" }
    });
  }
};

// Get all withdrawal requests
exports.getWithdrawalRequests = async (req, res) => {
  try {
    const users = await User.find(
      { 'withdrawalHistory.0': { $exists: true } },
      {
        email: 1,
        withdrawalHistory: 1,
        binanceWallet: 1
      }
    );

    let allWithdrawals = [];

    users.forEach(user => {
      if (user.withdrawalHistory && user.withdrawalHistory.length > 0) {
        user.withdrawalHistory.forEach(withdrawal => {
          allWithdrawals.push({
            id: withdrawal._id,
            withdrawalId: withdrawal.withdrawalId,
            userId: user._id,
            userEmail: user.email,
            amount: `$${withdrawal.amount.toFixed(2)}`,
            binanceWallet: user.binanceWallet || 'Not provided',
            status: withdrawal.status,
            requestedAt: new Date(withdrawal.requestedAt).toLocaleDateString(),
            processedAt: withdrawal.processedAt ? new Date(withdrawal.processedAt).toLocaleDateString() : null,
            adminNotes: withdrawal.adminNotes || null
          });
        });
      }
    });

    // Sort by request date (newest first)
    allWithdrawals.sort((a, b) => new Date(b.requestedAt) - new Date(a.requestedAt));

    return res.status(200).json({
      meta: { statusCode: 200, status: true, message: "Withdrawal requests retrieved successfully" },
      data: allWithdrawals
    });

  } catch (error) {
    console.error("Error getting withdrawal requests:", error);
    return res.status(500).json({
      meta: { statusCode: 500, status: false, message: "Server error" }
    });
  }
};

// Get dashboard stats for admin
exports.getAdminStats = async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const pendingUsers = await User.countDocuments({ verificationStatus: 'pending' });
    const approvedUsers = await User.countDocuments({ verificationStatus: 'approved' });
    const activeInvestments = await User.countDocuments({ 'selectedPlan.isActive': true });

    // Get total withdrawal amounts by status
    const users = await User.find({}, { withdrawalHistory: 1 });
    let totalPendingWithdrawals = 0;
    let totalCompletedWithdrawals = 0;
    let pendingWithdrawalCount = 0;

    users.forEach(user => {
      if (user.withdrawalHistory) {
        user.withdrawalHistory.forEach(withdrawal => {
          if (withdrawal.status === 'pending') {
            totalPendingWithdrawals += withdrawal.amount;
            pendingWithdrawalCount++;
          } else if (withdrawal.status === 'completed') {
            totalCompletedWithdrawals += withdrawal.amount;
          }
        });
      }
    });

    return res.status(200).json({
      meta: { statusCode: 200, status: true, message: "Admin stats retrieved successfully" },
      data: {
        totalUsers,
        pendingUsers,
        approvedUsers,
        activeInvestments,
        totalPendingWithdrawals: `$${totalPendingWithdrawals.toFixed(2)}`,
        totalCompletedWithdrawals: `$${totalCompletedWithdrawals.toFixed(2)}`,
        pendingWithdrawalCount
      }
    });

  } catch (error) {
    console.error("Error getting admin stats:", error);
    return res.status(500).json({
      meta: { statusCode: 500, status: false, message: "Server error" }
    });
  }
};