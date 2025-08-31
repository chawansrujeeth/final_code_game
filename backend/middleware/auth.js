// backend/middleware/auth.js
// JWT-based authentication middleware

const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');

// Get JWT secret from environment or use a default for development
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

/**
 * Generate JWT token for a user
 * @param {Object} user - User object
 * @returns {string} JWT token
 */
const generateToken = (user) => {
  const payload = {
    id: user.id,
    username: user.username,
    email: user.email,
    cf_handle: user.cf_handle,
    role: user.role || 'user'
  };

  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
    issuer: 'code-game-server',
    audience: 'code-game-client'
  });
};

/**
 * Verify JWT token
 * @param {string} token - JWT token
 * @returns {Object} Decoded token payload
 */
const verifyToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET, {
      issuer: 'code-game-server',
      audience: 'code-game-client'
    });
  } catch (error) {
    throw new Error('Invalid or expired token');
  }
};

/**
 * Express middleware to authenticate requests
 * @param {boolean} required - Whether authentication is required (default: true)
 */
const authenticate = (required = true) => {
  return async (req, res, next) => {
    try {
      // Extract token from header
      const authHeader = req.headers.authorization;
      const token = authHeader && authHeader.startsWith('Bearer ') 
        ? authHeader.substring(7) 
        : null;

      if (!token) {
        if (required) {
          return res.status(401).json({
            success: false,
            error: 'Authentication required',
            code: 'NO_AUTH_TOKEN'
          });
        }
        // If auth is optional and no token provided, continue
        return next();
      }

      // Verify token
      const decoded = verifyToken(token);
      
      // Attach user info to request
      req.user = decoded;
      req.userId = decoded.id;
      
      next();
    } catch (error) {
      if (required) {
        return res.status(401).json({
          success: false,
          error: error.message,
          code: 'INVALID_TOKEN'
        });
      }
      // If auth is optional and token is invalid, continue without user
      next();
    }
  };
};

/**
 * Socket.IO middleware to authenticate WebSocket connections
 */
const authenticateSocket = async (socket, next) => {
  try {
    // Extract token from auth header or query params
    const token = socket.handshake.auth?.token || 
                 socket.handshake.headers?.authorization?.substring(7) ||
                 socket.handshake.query?.token;

    if (!token) {
      return next(new Error('Authentication required'));
    }

    // Verify token
    const decoded = verifyToken(token);
    
    // Attach user info to socket
    socket.userId = decoded.id;
    socket.user = decoded;
    
    next();
  } catch (error) {
    next(new Error(error.message));
  }
};

/**
 * Middleware to check if user has required role
 * @param {string[]} roles - Array of allowed roles
 */
const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions',
        code: 'FORBIDDEN'
      });
    }

    next();
  };
};

/**
 * Middleware to validate request input
 */
const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array(),
      code: 'VALIDATION_ERROR'
    });
  }
  next();
};

/**
 * Refresh token endpoint handler
 */
const refreshToken = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        error: 'Refresh token required'
      });
    }

    // Verify refresh token (implement refresh token logic)
    // This is a placeholder - you should implement proper refresh token storage
    const decoded = jwt.verify(refreshToken, JWT_SECRET + '-refresh');
    
    // Generate new access token
    const newToken = generateToken(decoded);
    
    res.json({
      success: true,
      token: newToken,
      expiresIn: JWT_EXPIRES_IN
    });
  } catch (error) {
    res.status(401).json({
      success: false,
      error: 'Invalid refresh token'
    });
  }
};

module.exports = {
  generateToken,
  verifyToken,
  authenticate,
  authenticateSocket,
  requireRole,
  validateRequest,
  refreshToken,
  JWT_SECRET,
  JWT_EXPIRES_IN
};
