const jwt = require('jsonwebtoken');
const config = require('config');

const adminAuth = (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        meta: {
          statusCode: 401,
          status: false,
          message: "Access denied. No token provided."
        }
      });
    }

    const decoded = jwt.verify(token, config.get("jwtSecret"));
    
    // Check if it's an admin token
    if (!decoded.adminId || decoded.role !== 'admin') {
      return res.status(403).json({
        meta: {
          statusCode: 403,
          status: false,
          message: "Access denied. Admin privileges required."
        }
      });
    }

    req.admin = decoded;
    next();
  } catch (error) {
    return res.status(401).json({
      meta: {
        statusCode: 401,
        status: false,
        message: "Invalid token."
      }
    });
  }
};

module.exports = adminAuth;