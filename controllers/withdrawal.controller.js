const User = require('../models/user.model');
const { v4: uuidv4 } = require('uuid');

exports.requestWithdrawal = async (req, res) => {
  try {
    const { userId, amount, binanceWallet } = req.body;

    if (!userId || !amount || !binanceWallet) {
      return res.status(400).json({
        meta: { statusCode: 400, status: false, message: "Missing required fields" }
      });
    }

    if (amount < 30) {
      return res.status(400).json({
        meta: { statusCode: 400, status: false, message: "Minimum withdrawal amount is $30" }
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        meta: { statusCode: 404, status: false, message: "User not found" }
      });
    }

    if (user.verificationStatus !== 'approved') {
      return res.status(403).json({
        meta: {
          statusCode: 403,
          status: false,
          message: "Withdrawal features are only available for approved accounts"
        }
      });
    }

    const totalEarned = (user.selectedPlan?.totalEarned || 0) + (user.totalReferralEarnings || 0);
    const totalWithdrawn = user.totalWithdrawn || 0;
    const availableBalance = totalEarned - totalWithdrawn;

    if (availableBalance < amount) {
      return res.status(400).json({
        meta: { statusCode: 400, status: false, message: "Insufficient balance" }
      });
    }

    const withdrawalData = {
      withdrawalId: `WD_${Date.now()}_${require('uuid').v4().slice(0, 8)}`,
      amount: parseFloat(amount),
      binanceWallet: binanceWallet.trim(),
      requestedAt: new Date(),
      status: 'pending'
    };

    if (!user.withdrawalHistory) {
      user.withdrawalHistory = [];
    }
    user.withdrawalHistory.push(withdrawalData);

    user.binanceWallet = binanceWallet.trim();

    await user.save();

    return res.status(201).json({
      meta: { statusCode: 201, status: true, message: "Withdrawal request submitted successfully" },
      data: {
        withdrawalId: withdrawalData.withdrawalId,
        amount: `${amount}`,
        status: 'pending'
      }
    });

  } catch (error) {
    console.error("Error requesting withdrawal:", error);
    return res.status(500).json({
      meta: { statusCode: 500, status: false, message: "Server error" }
    });
  }
};

exports.getWithdrawalHistory = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId, { withdrawalHistory: 1 });
    if (!user) {
      return res.status(404).json({
        meta: { statusCode: 404, status: false, message: "User not found" }
      });
    }

    const history = (user.withdrawalHistory || []).map(withdrawal => ({
      withdrawalId: withdrawal.withdrawalId,
      amount: `$${withdrawal.amount.toFixed(2)}`,
      status: withdrawal.status,
      requestedAt: new Date(withdrawal.requestedAt).toLocaleDateString(),
      processedAt: withdrawal.processedAt ? new Date(withdrawal.processedAt).toLocaleDateString() : null
    })).reverse();

    return res.status(200).json({
      meta: { statusCode: 200, status: true, message: "Withdrawal history retrieved successfully" },
      data: history
    });

  } catch (error) {
    console.error("Error getting withdrawal history:", error);
    return res.status(500).json({
      meta: { statusCode: 500, status: false, message: "Server error" }
    });
  }
};

exports.getWithdrawalStats = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId, {
      selectedPlan: 1,
      totalReferralEarnings: 1,
      totalWithdrawn: 1,
      withdrawalHistory: 1,
      verificationStatus: 1
    });

    if (!user) {
      return res.status(404).json({
        meta: { statusCode: 404, status: false, message: "User not found" }
      });
    }

    if (user.verificationStatus !== 'approved') {
      return res.status(200).json({
        meta: { statusCode: 200, status: true, message: "Withdrawal stats retrieved successfully" },
        data: {
          totalEarned: "$0.00",
          totalWithdrawn: "$0.00",
          availableBalance: "$0.00",
          message: "Features available after account approval"
        }
      });
    }

    const investmentEarnings = user.selectedPlan?.totalEarned || 0;
    const referralEarnings = user.totalReferralEarnings || 0;
    const totalEarned = investmentEarnings + referralEarnings;

    const totalWithdrawnFromHistory = (user.withdrawalHistory || [])
      .filter(w => w.status === 'completed')
      .reduce((sum, w) => sum + w.amount, 0);

    const availableBalance = totalEarned - totalWithdrawnFromHistory;

    const stats = {
      totalEarned: `${totalEarned.toFixed(2)}`,
      totalWithdrawn: `${totalWithdrawnFromHistory.toFixed(2)}`,
      availableBalance: `${Math.max(0, availableBalance).toFixed(2)}`
    };

    return res.status(200).json({
      meta: { statusCode: 200, status: true, message: "Withdrawal stats retrieved successfully" },
      data: stats
    });

  } catch (error) {
    console.error("Error getting withdrawal stats:", error);
    return res.status(500).json({
      meta: { statusCode: 500, status: false, message: "Server error" }
    });
  }
};

exports.updateWithdrawalStatus = async (req, res) => {
  try {
    const { withdrawalId, status, adminNotes } = req.body;

    if (!withdrawalId || !status) {
      return res.status(400).json({
        meta: { statusCode: 400, status: false, message: "Withdrawal ID and status are required" }
      });
    }

    if (!['pending', 'approved', 'rejected', 'completed'].includes(status)) {
      return res.status(400).json({
        meta: { statusCode: 400, status: false, message: "Invalid status" }
      });
    }

    const user = await User.findOne({ 'withdrawalHistory.withdrawalId': withdrawalId });
    if (!user) {
      return res.status(404).json({
        meta: { statusCode: 404, status: false, message: "Withdrawal request not found" }
      });
    }

    const withdrawal = user.withdrawalHistory.find(w => w.withdrawalId === withdrawalId);
    if (!withdrawal) {
      return res.status(404).json({
        meta: { statusCode: 404, status: false, message: "Withdrawal request not found" }
      });
    }

    withdrawal.status = status;
    withdrawal.processedAt = new Date();
    if (adminNotes) {
      withdrawal.adminNotes = adminNotes;
    }

    if (status === 'completed') {
      user.totalWithdrawn = (user.totalWithdrawn || 0) + withdrawal.amount;
    }

    await user.save();

    return res.status(200).json({
      meta: { statusCode: 200, status: true, message: `Withdrawal ${status} successfully` },
      data: {
        withdrawalId,
        status,
        userEmail: user.email,
        amount: `$${withdrawal.amount.toFixed(2)}`
      }
    });

  } catch (error) {
    console.error("Error updating withdrawal status:", error);
    return res.status(500).json({
      meta: { statusCode: 500, status: false, message: "Server error" }
    });
  }
};