const express = require("express");
const path = require('path');
const http = require('http');
const cron = require('node-cron');
const userRoutes = require("./routes/user.routes")
const referralRoutes = require("./routes/referral.routes");
const withdrawalRoutes = require("./routes/withdrawal.routes");
const dailyProfitRoutes = require("./routes/dailyProfit.routes");
const adminRoutes = require("./routes/admin.routes");
const dailyProfitController = require('./controllers/dailyProfit.controller');
const app = express();
const bodyParser = require('body-parser');
const server = http.createServer(app);
var cors = require('cors');
const connectDB = require("./config/db")

connectDB();
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

app.use('/api/user', userRoutes)
app.use('/api/referral', referralRoutes);
app.use('/api/withdrawal', withdrawalRoutes);
app.use('/api/profit', dailyProfitRoutes);
app.use('/api/admin', adminRoutes);

app.use("/uploads", express.static(path.join(__dirname, "uploads")));

cron.schedule('1 0 * * *', async () => {
    console.log('\n🚀 AUTOMATED DAILY PROFIT CRON JOB TRIGGERED');
    console.log(`📅 Running daily profit calculation at: ${new Date().toLocaleString()}`);
    
    try {
        const mockReq = {};
        const mockRes = {
            status: (code) => ({
                json: (data) => {
                    if (data.meta && data.meta.status) {
                        console.log('\n📊 ============ DAILY PROFIT SUMMARY ============');
                        console.log(`✅ Message: ${data.meta.message}`);
                        if (data.data) {
                            console.log(`👥 Total Users: ${data.data.totalUsers}`);
                            console.log(`✅ Processed: ${data.data.processed}`);
                            console.log(`❌ Errors: ${data.data.errors}`);
                            console.log(`💰 Total Distributed: ${data.data.totalProfitDistributed || 'N/A'}`);
                            console.log(`⏰ Completed at: ${new Date(data.data.processedAt).toLocaleString()}`);
                        }
                        console.log('🏁 ============================================\n');
                    } else {
                        console.log('❌ Daily profit processing failed:', data);
                    }
                    return { json: () => {} };
                }
            })
        };

        await dailyProfitController.processAllDailyProfits(mockReq, mockRes);
    } catch (error) {
        console.error('❌ Error running daily profit cron job:', error);
    }
}, {
    scheduled: true,
    timezone: "Asia/Karachi"
});

console.log('⏰ Daily profit cron job scheduled for 12:01 AM daily (Pakistan Time)');
console.log('🔄 Users will receive profits automatically 24 hours after approval');

const PORT = process.env.PORT || 5001;
server.listen(PORT, () => {
    console.log('\n🚀 ============ SEASHELL INVESTMENT SYSTEM ============');
    console.log(`🌟 Server started on port ${PORT}`);
    console.log('💰 Automatic daily profit system: ACTIVE');
    console.log('📅 Schedule: Every day at 12:01 AM (Pakistan Time)');
    console.log('⚠️  Admin manages: User approval & Withdrawal requests only');
    console.log('✅ Daily profits: Fully automated');
    console.log('🏁 =================================================\n');
});

module.exports = server;