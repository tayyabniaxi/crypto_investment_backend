const mongoose = require("mongoose");

const profileImageSchema = new mongoose.Schema({
    url: { type: String, required: true },
    name: { type: String, required: true },
    size: { type: Number, required: true },
    uploadedAt: { type: Date, default: Date.now },
    s3Key: { type: String },
    uniqueId: { type: String },
    isS3Upload: { type: Boolean, default: false }
});

const investmentPlanSchema = new mongoose.Schema({
    planName: { 
        type: String, 
        enum: ['bronze', 'silver', 'gold', 'platinum', 'diamond', 'elite'],
        required: true 
    },
    investmentAmount: { type: String, required: true },
    dailyReturn: { type: String, required: true },
    weeklyIncome: { type: String, required: true },
    isActive: { type: Boolean, default: true },
    startDate: { type: Date, default: Date.now },
    endDate: { type: Date },
    totalEarned: { type: Number, default: 0 },
    lastProfitDate: { type: Date }
}, { _id: false });

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
    referralEarnings: { type: [referralEarningSchema], default: [] },
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

// Pre-save middleware to generate referral code
userSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    
    // Generate referral code if it doesn't exist
    if (!this.referralCode && this._id) {
        const emailPart = this.email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '');
        const idPart = this._id.toString().slice(-6);
        this.referralCode = `${emailPart}_${idPart}`.toUpperCase();
        console.log(`Generated referral code for ${this.email}: ${this.referralCode}`);
    }
    
    next();
});

// Post-save middleware to generate referral code if it wasn't created in pre-save
userSchema.post('save', async function(doc) {
    if (!doc.referralCode && doc._id) {
        try {
            const emailPart = doc.email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '');
            const idPart = doc._id.toString().slice(-6);
            doc.referralCode = `${emailPart}_${idPart}`.toUpperCase();
            
            // Update without triggering middleware again
            await mongoose.model('User').updateOne(
                { _id: doc._id },
                { referralCode: doc.referralCode }
            );
            
            console.log(`Post-save generated referral code for ${doc.email}: ${doc.referralCode}`);
        } catch (error) {
            console.error('Error generating referral code in post-save:', error);
        }
    }
});

userSchema.statics.COMMISSION_RATES = {
    bronze: 5,
    silver: 7,  
    gold: 10,
    platinum: 12,
    diamond: 15,
    elite: 20
};

module.exports = mongoose.model("User", userSchema);