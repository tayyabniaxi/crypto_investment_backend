const express = require("express");
const path = require('path');
const http = require('http');
const cron = require('node-cron');
// const authRoutes = require("./routes/auth.routes")
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
// const uploadRoutes = require("./routes/upload.routes")


connectDB();
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
// app.use('/api/auth', authRoutes)
app.use('/api/user', userRoutes)
app.use('/api/referral', referralRoutes);
app.use('/api/withdrawal', withdrawalRoutes);
app.use('/api/profit', dailyProfitRoutes);
app.use('/api/admin', adminRoutes);

app.use("/uploads", express.static(path.join(__dirname, "uploads")));
// app.use('/api/upload', uploadRoutes)

// Cron Job for Daily Profit Calculation
// Run daily at 12:00 AM (midnight)
cron.schedule('0 0 * * *', async () => {
    console.log('Running daily profit calculation...');
    
    try {
        // Mock request object for the controller
        const mockReq = {};
        const mockRes = {
            status: (code) => ({
                json: (data) => {
                    console.log(`Daily profit processing result:`, data);
                }
            })
        };

        await dailyProfitController.processAllDailyProfits(mockReq, mockRes);
    } catch (error) {
        console.error('Error running daily profit cron job:', error);
    }
});

console.log('Daily profit cron job scheduled for midnight daily');

const PORT = 5000;
server.listen(PORT, () => {
  console.log('server started on port' + PORT)
});

module.exports = server;