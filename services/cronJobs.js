const cron = require('node-cron');
const User = require('../models/user.model');

const COMMISSION_RATES = {
    bronze: 5, silver: 7, gold: 10, platinum: 12, diamond: 15, elite: 20
};

const handleReferralCommission = async (referredUser, profitAmount) => {
    try {
        const referrer = await User.findOne({ referralCode: referredUser.referredBy });
        
        if (!referrer) return;

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

        if (!referrer.referralEarnings) referrer.referralEarnings = [];

        referrer.referralEarnings.push(commissionRecord);
        referrer.totalReferralEarnings = (referrer.totalReferralEarnings || 0) + commissionAmount;
        referrer.totalBalance = (referrer.totalBalance || 0) + commissionAmount;

        await referrer.save();

        console.log(`💰 Commission: $${commissionAmount.toFixed(2)} → ${referrer.email} (from ${referredUser.email})`);

    } catch (error) {
        console.error('❌ Referral commission error:', error);
    }
};

const processDailyProfits = async () => {
    try {
        console.log('\n🕛 ============ AUTOMATIC DAILY PROFIT SYSTEM ============');
        console.log(`📅 Starting daily profit calculation at: ${new Date().toLocaleString()}`);

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

        console.log(`👥 Found ${users.length} eligible users for daily profit`);

        if (users.length === 0) {
            console.log('ℹ️  No users eligible for profit today');
            console.log('🏁 =====================================================\n');
            return { processed: 0, errors: 0, totalUsers: 0 };
        }

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
                    console.log(`⚠️  Invalid daily return for ${user.email}: ${user.selectedPlan.dailyReturn}`);
                }
            } catch (userError) {
                console.error(`❌ Error processing ${user.email}:`, userError.message);
                errors++;
            }
        }

        console.log('\n📊 ============ DAILY PROFIT SUMMARY ============');
        console.log(`✅ Successfully processed: ${processed} users`);
        console.log(`❌ Errors: ${errors} users`);
        console.log(`💰 Total profit distributed: $${totalProfitDistributed.toFixed(2)}`);
        console.log(`⏰ Completed at: ${new Date().toLocaleString()}`);
        console.log('🏁 ============================================\n');

        return { processed, errors, totalUsers: users.length, totalProfit: totalProfitDistributed };

    } catch (error) {
        console.error("❌ CRITICAL ERROR in daily profit system:", error);
        throw error;
    }
};

const startDailyProfitCron = () => {
    cron.schedule('0 1 0 * * *', async () => {
        console.log('\n🚀 AUTOMATED DAILY PROFIT CRON JOB TRIGGERED');
        try {
            await processDailyProfits();
        } catch (error) {
            console.error('❌ CRON JOB FAILED:', error);
        }
    }, {
        scheduled: true,
        timezone: "Asia/Karachi"
    });

    console.log('⏰ AUTOMATIC DAILY PROFIT SYSTEM ACTIVATED');
    console.log('📅 Schedule: Every day at 12:01 AM (Pakistan Time)');
    console.log('🔄 Users will receive profits automatically 24 hours after approval');
};

const runDailyProfitNow = async () => {
    console.log('🧪 MANUAL TEST: Running daily profit calculation...');
    return await processDailyProfits();
};

const getNextCronRun = () => {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 1, 0, 0);
    
    return tomorrow;
};

module.exports = {
    startDailyProfitCron,
    runDailyProfitNow,
    processDailyProfits,
    getNextCronRun
};