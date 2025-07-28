const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('config');
const User = require('../models/user.model');
const fs = require('fs');

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    console.log('Login attempt for:', email);

    if (!email || !password) {
      return res.status(400).json({
        meta: {
          statusCode: 400,
          status: false,
          message: "Email and password are required."
        }
      });
    }

    const adminEmail = process.env.ADMIN_EMAIL || 'admin@seashell.com';
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

    if (email.toLowerCase() === adminEmail.toLowerCase() && password === adminPassword) {
      console.log('Admin login successful');
      const adminToken = jwt.sign(
        { adminId: 'admin', role: 'admin', email: adminEmail },
        config.get("jwtSecret"),
        { expiresIn: "24h" }
      );

      return res.status(200).json({
        meta: {
          statusCode: 200,
          status: true,
          message: "Admin login successful."
        },
        data: {
          token: adminToken,
          user: {
            id: 'admin',
            email: adminEmail,
            role: 'admin',
            isAdmin: true
          }
        }
      });
    }

    console.log('Checking for regular user:', email);
    const user = await User.findOne({ email });
    if (!user) {
      console.log('User not found:', email);
      return res.status(404).json({
        meta: {
          statusCode: 404,
          status: false,
          message: "User not found. Please check your email."
        }
      });
    }

    console.log('User found:', { email: user.email, status: user.verificationStatus });

    const isPasswordMatch = await bcrypt.compare(password, user.password);
    if (!isPasswordMatch) {
      console.log('Password mismatch for user:', email);
      return res.status(401).json({
        meta: {
          statusCode: 401,
          status: false,
          message: "Invalid password. Please try again."
        }
      });
    }

    let statusMessage = "Login successful.";
    if (user.verificationStatus === 'pending') {
      statusMessage = "Login successful. Your account is pending admin approval.";
    } else if (user.verificationStatus === 'rejected') {
      return res.status(403).json({
        meta: {
          statusCode: 403,
          status: false,
          message: "Account has been rejected. Please contact support."
        }
      });
    } else if (user.verificationStatus === 'approved') {
      statusMessage = "Login successful. Welcome back!";
    }

    const token = jwt.sign(
      { userId: user._id, role: 'user' },
      config.get("jwtSecret"),
      { expiresIn: config.has("TokenExpire") ? config.get("TokenExpire") : "24h" }
    );

    console.log('User login successful:', email);

    return res.status(200).json({
      meta: {
        statusCode: 200,
        status: true,
        message: statusMessage
      },
      data: {
        token,
        user: {
          id: user._id,
          email: user.email,
          screenshot: user.profileImage || null,
          selectedPlan: user.selectedPlan || null,
          role: 'user',
          isAdmin: false,
          verificationStatus: user.verificationStatus,
          isVerified: user.isVerified || false
        }
      }
    });

  } catch (error) {
    console.error("Error during login:", error);
    return res.status(500).json({
      meta: {
        statusCode: 500,
        status: false,
        message: "Server error. Please try again later."
      }
    });
  }
};

exports.signup = async (req, res) => {
  try {
    const { email, password, referralCode } = req.body;

    console.log('Signup attempt:', { email, referralCode });

    if (!email || !password) {
      if (req.file?.path && !req.file?.location) fs.unlinkSync(req.file.path);
      return res.status(400).json({
        meta: {
          statusCode: 400,
          status: false,
          message: "Email and password are required."
        }
      });
    }

    if (password.length < 6) {
      if (req.file?.path && !req.file?.location) fs.unlinkSync(req.file.path);
      return res.status(400).json({
        meta: {
          statusCode: 400,
          status: false,
          message: "Password must be at least 6 characters long."
        }
      });
    }

    if (req.file && !req.file.mimetype.startsWith('image/')) {
      if (req.file.path && !req.file.location) fs.unlinkSync(req.file.path);
      return res.status(400).json({
        meta: {
          statusCode: 400,
          status: false,
          message: "Invalid file type. Only image files are allowed for screenshot."
        }
      });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      if (req.file?.path && !req.file?.location) fs.unlinkSync(req.file.path);
      return res.status(409).json({
        meta: {
          statusCode: 409,
          status: false,
          message: `An account with email ${email} already exists.`
        }
      });
    }

    const { selectedPlan } = req.body;
    console.log('Selected Plan from request:', selectedPlan);
    
    if (!selectedPlan) {
      if (req.file?.path && !req.file?.location) fs.unlinkSync(req.file.path);
      return res.status(400).json({
        meta: {
          statusCode: 400,
          status: false,
          message: "Plan selection is required."
        }
      });
    }

    const validPlans = ['bronze', 'silver', 'gold', 'platinum', 'diamond', 'elite'];
    if (!validPlans.includes(selectedPlan.toLowerCase())) {
      if (req.file?.path && !req.file?.location) fs.unlinkSync(req.file.path);
      return res.status(400).json({
        meta: {
          statusCode: 400,
          status: false,
          message: "Invalid plan selected."
        }
      });
    }

    // Check if referral code is valid and find the referrer
    let referrerUser = null;
    if (referralCode && referralCode.trim()) {
      console.log('Looking for referrer with code:', referralCode.trim().toUpperCase());
      
      referrerUser = await User.findOne({ 
        referralCode: referralCode.trim().toUpperCase() 
      });
      
      if (!referrerUser) {
        console.log('❌ Invalid referral code provided:', referralCode);
        // Don't block signup for invalid referral code, just log it
      } else {
        console.log('✅ Valid referral code found, referrer:', referrerUser.email);
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const planDataMap = {
      bronze: { investmentAmount: "$100", dailyReturn: "$1.00", weeklyIncome: "$5.00", monthlyIncome: "$14.29", duration: "3.57" },
      silver: { investmentAmount: "$200", dailyReturn: "$2.00", weeklyIncome: "$10.00", monthlyIncome: "$14.29", duration: "3.57" },
      gold: { investmentAmount: "$300", dailyReturn: "$3.00", weeklyIncome: "$15.00", monthlyIncome: "$14.27", duration: "3.57" },
      platinum: { investmentAmount: "$500", dailyReturn: "$5.00", weeklyIncome: "$25.00", monthlyIncome: "$14.29", duration: "3.57" },
      diamond: { investmentAmount: "$1000", dailyReturn: "$10.00", weeklyIncome: "$50.00", monthlyIncome: "$14.29", duration: "3.57" },
      elite: { investmentAmount: "$5000", dailyReturn: "$50.00", weeklyIncome: "$250.00", monthlyIncome: "$14.27", duration: "3.57" }
    };

    const planData = planDataMap[selectedPlan.toLowerCase()];
    console.log('Plan Data:', planData);

    let screenshotData = null;
    if (req.file) {
      const isS3Upload = !!req.file.location;
      const fileUrl = isS3Upload ? req.file.location :
        `${config.get("serverBaseUrl") || 'http://localhost:5000'}/uploads/screenshots/${req.file.filename}`;
      const s3Key = req.file.key || req.file.filename;
      const uniqueKey = `${Date.now()}_${require('uuid').v4()}`;

      screenshotData = {
        url: fileUrl,
        name: `screenshot-${req.file.originalname}`,
        size: req.file.size,
        uploadedAt: new Date(),
        s3Key: isS3Upload ? s3Key : undefined,
        uniqueId: uniqueKey,
        isS3Upload: isS3Upload,
        type: 'screenshot'
      };
    }

    const newUser = new User({
      email,
      password: hashedPassword,
      profileImage: screenshotData,
      selectedPlan: {
        planName: selectedPlan.toLowerCase(),
        investmentAmount: planData.investmentAmount,
        dailyReturn: planData.dailyReturn,
        weeklyIncome: planData.weeklyIncome,
        monthlyIncome: planData.monthlyIncome,
        duration: planData.duration,
        isActive: false,
        startDate: null,
        totalEarned: 0
      },
      verificationStatus: 'pending',
      isVerified: false,
      referredBy: referrerUser ? referrerUser.referralCode : null,
      // Initialize these fields to avoid undefined issues
      referralEarnings: [],
      totalReferralEarnings: 0,
      totalBalance: 0
    });

    console.log('User object before save:', {
      email: newUser.email,
      referredBy: newUser.referredBy,
      selectedPlan: newUser.selectedPlan.planName
    });

    // Save the new user first
    await newUser.save();
    console.log('✅ New user saved successfully');

    // NOTE: Referral bonus will be awarded when admin approves the account
    if (referrerUser) {
      console.log(`📝 Referral relationship established: ${newUser.email} referred by ${referrerUser.email}`);
      console.log(`⏳ $3 bonus will be awarded to ${referrerUser.email} when ${newUser.email} gets approved by admin`);
    }

    const token = jwt.sign(
      { userId: newUser._id },
      config.get("jwtSecret"),
      { expiresIn: config.has("TokenExpire") ? config.get("TokenExpire") : "1h" }
    );

    const successMessage = referrerUser ? 
      `User registered successfully with plan. Referral bonus will be awarded when account is approved!` : 
      "User registered successfully with plan.";

    console.log('✅ Signup completed:', successMessage);

    return res.status(201).json({
      meta: {
        statusCode: 201,
        status: true,
        message: successMessage
      },
      data: {
        token,
        user: {
          id: newUser._id,
          email: newUser.email,
          screenshot: newUser.profileImage || null,
          selectedPlan: newUser.selectedPlan || null
        }
      }
    });

  } catch (error) {
    console.error("❌ Error during signup:", error);
    if (req.file?.path && !req.file?.location) fs.unlinkSync(req.file.path);
    return res.status(500).json({
      meta: {
        statusCode: 500,
        status: false,
        message: "Server error. Could not register user."
      }
    });
  }
};

exports.getUserPlan = async (req, res) => {
  try {
    const { userId } = req.params;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        meta: { statusCode: 404, status: false, message: "User not found" }
      });
    }

    return res.status(200).json({
      meta: { statusCode: 200, status: true, message: "User plan retrieved successfully" },
      data: {
        userId: user._id,
        email: user.email,
        selectedPlan: user.selectedPlan,
        verificationStatus: user.verificationStatus,
        isVerified: user.isVerified,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    console.error("Error getting user plan:", error);
    return res.status(500).json({
      meta: { statusCode: 500, status: false, message: "Server error" }
    });
  }
};