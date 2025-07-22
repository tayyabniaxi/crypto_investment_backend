const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('config');
const User = require('../models/user.model');
const fs = require('fs');

// Unified Login for both User and Admin
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    console.log('Login attempt for:', email); // Debug log

    // Validation
    if (!email || !password) {
      return res.status(400).json({
        meta: {
          statusCode: 400,
          status: false,
          message: "Email and password are required."
        }
      });
    }

    // Check if it's admin credentials first
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@seashell.com';
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

    if (email.toLowerCase() === adminEmail.toLowerCase() && password === adminPassword) {
      // Admin Login
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

    // Regular User Login
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

    // Check password for regular user
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

    // UPDATED: Allow login even if not approved, but show status message
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

    // Generate JWT token for regular user
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

// User Signup with Screenshot (Keep existing code)
exports.signup = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      // Clean up uploaded file if validation fails
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

    // Validate screenshot if provided
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

    // Check if user already exists
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

    // Validate selected plan
    const { selectedPlan } = req.body;
    console.log('Selected Plan from request:', selectedPlan); // Debug log
    
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

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Plan data mapping
    const planDataMap = {
      bronze: { investmentAmount: "$100", dailyReturn: "$1.00", weeklyIncome: "$5.00", monthlyIncome: "$14.29", duration: "3.57" },
      silver: { investmentAmount: "$200", dailyReturn: "$2.00", weeklyIncome: "$10.00", monthlyIncome: "$14.29", duration: "3.57" },
      gold: { investmentAmount: "$300", dailyReturn: "$3.00", weeklyIncome: "$15.00", monthlyIncome: "$14.27", duration: "3.57" },
      platinum: { investmentAmount: "$500", dailyReturn: "$5.00", weeklyIncome: "$25.00", monthlyIncome: "$14.29", duration: "3.57" },
      diamond: { investmentAmount: "$1000", dailyReturn: "$10.00", weeklyIncome: "$50.00", monthlyIncome: "$14.29", duration: "3.57" },
      elite: { investmentAmount: "$5000", dailyReturn: "$50.00", weeklyIncome: "$250.00", monthlyIncome: "$14.27", duration: "3.57" }
    };

    const planData = planDataMap[selectedPlan.toLowerCase()];
    console.log('Plan Data:', planData); // Debug log

    // Prepare screenshot data if uploaded
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

    // Create new user with plan
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
        isActive: false, // Set to false initially - only activate when admin approves
        startDate: null, // Will be set when admin approves
        totalEarned: 0
      },
      verificationStatus: 'pending', // Explicitly set to pending
      isVerified: false
    });

    console.log('User object before save:', JSON.stringify(newUser, null, 2)); // Debug log

    await newUser.save();

    // Generate JWT token
    const token = jwt.sign(
      { userId: newUser._id },
      config.get("jwtSecret"),
      { expiresIn: config.has("TokenExpire") ? config.get("TokenExpire") : "1h" }
    );

    return res.status(201).json({
      meta: {
        statusCode: 201,
        status: true,
        message: "User registered successfully with plan."
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
    console.error("Error during signup:", error);
    // Clean up uploaded file on error
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

// Test API to check user plan
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