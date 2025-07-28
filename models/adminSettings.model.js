const mongoose = require("mongoose");

const adminSettingsSchema = new mongoose.Schema({
  accountNumber: {
    type: String,
    required: true,
    trim: true,
    default: "1234567890123456"
  },
  bankName: {
    type: String,
    default: "Default Bank"
  },
  accountTitle: {
    type: String,
    default: "SEASHELL INVESTMENTS"
  },
  paymentInstructions: {
    type: String,
    default: "Please transfer the investment amount to the above account and upload your payment screenshot."
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

adminSettingsSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

adminSettingsSchema.statics.getSingleton = async function() {
  let settings = await this.findOne();
  if (!settings) {
    settings = new this({});
    await settings.save();
  }
  return settings;
};

module.exports = mongoose.model("AdminSettings", adminSettingsSchema);