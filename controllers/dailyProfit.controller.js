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
const isWeekday = (date = new Date()) => {
    const dayOfWeek = date.getDay(); // 0=Sunday, 1=Monday, ..., 6=Saturday
    return dayOfWeek >= 1 && dayOfWeek <= 5; // Monday(1) to Friday(5)
};
const handleReferralCommission = async (referredUser, profitAmount) => {
    try {
        const referrer = await User.findOne({ referralCode: referredUser.referredBy });
        
        if (!referrer) {
            console.log('Referrer not found for code:', referredUser.referredBy);
            return;
        }

        // Check if referrer has an active plan
        if (!referrer.selectedPlan || !referrer.selectedPlan.isActive || referrer.verificationStatus !== 'approved') {
            console.log('Referrer does not have an active plan:', referrer.email);
            return;
        }

        // FIXED: Calculate 20% of the referred user's profit (not referrer's own profit)
        const commissionAmount = (profitAmount * 20) / 100;

        const commissionRecord = {
            fromUserId: referredUser._id,
            fromUserEmail: referredUser.email,
            fromUserPlan: referredUser.selectedPlan.planName.toLowerCase(),
            commissionAmount: commissionAmount,
            commissionPercentage: 20, // 20% of referred user's profit
            originalProfitAmount: profitAmount, // The referred user's profit amount
            earnedAt: new Date(),
            status: 'paid'
        };

        if (!referrer.referralEarnings) {
            referrer.referralEarnings = [];
        }

        referrer.referralEarnings.push(commissionRecord);
        referrer.totalReferralEarnings = (referrer.totalReferralEarnings || 0) + commissionAmount;
        
        // Update totalBalance to include new referral commission
        const investmentEarnings = referrer.selectedPlan?.totalEarned || 0;
        const referralEarnings = referrer.totalReferralEarnings;
        referrer.totalBalance = investmentEarnings + referralEarnings;

        await referrer.save();

        console.log(`💰 Commission paid: $${commissionAmount.toFixed(2)} (20% of ${referredUser.email}'s daily profit $${profitAmount.toFixed(2)}) to ${referrer.email}`);

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
        
        // Update totalBalance to include new investment earnings
        const investmentEarnings = user.selectedPlan.totalEarned;
        const referralEarnings = user.totalReferralEarnings || 0;
        user.totalBalance = investmentEarnings + referralEarnings;

        // FIXED: Award referral commission (20% of THIS user's daily profit to the referrer)
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
        const today = new Date();
        
        // ADDED: Check if today is a weekday
        if (!isWeekday(today)) {
            const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][today.getDay()];
            console.log(`🛑 Weekend detected (${dayName}) - No profit distribution today`);
            
            return res.status(200).json({
                meta: { statusCode: 200, status: true, message: `Weekend - No profit distribution on ${dayName}` },
                data: {
                    totalUsers: 0,
                    processed: 0,
                    errors: 0,
                    totalProfitDistributed: "$0.00",
                    totalCommissionsPaid: "$0.00",
                    processedAt: new Date(),
                    note: `Profits will resume on Monday`
                }
            });
        }

        console.log('🚀 Starting WEEKDAY profit calculation for all users...');
        console.log(`📆 Today: ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][today.getDay()]}`);

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

        console.log(`📊 Found ${users.length} users eligible for weekday profit`);

        let processed = 0;
        let errors = 0;
        let totalProfitDistributed = 0;
        let totalCommissionsPaid = 0;

        for (const user of users) {
            try {
                // Check if user's last profit was on a weekday
                const lastProfitDate = user.selectedPlan.lastProfitDate;
                if (lastProfitDate && !isWeekday(lastProfitDate)) {
                    // Skip weekend profits that might have been missed
                    console.log(`⏭️ Skipping weekend profit for ${user.email}`);
                }

                const dailyReturnStr = user.selectedPlan.dailyReturn.replace('$', '');
                const dailyProfit = parseFloat(dailyReturnStr);

                if (!isNaN(dailyProfit) && dailyProfit > 0) {
                    user.selectedPlan.totalEarned += dailyProfit;
                    user.selectedPlan.lastProfitDate = new Date();
                    
                    // Update totalBalance to include new investment earnings
                    const investmentEarnings = user.selectedPlan.totalEarned;
                    const referralEarnings = user.totalReferralEarnings || 0;
                    user.totalBalance = investmentEarnings + referralEarnings;

                    totalProfitDistributed += dailyProfit;

                    // Award referral commission (20% of THIS user's daily profit to the referrer)
                    if (user.referredBy) {
                        const commissionAmount = (dailyProfit * 20) / 100;
                        await handleReferralCommission(user, dailyProfit);
                        totalCommissionsPaid += commissionAmount;
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

        console.log(`🎉 Weekday profit calculation completed! Processed: ${processed} users, Errors: ${errors}`);
        console.log(`💰 Total profit distributed: $${totalProfitDistributed.toFixed(2)}`);
        console.log(`🤝 Total referral commissions paid: $${totalCommissionsPaid.toFixed(2)}`);

        return res.status(200).json({
            meta: { statusCode: 200, status: true, message: "Weekday profits processed successfully" },
            data: {
                totalUsers: users.length,
                processed: processed,
                errors: errors,
                totalProfitDistributed: `$${totalProfitDistributed.toFixed(2)}`,
                totalCommissionsPaid: `$${totalCommissionsPaid.toFixed(2)}`,
                processedAt: new Date()
            }
        });

    } catch (error) {
        console.error("Error processing weekday profits:", error);
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
            referredUserProfit: commission.commissionPercentage === 0 ? 
                `$${commission.originalProfitAmount.toFixed(2)}` : // Investment amount for signup bonus
                `$${commission.originalProfitAmount.toFixed(2)}`, // Daily profit for ongoing commissions
            commissionRate: commission.commissionPercentage === 0 ? 
                '3% of investment' : // UPDATED: Show 3% of investment for signup bonus
                `20% of referred user's daily profit`,
            commissionAmount: `$${commission.commissionAmount.toFixed(2)}`,
            earnedAt: new Date(commission.earnedAt).toLocaleDateString(),
            status: commission.status,
            type: commission.commissionPercentage === 0 ? 'Signup Bonus (3% of investment)' : 'Daily Commission (20% of daily profit)'
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