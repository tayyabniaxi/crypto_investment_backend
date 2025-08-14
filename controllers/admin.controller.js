const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('config');
const User = require('../models/user.model');
const AdminSettings = require('../models/adminSettings.model');

const awardReferralBonus = async (approvedUser) => {
  try {
    if (!approvedUser.referredBy) {
      return { success: true, message: 'No referral to process' };
    }

    const referrer = await User.findOne({ referralCode: approvedUser.referredBy });
    if (!referrer) {
      return { success: false, message: 'Referrer not found' };
    }

    const existingBonus = referrer.referralEarnings?.find(
      earning => earning.fromUserId.toString() === approvedUser._id.toString() && 
                 earning.commissionPercentage === 0
    );

    if (existingBonus) {
      return { success: true, message: 'Bonus already awarded' };
    }

    // FIXED: Calculate 3% of the investment amount instead of fixed $3
    const investmentValue = approvedUser.selectedPlan?.investmentValue || 0;
    
    // If investmentValue is not available, extract from investmentAmount string
    let investmentAmount = 0;
    if (investmentValue > 0) {
      investmentAmount = investmentValue;
    } else if (approvedUser.selectedPlan?.investmentAmount) {
      // Extract number from string like "$100", "$200", etc.
      investmentAmount = parseFloat(approvedUser.selectedPlan.investmentAmount.replace('$', ''));
    }

    if (investmentAmount <= 0) {
      return { success: false, message: 'Invalid investment amount for referral calculation' };
    }

    // Calculate 3% of investment amount
    const referralBonus = (investmentAmount * 3) / 100;
    
    console.log(`💰 Calculating referral bonus: ${investmentAmount} × 3% = $${referralBonus.toFixed(2)}`);
    
    const referralEarning = {
      fromUserId: approvedUser._id,
      fromUserEmail: approvedUser.email,
      fromUserPlan: approvedUser.selectedPlan?.planName || 'unknown',
      commissionAmount: referralBonus,
      commissionPercentage: 0, // 0 indicates signup bonus
      originalProfitAmount: investmentAmount, // Store investment amount for reference
      earnedAt: new Date(),
      status: 'paid'
    };

    if (!referrer.referralEarnings) {
      referrer.referralEarnings = [];
    }
    
    referrer.referralEarnings.push(referralEarning);
    referrer.totalReferralEarnings = (referrer.totalReferralEarnings || 0) + referralBonus;
    referrer.totalBalance = (referrer.totalBalance || 0) + referralBonus;

    await referrer.save();

    console.log(`✅ Referral bonus awarded: $${referralBonus.toFixed(2)} (3% of $${investmentAmount}) to ${referrer.email}`);

    return {
      success: true,
      referrerEmail: referrer.email,
      bonusAmount: referralBonus,
      investmentAmount: investmentAmount,
      newBalance: referrer.totalBalance
    };
    
  } catch (error) {
    console.error('Error awarding referral bonus:', error);
    return { success: false, error: error.message };
  }
};

exports.adminLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    const adminEmail = process.env.ADMIN_EMAIL || 'admin@seashell.com';
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin12@';

    if (email !== adminEmail || password !== adminPassword) {
      return res.status(401).json({
        meta: { statusCode: 401, status: false, message: "Invalid admin credentials" }
      });
    }

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
    return res.status(500).json({
      meta: { statusCode: 500, status: false, message: "Server error" }
    });
  }
};

exports.getAccountNumber = async (req, res) => {
  try {
    let settings = await AdminSettings.findOne();
    
    if (!settings) {
      settings = new AdminSettings({
        accountNumber: "1234567890123456",
        updatedAt: new Date()
      });
      await settings.save();
    }

    return res.status(200).json({
      meta: { statusCode: 200, status: true, message: "Account number retrieved successfully" },
      data: {
        accountNumber: settings.accountNumber
      }
    });

  } catch (error) {
    return res.status(500).json({
      meta: { statusCode: 500, status: false, message: "Server error" }
    });
  }
};

exports.updateAccountNumber = async (req, res) => {
  try {
    const { accountNumber } = req.body;

    if (!accountNumber || !accountNumber.trim()) {
      return res.status(400).json({
        meta: { statusCode: 400, status: false, message: "Account number is required" }
      });
    }

    let settings = await AdminSettings.findOne();
    
    if (!settings) {
      settings = new AdminSettings({
        accountNumber: accountNumber.trim(),
        updatedAt: new Date()
      });
    } else {
      settings.accountNumber = accountNumber.trim();
      settings.updatedAt = new Date();
    }

    await settings.save();

    return res.status(200).json({
      meta: { statusCode: 200, status: true, message: "Account number updated successfully" },
      data: {
        accountNumber: settings.accountNumber
      }
    });

  } catch (error) {
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
        verificationStatus: 1,
        referredBy: 1
      }
    ).sort({ createdAt: -1 });

    const formattedUsers = pendingUsers.map(user => ({
      id: user._id,
      email: user.email,
      plan: user.selectedPlan?.planName || 'No Plan',
      investmentAmount: user.selectedPlan?.investmentAmount || '$0',
      screenshot: user.profileImage?.url || null,
      registeredAt: new Date(user.createdAt).toLocaleDateString(),
      status: user.verificationStatus,
      referredBy: user.referredBy || null
    }));

    return res.status(200).json({
      meta: { statusCode: 200, status: true, message: "Pending users retrieved successfully" },
      data: formattedUsers
    });

  } catch (error) {
    return res.status(500).json({
      meta: { statusCode: 500, status: false, message: "Server error" }
    });
  }
};

// NEW: Get approved users
exports.getApprovedUsers = async (req, res) => {
  try {
    const approvedUsers = await User.find(
      { verificationStatus: 'approved' },
      {
        email: 1,
        selectedPlan: 1,
        createdAt: 1,
        verificationStatus: 1,
        referredBy: 1,
        totalBalance: 1,
        totalReferralEarnings: 1,
        isVerified: 1
      }
    ).sort({ createdAt: -1 });

    const formattedUsers = approvedUsers.map(user => ({
      id: user._id,
      email: user.email,
      plan: user.selectedPlan?.planName || 'No Plan',
      investmentAmount: user.selectedPlan?.investmentAmount || '$0',
      dailyReturn: user.selectedPlan?.dailyReturn || '$0',
      totalEarned: `$${(user.selectedPlan?.totalEarned || 0).toFixed(2)}`,
      totalBalance: `$${(user.totalBalance || 0).toFixed(2)}`,
      totalReferralEarnings: `$${(user.totalReferralEarnings || 0).toFixed(2)}`,
      planStartDate: user.selectedPlan?.startDate ? new Date(user.selectedPlan?.startDate).toLocaleDateString() : 'Not started',
      lastProfitDate: user.selectedPlan?.lastProfitDate ? new Date(user.selectedPlan?.lastProfitDate).toLocaleDateString() : 'No profits yet',
      registeredAt: new Date(user.createdAt).toLocaleDateString(),
      status: user.verificationStatus,
      referredBy: user.referredBy || null,
      isActive: user.selectedPlan?.isActive || false
    }));

    return res.status(200).json({
      meta: { statusCode: 200, status: true, message: "Approved users retrieved successfully" },
      data: formattedUsers
    });

  } catch (error) {
    return res.status(500).json({
      meta: { statusCode: 500, status: false, message: "Server error" }
    });
  }
};

// NEW: Get user's daily profit history
exports.getUserProfitHistory = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId, {
      email: 1,
      selectedPlan: 1,
      createdAt: 1,
      totalBalance: 1,
      totalReferralEarnings: 1,
      referralEarnings: 1
    });

    if (!user) {
      return res.status(404).json({
        meta: { statusCode: 404, status: false, message: "User not found" }
      });
    }

    // Calculate profit history based on plan start date and daily returns
    const profitHistory = [];
    
    if (user.selectedPlan && user.selectedPlan.startDate) {
      const startDate = new Date(user.selectedPlan.startDate);
      const currentDate = new Date();
      const dailyReturnAmount = parseFloat(user.selectedPlan.dailyReturn.replace('$', ''));
      
      // Calculate days since plan started
      const daysDiff = Math.floor((currentDate - startDate) / (1000 * 60 * 60 * 24));
      
      for (let i = 0; i <= daysDiff; i++) {
        const profitDate = new Date(startDate);
        profitDate.setDate(startDate.getDate() + i);
        
        // Only add profits for past dates (not future)
        if (profitDate <= currentDate) {
          profitHistory.push({
            date: profitDate.toLocaleDateString(),
            day: i + 1,
            profitAmount: `$${dailyReturnAmount.toFixed(2)}`,
            cumulativeTotal: `$${((i + 1) * dailyReturnAmount).toFixed(2)}`,
            status: 'completed'
          });
        }
      }
    }

    // UPDATED: Format referral earnings with correct descriptions
    const referralHistory = (user.referralEarnings || []).map(earning => ({
      date: new Date(earning.earnedAt).toLocaleDateString(),
      fromUser: earning.fromUserEmail,
      type: earning.commissionPercentage === 0 ? 'Signup Bonus (3% of investment)' : 'Daily Commission (20% of daily profit)',
      amount: `$${earning.commissionAmount.toFixed(2)}`,
      percentage: earning.commissionPercentage === 0 ? '3% of investment' : `${earning.commissionPercentage}% of daily profit`,
      originalProfit: earning.commissionPercentage === 0 ? `$${earning.originalProfitAmount.toFixed(2)} (investment)` : `$${earning.originalProfitAmount.toFixed(2)} (daily profit)`,
      status: earning.status
    }));

    const userSummary = {
      id: user._id,
      email: user.email,
      plan: user.selectedPlan?.planName || 'No Plan',
      investmentAmount: user.selectedPlan?.investmentAmount || '$0',
      dailyReturn: user.selectedPlan?.dailyReturn || '$0',
      planStartDate: user.selectedPlan?.startDate ? new Date(user.selectedPlan?.startDate).toLocaleDateString() : 'Not started',
      totalInvestmentEarnings: `$${(user.selectedPlan?.totalEarned || 0).toFixed(2)}`,
      totalReferralEarnings: `$${(user.totalReferralEarnings || 0).toFixed(2)}`,
      totalBalance: `$${(user.totalBalance || 0).toFixed(2)}`,
      totalDays: profitHistory.length,
      registeredAt: new Date(user.createdAt).toLocaleDateString(),
      isActive: user.selectedPlan?.isActive || false
    };

    return res.status(200).json({
      meta: { statusCode: 200, status: true, message: "User profit history retrieved successfully" },
      data: {
        user: userSummary,
        dailyProfits: profitHistory.reverse(), // Show latest first
        referralEarnings: referralHistory.reverse() // Show latest first
      }
    });

  } catch (error) {
    console.error("Error getting user profit history:", error);
    return res.status(500).json({
      meta: { statusCode: 500, status: false, message: "Server error" }
    });
  }
};

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

    const previousStatus = user.verificationStatus;

    if (status === 'approved') {
      user.verificationStatus = 'approved';
      user.isVerified = true;
      
      if (user.selectedPlan) {
        user.selectedPlan.isActive = true;
        user.selectedPlan.startDate = new Date();
        
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        user.selectedPlan.lastProfitDate = yesterday;
      }
      
      await user.save();

      let bonusResult = { success: true, message: 'No referral to process' };
      if (previousStatus !== 'approved') {
        bonusResult = await awardReferralBonus(user);
      }

      let responseMessage = "User approved successfully. Daily profits will start automatically.";
      if (bonusResult?.success && bonusResult?.referrerEmail) {
        responseMessage += ` Referral bonus of $${bonusResult.bonusAmount.toFixed(2)} (3% of $${bonusResult.investmentAmount}) awarded to ${bonusResult.referrerEmail}.`;
      }

      return res.status(200).json({
        meta: { statusCode: 200, status: true, message: responseMessage },
        data: { 
          userId, 
          status: 'approved', 
          email: user.email, 
          plan: user.selectedPlan?.planName,
          referralBonus: bonusResult
        }
      });

    } else if (status === 'rejected') {
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
            amount: `${withdrawal.amount.toFixed(2)}`,
            binanceWallet: user.binanceWallet || 'Not provided',
            status: withdrawal.status,
            requestedAt: new Date(withdrawal.requestedAt).toLocaleDateString(),
            processedAt: withdrawal.processedAt ? new Date(withdrawal.processedAt).toLocaleDateString() : null,
            adminNotes: withdrawal.adminNotes || null
          });
        });
      }
    });

    allWithdrawals.sort((a, b) => new Date(b.requestedAt) - new Date(a.requestedAt));

    return res.status(200).json({
      meta: { statusCode: 200, status: true, message: "Withdrawal requests retrieved successfully" },
      data: allWithdrawals
    });

  } catch (error) {
    return res.status(500).json({
      meta: { statusCode: 500, status: false, message: "Server error" }
    });
  }
};

exports.getAdminStats = async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const pendingUsers = await User.countDocuments({ verificationStatus: 'pending' });
    const approvedUsers = await User.countDocuments({ verificationStatus: 'approved' });
    const activeInvestments = await User.countDocuments({ 'selectedPlan.isActive': true });

    const users = await User.find({}, { withdrawalHistory: 1, totalBalance: 1, selectedPlan: 1, totalReferralEarnings: 1 });
    let totalPendingWithdrawals = 0;
    let totalCompletedWithdrawals = 0;
    let pendingWithdrawalCount = 0;
    let totalInvestmentEarnings = 0;
    let totalReferralEarnings = 0;
    let totalAvailableBalance = 0;

    users.forEach(user => {
      if (user.selectedPlan) {
        totalInvestmentEarnings += user.selectedPlan.totalEarned || 0;
      }
      totalReferralEarnings += user.totalReferralEarnings || 0;
      totalAvailableBalance += user.totalBalance || 0;

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
        totalPendingWithdrawals: `${totalPendingWithdrawals.toFixed(2)}`,
        totalCompletedWithdrawals: `${totalCompletedWithdrawals.toFixed(2)}`,
        pendingWithdrawalCount,
        totalInvestmentEarnings: `${totalInvestmentEarnings.toFixed(2)}`,
        totalReferralEarnings: `${totalReferralEarnings.toFixed(2)}`,
        totalAvailableBalance: `${totalAvailableBalance.toFixed(2)}`
      }
    });

  } catch (error) {
    return res.status(500).json({
      meta: { statusCode: 500, status: false, message: "Server error" }
    });
  }
};