const { S3Client, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { v4: uuidv4 } = require('uuid');
const Employee = require('../models/user.model');
const mongoose = require('mongoose');
const config = require('config');
const fs = require('fs');
const path = require('path');

const s3Client = new S3Client({
  region: config.get("AWS_REGION"),
  credentials: {
    accessKeyId: config.get("AWS_ACCESS_KEY"),
    secretAccessKey: config.get("AWS_SECRET_KEY"),
  }
});

exports.uploadProfileImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        meta: { statusCode: 400, status: false, message: "No profile image uploaded" }
      });
    }

    const userId = req.body.userId;
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      if (req.file.path && !req.file.location) fs.unlinkSync(req.file.path);
      return res.status(400).json({
        meta: { statusCode: 400, status: false, message: "Valid User ID is required" }
      });
    }

    if (!req.file.mimetype.startsWith('image/')) {
      if (req.file.path && !req.file.location) fs.unlinkSync(req.file.path);
      return res.status(400).json({
        meta: { statusCode: 400, status: false, message: "Invalid file type. Only image files are allowed." }
      });
    }

    const isS3Upload = !!req.file.location;
    const fileUrl = isS3Upload ? req.file.location :
      `${process.env.serverBaseUrl || 'http://localhost:5000'}/uploads/profileimages/${req.file.filename}`;
    const s3Key = req.file.key || req.file.filename;
    const uniqueKey = `${Date.now()}_${uuidv4()}`;

    const employee = await Employee.findById(userId);
    if (!employee) {
      if (req.file.path && !req.file.location) fs.unlinkSync(req.file.path);
      return res.status(404).json({
        meta: { statusCode: 404, status: false, message: "Employee not found" }
      });
    }

    const existingProfileImageIndex = employee.documents.findIndex(doc => doc.type === 'profilepic');
    if (existingProfileImageIndex !== -1) {
      const existingImage = employee.documents[existingProfileImageIndex];

      if (existingImage.s3Key && isS3Upload) {
        try {
          await s3Client.send(new DeleteObjectCommand({
            Bucket: config.get("AWS_S3_BUCKET_NAME"),
            Key: existingImage.s3Key
          }));
        } catch (s3Error) {
          console.error("Error deleting previous profile image from S3:", s3Error);
        }
      }
      else if (existingImage.url && !isS3Upload) {
        const filename = existingImage.url.split('/').pop();
        const filePath = path.join(__dirname, '../uploads/profileimages', filename);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      }

      employee.documents.splice(existingProfileImageIndex, 1);
    }

    const newDocument = {
      type: 'profilepic',
      url: fileUrl,
      name: req.file.originalname,
      size: req.file.size,
      uploadedAt: new Date(),
      s3Key: isS3Upload ? s3Key : undefined,
      uniqueId: uniqueKey
    };

    employee.documents.push(newDocument);
    await employee.save();

    return res.status(200).json({
      meta: {
        statusCode: 200,
        status: true,
        message: "Profile image uploaded successfully"
      },
      data: {
        fileUrl,
        fileName: req.file.originalname,
        fileSize: req.file.size,
        isS3Upload,
        userId,
        uniqueId: uniqueKey
      }
    });

  } catch (error) {
    console.error("Profile image upload failed:", error);
    if (req.file?.path && !req.file?.location) fs.unlinkSync(req.file.path);

    return res.status(500).json({
      meta: { statusCode: 500, status: false, message: "Profile image upload failed: " + error.message }
    });
  }
};

exports.getProfileImage = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        meta: { statusCode: 400, status: false, message: "Valid User ID is required" }
      });
    }

    const employee = await Employee.findById(userId);
    if (!employee) {
      return res.status(404).json({
        meta: { statusCode: 404, status: false, message: "Employee not found" }
      });
    }

    const profileImage = employee.documents.find(doc => doc.type === 'profilepic');
    
    if (!profileImage) {
      return res.status(404).json({
        meta: { statusCode: 404, status: false, message: "Profile image not found" }
      });
    }

    return res.status(200).json({
      meta: {
        statusCode: 200,
        status: true,
        message: "Profile image retrieved successfully"
      },
      data: profileImage
    });

  } catch (error) {
    console.error("Error retrieving profile image:", error);
    return res.status(500).json({
      meta: { statusCode: 500, status: false, message: "Error retrieving profile image: " + error.message }
    });
  }
};