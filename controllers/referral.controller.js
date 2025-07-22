const User = require('../models/user.model');

// Generate referral code - only for approved users
exports.generateReferralCode = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        meta: { statusCode: 404, status: false, message: "User not found" }
      });
    }

    // Check if user is approved
    if (user.verificationStatus !== 'approved') {
      return res.status(403).json({
        meta: { 
          statusCode: 403, 
          status: false, 
          message: "Referral features are only available for approved accounts" 
        }
      });
    }

    // Generate referral code if not exists
    if (!user.referralCode) {
      const generatedCode = `${user.email.split('@')[0]}_${user._id.toString().slice(-6)}`.toUpperCase();
      user.referralCode = generatedCode;
      await user.save();
    }

    const referralLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/register?ref=${user.referralCode}`;

    return res.status(200).json({
      meta: { statusCode: 200, status: true, message: "Referral code generated successfully" },
      data: {
        referralCode: user.referralCode,
        referralLink: referralLink
      }
    });

  } catch (error) {
    console.error("Error generating referral code:", error);
    return res.status(500).json({
      meta: { statusCode: 500, status: false, message: "Server error" }
    });
  }
};

// Get referral stats - only for approved users
exports.getReferralStats = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        meta: { statusCode: 404, status: false, message: "User not found" }
      });
    }

    // Check if user is approved
    if (user.verificationStatus !== 'approved') {
      return res.status(403).json({
        meta: { 
          statusCode: 403, 
          status: false, 
          message: "Referral features are only available for approved accounts" 
        }
      });
    }

    // Generate referral code if not exists
    if (!user.referralCode) {
      const generatedCode = `${user.email.split('@')[0]}_${user._id.toString().slice(-6)}`.toUpperCase();
      user.referralCode = generatedCode;
      await user.save();
    }

    // Count referrals
    const totalReferrals = await User.countDocuments({ referredBy: user.referralCode });
    const activeReferrals = await User.countDocuments({ 
      referredBy: user.referralCode,
      verificationStatus: 'approved' 
    });

    const referralLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/register?ref=${user.referralCode}`;

    return res.status(200).json({
      meta: { statusCode: 200, status: true, message: "Referral stats retrieved successfully" },
      data: {
        referralCode: user.referralCode,
        referralLink: referralLink,
        totalReferrals: totalReferrals,
        activeReferrals: activeReferrals,
        referralEarnings: `$${(user.totalReferralEarnings || 0).toFixed(2)}`
      }
    });

  } catch (error) {
    console.error("Error getting referral stats:", error);
    return res.status(500).json({
      meta: { statusCode: 500, status: false, message: "Server error" }
    });
  }
};

// Get referred users list - only for approved users
exports.getReferredUsers = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        meta: { statusCode: 404, status: false, message: "User not found" }
      });
    }

    // Check if user is approved
    if (user.verificationStatus !== 'approved') {
      return res.status(403).json({
        meta: { 
          statusCode: 403, 
          status: false, 
          message: "Referral features are only available for approved accounts" 
        }
      });
    }

    if (!user.referralCode) {
      return res.status(200).json({
        meta: { statusCode: 200, status: true, message: "No referrals found" },
        data: []
      });
    }

    // Get referred users
    const referredUsers = await User.find(
      { referredBy: user.referralCode },
      { email: 1, createdAt: 1, verificationStatus: 1, selectedPlan: 1 }
    ).sort({ createdAt: -1 });

    const formattedUsers = referredUsers.map(refUser => ({
      name: refUser.email.split('@')[0],
      email: refUser.email,
      joinDate: new Date(refUser.createdAt).toLocaleDateString(),
      status: refUser.verificationStatus,
      plan: refUser.selectedPlan?.planName || 'No Plan'
    }));

    return res.status(200).json({
      meta: { statusCode: 200, status: true, message: "Referred users retrieved successfully" },
      data: formattedUsers
    });

  } catch (error) {
    console.error("Error getting referred users:", error);
    return res.status(500).json({
      meta: { statusCode: 500, status: false, message: "Server error" }
    });
  }
};