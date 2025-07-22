const User = require('../models/user.model');
const mongoose = require('mongoose');

// Commission rates by plan
const COMMISSION_RATES = {
    bronze: 5,    // 5% commission
    silver: 7,    // 7% commission  
    gold: 10,     // 10% commission
    platinum: 12, // 12% commission
    diamond: 15,  // 15% commission
    elite: 20     // 20% commission
};

// Calculate daily profit for a user and give referral commission
exports.calculateDailyProfit = async (req, res) => {
    try {
        const { userId } = req.body;

        if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({
                meta: { statusCode: 400, status: false, message: "Valid User ID is required" }
            });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                meta: { statusCode: 404, status: false, message: "User not found" }
            });
        }

        // Check if user has active plan and is verified
        if (!user.selectedPlan || !user.selectedPlan.isActive || !user.isVerified || user.verificationStatus !== 'approved') {
            return res.status(400).json({
                meta: { statusCode: 400, status: false, message: "No active investment plan found or user not verified" }
            });
        }

        // Check if profit already added today
        const today = new Date();
        const todayStart = new Date(today.setHours(0, 0, 0, 0));
        const lastProfitDate = user.selectedPlan.lastProfitDate;

        if (lastProfitDate && new Date(lastProfitDate) >= todayStart) {
            return res.status(400).json({
                meta: { statusCode: 400, status: false, message: "Daily profit already added today" }
            });
        }

        // Calculate daily profit (remove $ and convert to number)
        const dailyReturnStr = user.selectedPlan.dailyReturn.replace('$', '');
        const dailyProfit = parseFloat(dailyReturnStr);

        if (isNaN(dailyProfit)) {
            return res.status(500).json({
                meta: { statusCode: 500, status: false, message: "Invalid daily return amount" }
            });
        }

        // Add profit to user
        user.selectedPlan.totalEarned += dailyProfit;
        user.selectedPlan.lastProfitDate = new Date();

        // Handle referral commission if user was referred
        if (user.referredBy) {
            await handleReferralCommission(user, dailyProfit);
        }

        await user.save();

        return res.status(200).json({
            meta: { statusCode: 200, status: true, message: "Daily profit added successfully" },
            data: {
                userId: user._id,
                dailyProfit: `$${dailyProfit.toFixed(2)}`,
                totalEarned: `$${user.selectedPlan.totalEarned.toFixed(2)}`,
                lastProfitDate: user.selectedPlan.lastProfitDate
            }
        });

    } catch (error) {
        console.error("Error calculating daily profit:", error);
        return res.status(500).json({
            meta: { statusCode: 500, status: false, message: "Server error" }
        });
    }
};

// Handle referral commission
const handleReferralCommission = async (referredUser, profitAmount) => {
    try {
        // Find the referrer
        const referrer = await User.findOne({ referralCode: referredUser.referredBy });
        
        if (!referrer) {
            console.log('Referrer not found for code:', referredUser.referredBy);
            return;
        }

        // Get commission rate based on referred user's plan
        const userPlan = referredUser.selectedPlan.planName.toLowerCase();
        const commissionRate = COMMISSION_RATES[userPlan] || 5; // Default 5%
        
        // Calculate commission
        const commissionAmount = (profitAmount * commissionRate) / 100;

        // Add commission to referrer's earnings
        const commissionRecord = {
            fromUserId: referredUser._id,
            fromUserEmail: referredUser.email,
            fromUserPlan: userPlan,
            commissionAmount: commissionAmount,
            commissionPercentage: commissionRate,
            originalProfitAmount: profitAmount,
            earnedAt: new Date(),
            status: 'paid'
        };

        // Initialize referralEarnings if doesn't exist
        if (!referrer.referralEarnings) {
            referrer.referralEarnings = [];
        }

        referrer.referralEarnings.push(commissionRecord);
        referrer.totalReferralEarnings = (referrer.totalReferralEarnings || 0) + commissionAmount;

        await referrer.save();

        console.log(`Commission paid: $${commissionAmount.toFixed(2)} to ${referrer.email} from ${referredUser.email}`);

    } catch (error) {
        console.error('Error handling referral commission:', error);
    }
};

// Get all users due for daily profit (for cron job)
exports.processAllDailyProfits = async (req, res) => {
    try {
        // Find all users with active plans who haven't received today's profit
        const today = new Date();
        const todayStart = new Date(today.setHours(0, 0, 0, 0));

        const users = await User.find({
            'selectedPlan.isActive': true,
            'isVerified': true,
            'verificationStatus': 'approved',
            $or: [
                { 'selectedPlan.lastProfitDate': { $lt: todayStart } },
                { 'selectedPlan.lastProfitDate': { $exists: false } }
            ]
        });

        let processed = 0;
        let errors = 0;

        for (const user of users) {
            try {
                // Calculate daily profit for each user
                const dailyReturnStr = user.selectedPlan.dailyReturn.replace('$', '');
                const dailyProfit = parseFloat(dailyReturnStr);

                if (!isNaN(dailyProfit)) {
                    user.selectedPlan.totalEarned += dailyProfit;
                    user.selectedPlan.lastProfitDate = new Date();

                    // Handle referral commission
                    if (user.referredBy) {
                        await handleReferralCommission(user, dailyProfit);
                    }

                    await user.save();
                    processed++;
                }
            } catch (userError) {
                console.error(`Error processing user ${user._id}:`, userError);
                errors++;
            }
        }

        return res.status(200).json({
            meta: { statusCode: 200, status: true, message: "Daily profits processed successfully" },
            data: {
                totalUsers: users.length,
                processed: processed,
                errors: errors,
                processedAt: new Date()
            }
        });

    } catch (error) {
        console.error("Error processing daily profits:", error);
        return res.status(500).json({
            meta: { statusCode: 500, status: false, message: "Server error" }
        });
    }
};

// Get referral commission history
exports.getReferralCommissions = async (req, res) => {
    try {
        const { userId } = req.params;

        if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({
                meta: { statusCode: 400, status: false, message: "Valid User ID is required" }
            });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                meta: { statusCode: 404, status: false, message: "User not found" }
            });
        }

        const commissions = user.referralEarnings || [];
        const formattedCommissions = commissions.map(commission => ({
            id: commission._id,
            fromUser: commission.fromUserEmail,
            plan: commission.fromUserPlan,
            originalProfit: `$${commission.originalProfitAmount.toFixed(2)}`,
            commissionRate: `${commission.commissionPercentage}%`,
            commissionAmount: `$${commission.commissionAmount.toFixed(2)}`,
            earnedAt: new Date(commission.earnedAt).toLocaleDateString(),
            status: commission.status
        }));

        return res.status(200).json({
            meta: { statusCode: 200, status: true, message: "Referral commissions retrieved successfully" },
            data: {
                totalReferralEarnings: `$${(user.totalReferralEarnings || 0).toFixed(2)}`,
                commissions: formattedCommissions
            }
        });

    } catch (error) {
        console.error("Error getting referral commissions:", error);
        return res.status(500).json({
            meta: { statusCode: 500, status: false, message: "Server error" }
        });
    }
};