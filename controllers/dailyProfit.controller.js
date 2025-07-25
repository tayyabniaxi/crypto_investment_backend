const User = require('../models/user.model');
const mongoose = require('mongoose');

const COMMISSION_RATES = {
    bronze: 5,
    silver: 7, 
    gold: 10,
    platinum: 12,
    diamond: 15,
    elite: 20
};

const handleReferralCommission = async (referredUser, profitAmount) => {
    try {
        const referrer = await User.findOne({ referralCode: referredUser.referredBy });
        
        if (!referrer) {
            console.log('Referrer not found for code:', referredUser.referredBy);
            return;
        }

        const userPlan = referredUser.selectedPlan.planName.toLowerCase();
        const commissionRate = COMMISSION_RATES[userPlan] || 5;
        
        const commissionAmount = (profitAmount * commissionRate) / 100;

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

        if (!referrer.referralEarnings) {
            referrer.referralEarnings = [];
        }

        referrer.referralEarnings.push(commissionRecord);
        referrer.totalReferralEarnings = (referrer.totalReferralEarnings || 0) + commissionAmount;
        
        referrer.totalBalance = (referrer.totalBalance || 0) + commissionAmount;

        await referrer.save();

        console.log(`💰 Commission paid: $${commissionAmount.toFixed(2)} to ${referrer.email} from ${referredUser.email}`);

    } catch (error) {
        console.error('Error handling referral commission:', error);
    }
};

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

        if (!user.selectedPlan || !user.selectedPlan.isActive || !user.isVerified || user.verificationStatus !== 'approved') {
            return res.status(400).json({
                meta: { statusCode: 400, status: false, message: "No active investment plan found or user not verified" }
            });
        }

        const today = new Date();
        const todayStart = new Date(today.setHours(0, 0, 0, 0));
        const lastProfitDate = user.selectedPlan.lastProfitDate;

        if (lastProfitDate && new Date(lastProfitDate) >= todayStart) {
            return res.status(400).json({
                meta: { statusCode: 400, status: false, message: "Daily profit already added today" }
            });
        }

        const dailyReturnStr = user.selectedPlan.dailyReturn.replace('$', '');
        const dailyProfit = parseFloat(dailyReturnStr);

        if (isNaN(dailyProfit)) {
            return res.status(500).json({
                meta: { statusCode: 500, status: false, message: "Invalid daily return amount" }
            });
        }

        user.selectedPlan.totalEarned += dailyProfit;
        user.selectedPlan.lastProfitDate = new Date();
        user.totalBalance = (user.totalBalance || 0) + dailyProfit;

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
                totalBalance: `$${user.totalBalance.toFixed(2)}`,
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

exports.processAllDailyProfits = async (req, res) => {
    try {
        console.log('🚀 Starting daily profit calculation for all users...');

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

        console.log(`📊 Found ${users.length} users eligible for daily profit`);

        let processed = 0;
        let errors = 0;
        let totalProfitDistributed = 0;

        for (const user of users) {
            try {
                const dailyReturnStr = user.selectedPlan.dailyReturn.replace('$', '');
                const dailyProfit = parseFloat(dailyReturnStr);

                if (!isNaN(dailyProfit) && dailyProfit > 0) {
                    user.selectedPlan.totalEarned += dailyProfit;
                    user.selectedPlan.lastProfitDate = new Date();
                    user.totalBalance = (user.totalBalance || 0) + dailyProfit;

                    totalProfitDistributed += dailyProfit;

                    if (user.referredBy) {
                        await handleReferralCommission(user, dailyProfit);
                    }

                    await user.save();
                    processed++;
                    
                    console.log(`✅ ${user.email}: +$${dailyProfit.toFixed(2)} (Plan: ${user.selectedPlan.planName}, Balance: $${user.totalBalance.toFixed(2)})`);
                } else {
                    console.log(`⚠️ Invalid daily profit amount for ${user.email}: ${user.selectedPlan.dailyReturn}`);
                }
            } catch (userError) {
                console.error(`❌ Error processing user ${user.email}:`, userError);
                errors++;
            }
        }

        console.log(`🎉 Daily profit calculation completed! Processed: ${processed} users, Errors: ${errors}`);
        console.log(`💰 Total profit distributed: $${totalProfitDistributed.toFixed(2)}`);

        return res.status(200).json({
            meta: { statusCode: 200, status: true, message: "Daily profits processed successfully" },
            data: {
                totalUsers: users.length,
                processed: processed,
                errors: errors,
                totalProfitDistributed: `$${totalProfitDistributed.toFixed(2)}`,
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