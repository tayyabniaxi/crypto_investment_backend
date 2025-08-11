const User = require('../models/user.model');
const { v4: uuidv4 } = require('uuid');

// Helper function to get next available withdrawal Friday
const getNextWithdrawalFriday = () => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  // Find next Friday
  let nextFriday = new Date(today);
  const daysUntilFriday = (5 - today.getDay() + 7) % 7 || 7; // 5 = Friday, if today is Friday, get next Friday
  nextFriday.setDate(today.getDate() + daysUntilFriday);
  
  return nextFriday;
};

// Helper function to check if today is a withdrawal Friday
const isWithdrawalFriday = () => {
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0 = Sunday, 5 = Friday
  
  if (dayOfWeek !== 5) return false; // Not Friday
  
  // Check if it's been at least 14 days since last withdrawal Friday
  // For simplicity, we'll consider every Friday as withdrawal day for now
  // You can enhance this by storing the last withdrawal Friday in database
  return true;
};

// Helper function to get last withdrawal attempt date
const getLastWithdrawalAttempt = (withdrawalHistory) => {
  if (!withdrawalHistory || withdrawalHistory.length === 0) return null;
  
  // Sort by requestedAt date and get the latest
  const sortedHistory = withdrawalHistory.sort((a, b) => new Date(b.requestedAt) - new Date(a.requestedAt));
  return new Date(sortedHistory[0].requestedAt);
};

// Helper function to check if user can make withdrawal request
const canMakeWithdrawalRequest = (withdrawalHistory) => {
  const today = new Date();
  const dayOfWeek = today.getDay();
  
  // Must be Friday
  if (dayOfWeek !== 5) {
    const nextFriday = getNextWithdrawalFriday();
    return {
      canWithdraw: false,
      reason: 'not_friday',
      message: `Withdrawals are only available on Fridays. Next withdrawal date: ${nextFriday.toDateString()}`
    };
  }
  
  // Check if user has made a withdrawal request in the last 14 days
  const lastAttempt = getLastWithdrawalAttempt(withdrawalHistory);
  if (lastAttempt) {
    const daysSinceLastAttempt = Math.floor((today - lastAttempt) / (1000 * 60 * 60 * 24));
    if (daysSinceLastAttempt < 14) {
      const nextAllowedDate = new Date(lastAttempt);
      nextAllowedDate.setDate(nextAllowedDate.getDate() + 14);
      
      // Find the next Friday after the 14-day period
      while (nextAllowedDate.getDay() !== 5) {
        nextAllowedDate.setDate(nextAllowedDate.getDate() + 1);
      }
      
      return {
        canWithdraw: false,
        reason: 'too_soon',
        message: `You can only make withdrawal requests every 14 days. Next available date: ${nextAllowedDate.toDateString()}`,
        daysRemaining: 14 - daysSinceLastAttempt
      };
    }
  }
  
  return {
    canWithdraw: true,
    message: 'Withdrawal request allowed'
  };
};

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

    // Check withdrawal timing restrictions
    const withdrawalCheck = canMakeWithdrawalRequest(user.withdrawalHistory);
    if (!withdrawalCheck.canWithdraw) {
      return res.status(400).json({
        meta: {
          statusCode: 400,
          status: false,
          message: withdrawalCheck.message,
          reason: withdrawalCheck.reason,
          ...(withdrawalCheck.daysRemaining && { daysRemaining: withdrawalCheck.daysRemaining })
        }
      });
    }

    // REMOVED: 50% limit calculation
    // Calculate total earnings (investment + referral)
    const investmentEarnings = user.selectedPlan?.totalEarned || 0;
    const referralEarnings = user.totalReferralEarnings || 0;
    const totalEarnings = investmentEarnings + referralEarnings;
    
    // Calculate already withdrawn amount
    const totalWithdrawn = user.totalWithdrawn || 0;
    
    // UPDATED: Available for withdrawal = total earnings - already withdrawn (100% available)
    const availableForWithdrawal = Math.max(0, totalEarnings - totalWithdrawn);

    console.log(`💡 Withdrawal calculation for ${user.email}:`);
    console.log(`📊 Total Earnings: $${totalEarnings.toFixed(2)}`);
    console.log(`💸 Already Withdrawn: $${totalWithdrawn.toFixed(2)}`);
    console.log(`✅ Available for Withdrawal: $${availableForWithdrawal.toFixed(2)}`);

    if (availableForWithdrawal < amount) {
      return res.status(400).json({
        meta: { 
          statusCode: 400, 
          status: false, 
          message: `Insufficient balance. You can withdraw up to $${availableForWithdrawal.toFixed(2)} from your total earnings` 
        }
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

    // Update totalWithdrawn to include pending withdrawal
    user.totalWithdrawn = (user.totalWithdrawn || 0) + parseFloat(amount);
    
    // Update totalBalance (total earnings - total withdrawn)
    user.totalBalance = totalEarnings - user.totalWithdrawn;

    user.binanceWallet = binanceWallet.trim();

    await user.save();

    console.log(`💸 Withdrawal requested: $${amount} by ${user.email} on Friday`);
    console.log(`📊 New available for withdrawal: $${Math.max(0, totalEarnings - user.totalWithdrawn).toFixed(2)}`);

    // Calculate next allowed withdrawal date
    const nextAllowedDate = new Date();
    nextAllowedDate.setDate(nextAllowedDate.getDate() + 14);
    while (nextAllowedDate.getDay() !== 5) {
      nextAllowedDate.setDate(nextAllowedDate.getDate() + 1);
    }

    return res.status(201).json({
      meta: { statusCode: 201, status: true, message: "Withdrawal request submitted successfully" },
      data: {
        withdrawalId: withdrawalData.withdrawalId,
        amount: `$${amount}`,
        status: 'pending',
        totalEarnings: `$${totalEarnings.toFixed(2)}`,
        availableForWithdrawal: `$${Math.max(0, totalEarnings - user.totalWithdrawn).toFixed(2)}`,
        totalWithdrawn: `$${user.totalWithdrawn.toFixed(2)}`,
        nextWithdrawalDate: nextAllowedDate.toDateString()
      }
    });

  } catch (error) {
    console.error("Error requesting withdrawal:", error);
    return res.status(500).json({
      meta: { statusCode: 500, status: false, message: "Server error" }
    });
  }
};

// New endpoint to check withdrawal availability
exports.checkWithdrawalAvailability = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId, { withdrawalHistory: 1, verificationStatus: 1 });
    if (!user) {
      return res.status(404).json({
        meta: { statusCode: 404, status: false, message: "User not found" }
      });
    }

    if (user.verificationStatus !== 'approved') {
      return res.status(200).json({
        meta: { statusCode: 200, status: true, message: "Withdrawal availability checked" },
        data: {
          canWithdraw: false,
          reason: 'not_approved',
          message: 'Account must be approved to access withdrawal features'
        }
      });
    }

    const withdrawalCheck = canMakeWithdrawalRequest(user.withdrawalHistory);
    const nextFriday = getNextWithdrawalFriday();

    return res.status(200).json({
      meta: { statusCode: 200, status: true, message: "Withdrawal availability checked" },
      data: {
        ...withdrawalCheck,
        nextFriday: nextFriday.toDateString(),
        isFriday: new Date().getDay() === 5,
        currentDay: new Date().toDateString()
      }
    });

  } catch (error) {
    console.error("Error checking withdrawal availability:", error);
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
      processedAt: withdrawal.processedAt ? new Date(withdrawal.processedAt).toLocaleDateString() : null,
      dayOfWeek: new Date(withdrawal.requestedAt).toLocaleDateString('en-US', { weekday: 'long' })
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
      totalBalance: 1,
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
          withdrawableAmount: "$0.00",
          withdrawalLimit: "100% of total earnings",
          message: "Features available after account approval",
          canWithdraw: false,
          nextWithdrawalDate: "Account approval required"
        }
      });
    }

    // Calculate total earnings
    const investmentEarnings = user.selectedPlan?.totalEarned || 0;
    const referralEarnings = user.totalReferralEarnings || 0;
    const totalEarnings = investmentEarnings + referralEarnings;
    
    // Calculate already withdrawn
    const totalWithdrawn = user.totalWithdrawn || 0;
    
    // UPDATED: Available for withdrawal = total earnings - already withdrawn (100% available)
    const availableForWithdrawal = Math.max(0, totalEarnings - totalWithdrawn);

    // Check withdrawal timing
    const withdrawalCheck = canMakeWithdrawalRequest(user.withdrawalHistory);
    const nextFriday = getNextWithdrawalFriday();

    const stats = {
      totalEarned: `$${totalEarnings.toFixed(2)}`,
      investmentEarnings: `$${investmentEarnings.toFixed(2)}`,
      referralEarnings: `$${referralEarnings.toFixed(2)}`,
      totalWithdrawn: `$${totalWithdrawn.toFixed(2)}`,
      availableBalance: `$${availableForWithdrawal.toFixed(2)}`,
      withdrawalLimit: "100% of total earnings", // UPDATED: Changed from 50% to 100%
      remainingBalance: `$${Math.max(0, totalEarnings - totalWithdrawn).toFixed(2)}`,
      
      // Withdrawal timing info
      canWithdraw: withdrawalCheck.canWithdraw && availableForWithdrawal >= 30,
      withdrawalMessage: withdrawalCheck.message,
      nextWithdrawalDate: withdrawalCheck.canWithdraw ? "Available now (Friday)" : 
                         (withdrawalCheck.reason === 'not_friday' ? nextFriday.toDateString() : withdrawalCheck.message),
      isFriday: new Date().getDay() === 5,
      withdrawalSchedule: "Every Friday (14-day interval)",
      ...(withdrawalCheck.daysRemaining && { daysUntilNextWithdrawal: withdrawalCheck.daysRemaining })
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

    const oldStatus = withdrawal.status;
    withdrawal.status = status;
    withdrawal.processedAt = new Date();
    if (adminNotes) {
      withdrawal.adminNotes = adminNotes;
    }

    // Handle status changes
    if (status === 'rejected' && oldStatus === 'pending') {
      // If rejected, reduce totalWithdrawn (return the money conceptually)
      user.totalWithdrawn = Math.max(0, (user.totalWithdrawn || 0) - withdrawal.amount);
      
      // Recalculate totalBalance
      const totalEarnings = (user.selectedPlan?.totalEarned || 0) + (user.totalReferralEarnings || 0);
      user.totalBalance = totalEarnings - user.totalWithdrawn;
      
      console.log(`🔄 Withdrawal rejected: $${withdrawal.amount} returned to ${user.email}'s withdrawable balance`);
      console.log(`📊 New available for withdrawal: $${Math.max(0, totalEarnings - user.totalWithdrawn).toFixed(2)}`);
    }
    // If completed or approved, totalWithdrawn stays the same (money is gone)

    await user.save();

    // Calculate current withdrawal stats for response
    const totalEarnings = (user.selectedPlan?.totalEarned || 0) + (user.totalReferralEarnings || 0);
    const availableForWithdrawal = Math.max(0, totalEarnings - user.totalWithdrawn);

    let responseMessage = `Withdrawal ${status} successfully`;
    if (status === 'rejected') {
      responseMessage += `. Amount of $${withdrawal.amount.toFixed(2)} is now available for withdrawal again.`;
    }

    return res.status(200).json({
      meta: { statusCode: 200, status: true, message: responseMessage },
      data: {
        withdrawalId,
        status,
        userEmail: user.email,
        amount: `$${withdrawal.amount.toFixed(2)}`,
        availableForWithdrawal: `$${availableForWithdrawal.toFixed(2)}`,
        totalWithdrawn: `$${user.totalWithdrawn.toFixed(2)}`,
        requestedOn: new Date(withdrawal.requestedAt).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
      }
    });

  } catch (error) {
    console.error("Error updating withdrawal status:", error);
    return res.status(500).json({
      meta: { statusCode: 500, status: false, message: "Server error" }
    });
  }
};