const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { S3Client } = require("@aws-sdk/client-s3");
const multerS3 = require("multer-s3");
const config = require("config");

// Create screenshots directory
const screenshotDir = path.join(__dirname, "../uploads/screenshots");
if (!fs.existsSync(screenshotDir)) {
    fs.mkdirSync(screenshotDir, { recursive: true });
}

// S3 configuration check
let s3Client;
let useS3 = false;

try {
    const AWS_ACCESS_KEY = config.get("AWS_ACCESS_KEY");
    const AWS_SECRET_KEY = config.get("AWS_SECRET_KEY");
    const AWS_REGION = config.get("AWS_REGION") || "eu-north-1";
    const AWS_S3_BUCKET_NAME = config.get("AWS_S3_BUCKET_NAME") || "evswebsitebucket";

    if (AWS_ACCESS_KEY && AWS_SECRET_KEY && AWS_S3_BUCKET_NAME) {
        useS3 = true;
        // AWS SDK v3 configuration
        s3Client = new S3Client({
            region: AWS_REGION,
            credentials: {
                accessKeyId: AWS_ACCESS_KEY,
                secretAccessKey: AWS_SECRET_KEY,
            }
        });
    }
} catch (error) {
    console.log("Using local file storage for screenshots:", error.message);
}

// S3 key generation for screenshots
const s3KeyGen = (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const fileExtension = path.extname(file.originalname);
    cb(null, `screenshots/${uniqueSuffix}${fileExtension}`);
};

// Image file filter
const imageFileFilter = (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
        return cb(new Error('Only image files are allowed!'), false);
    }
    cb(null, true);
};

// Screenshot storage configuration
const screenshotStorage = useS3
    ? multerS3({
        s3: s3Client,
        bucket: config.get("AWS_S3_BUCKET_NAME"),
        acl: 'public-read',
        contentType: multerS3.AUTO_CONTENT_TYPE,
        key: s3KeyGen
    })
    : multer.diskStorage({
        destination: (req, file, cb) => cb(null, screenshotDir),
        filename: (req, file, cb) => {
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
            const fileExtension = path.extname(file.originalname);
            cb(null, `screenshot-${uniqueSuffix}${fileExtension}`);
        }
    });

// Profile image upload middleware (for screenshots)
const profileImageUpload = multer({
    storage: screenshotStorage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: imageFileFilter
});

// Create upload object
const upload = {};
upload.profileImage = profileImageUpload;

module.exports = upload;