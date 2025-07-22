const mongoose = require("mongoose");

// Profile image schema for S3 details
const profileImageSchema = new mongoose.Schema({
    url: { type: String, required: true },
    name: { type: String, required: true },
    size: { type: Number, required: true },
    uploadedAt: { type: Date, default: Date.now },
    s3Key: { type: String },
    uniqueId: { type: String },
    isS3Upload: { type: Boolean, default: false }
});

// Investment plan schema
const investmentPlanSchema = new mongoose.Schema({
    planName: { 
        type: String, 
        enum: ['bronze', 'silver', 'gold', 'platinum', 'diamond', 'elite'],
        required: true 
    },
    investmentAmount: { type: String, required: true },
    dailyReturn: { type: String, required: true },
    weeklyIncome: { type: String, required: true },
    monthlyIncome: { type: String, required: true },
    duration: { type: String, required: true },
    isActive: { type: Boolean, default: true },
    startDate: { type: Date, default: Date.now },
    endDate: { type: Date },
    totalEarned: { type: Number, default: 0 },
    lastProfitDate: { type: Date }
}, { _id: false });

// Withdrawal history schema
const withdrawalSchema = new mongoose.Schema({
    withdrawalId: { type: String, required: true },
    amount: { type: Number, required: true },
    binanceWallet: { type: String, required: true },
    requestedAt: { type: Date, default: Date.now },
    status: { 
        type: String, 
        enum: ['pending', 'approved', 'rejected', 'completed'], 
        default: 'pending' 
    },
    processedAt: { type: Date },
    adminNotes: { type: String }
}, { _id: true });

// Referral earnings schema for commission tracking
const referralEarningSchema = new mongoose.Schema({
    fromUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    fromUserEmail: { type: String, required: true },
    fromUserPlan: { type: String, required: true },
    commissionAmount: { type: Number, required: true },
    commissionPercentage: { type: Number, required: true },
    originalProfitAmount: { type: Number, required: true },
    earnedAt: { type: Date, default: Date.now },
    status: { type: String, enum: ['pending', 'paid'], default: 'paid' }
}, { _id: true });

// Main user schema
const userSchema = new mongoose.Schema({
    email: { 
        type: String, 
        required: true, 
        unique: true,
        lowercase: true,
        trim: true
    },
    password: { 
        type: String, 
        required: true, 
        minlength: 6 
    },
    profileImage: profileImageSchema,
    selectedPlan: investmentPlanSchema,
    withdrawalHistory: [withdrawalSchema],
    referralEarnings: [referralEarningSchema],
    totalReferralEarnings: { type: Number, default: 0 },
    isVerified: { type: Boolean, default: false },
    verificationStatus: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending'
    },
    totalBalance: { type: Number, default: 0 },
    totalWithdrawn: { type: Number, default: 0 },
    binanceWallet: { type: String },
    referralCode: { type: String, unique: true, sparse: true },
    referredBy: { type: String },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

// Update the updatedAt field before saving
userSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    
    // Generate referral code if not exists
    if (!this.referralCode) {
        this.referralCode = `${this.email.split('@')[0]}_${this._id.toString().slice(-6)}`.toUpperCase();
    }
    
    next();
});

// Commission rates by plan (static reference)
userSchema.statics.COMMISSION_RATES = {
    bronze: 5,    // 5% commission
    silver: 7,    // 7% commission  
    gold: 10,     // 10% commission
    platinum: 12, // 12% commission
    diamond: 15,  // 15% commission
    elite: 20     // 20% commission
};

module.exports = mongoose.model("User", userSchema);