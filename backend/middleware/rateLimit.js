// backend/middleware/rateLimit.js
// Rate limiting middleware

const rateLimit = require('express-rate-limit');

/**
 * Create rate limiting middleware with configuration
 * @param {Object} config - Configuration object
 */
const createRateLimiter = (config) => {
  // Default rate limiter
  const defaultLimiter = rateLimit({
    windowMs: config?.rateLimit?.windowMs || 15 * 60 * 1000, // 15 minutes
    max: config?.rateLimit?.max || 100, // limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    handler: (req, res) => {
      if (global.logger) {
        global.logger.warn({
          type: 'rate_limit_exceeded',
          ip: req.ip,
          path: req.path,
          userId: req.user?.id
        });
      }
      res.status(429).json({
        success: false,
        error: 'Too many requests, please try again later.',
        code: 'RATE_LIMIT_EXCEEDED'
      });
    }
  });

  return defaultLimiter;
};

/**
 * Strict rate limiter for authentication endpoints
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs
  message: 'Too many authentication attempts, please try again later.',
  skipSuccessfulRequests: true, // Don't count successful requests
  handler: (req, res) => {
    if (global.logger) {
      global.logger.warn({
        type: 'auth_rate_limit_exceeded',
        ip: req.ip,
        path: req.path
      });
    }
    res.status(429).json({
      success: false,
      error: 'Too many authentication attempts, please try again later.',
      code: 'AUTH_RATE_LIMIT_EXCEEDED'
    });
  }
});

/**
 * Rate limiter for API endpoints
 */
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30, // limit each IP to 30 requests per minute
  message: 'Too many API requests, please slow down.',
  handler: (req, res) => {
    if (global.logger) {
      global.logger.warn({
        type: 'api_rate_limit_exceeded',
        ip: req.ip,
        path: req.path,
        userId: req.user?.id
      });
    }
    res.status(429).json({
      success: false,
      error: 'Too many API requests, please slow down.',
      code: 'API_RATE_LIMIT_EXCEEDED'
    });
  }
});

/**
 * Rate limiter for code execution endpoints
 */
const codeLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 10, // limit each IP to 10 code executions per minute
  message: 'Too many code execution requests, please wait.',
  handler: (req, res) => {
    if (global.logger) {
      global.logger.warn({
        type: 'code_rate_limit_exceeded',
        ip: req.ip,
        userId: req.user?.id
      });
    }
    res.status(429).json({
      success: false,
      error: 'Too many code execution requests, please wait.',
      code: 'CODE_RATE_LIMIT_EXCEEDED'
    });
  }
});

/**
 * Socket.IO rate limiting
 */
class SocketRateLimiter {
  constructor(options = {}) {
    this.maxEmitsPerMinute = options.maxEmitsPerMinute || 60;
    this.clients = new Map();
  }

  middleware() {
    return (socket, next) => {
      const clientId = socket.handshake.address;
      
      if (!this.clients.has(clientId)) {
        this.clients.set(clientId, {
          emitCount: 0,
          resetTime: Date.now() + 60000
        });
      }

      const client = this.clients.get(clientId);
      
      // Reset counter if minute has passed
      if (Date.now() > client.resetTime) {
        client.emitCount = 0;
        client.resetTime = Date.now() + 60000;
      }

      // Intercept emit calls
      const originalEmit = socket.emit;
      socket.emit = (...args) => {
        client.emitCount++;
        
        if (client.emitCount > this.maxEmitsPerMinute) {
          socket.emit('error', {
            message: 'Rate limit exceeded',
            code: 'SOCKET_RATE_LIMIT'
          });
          
          if (global.logger) {
            global.logger.warn({
              type: 'socket_rate_limit_exceeded',
              socketId: socket.id,
              clientId,
              emitCount: client.emitCount
            });
          }
          
          return false;
        }
        
        return originalEmit.apply(socket, args);
      };

      next();
    };
  }

  cleanup() {
    // Clean up old client entries periodically
    setInterval(() => {
      const now = Date.now();
      for (const [clientId, client] of this.clients.entries()) {
        if (now > client.resetTime + 300000) { // 5 minutes after last reset
          this.clients.delete(clientId);
        }
      }
    }, 300000); // Run every 5 minutes
  }
}

module.exports = createRateLimiter;
module.exports.authLimiter = authLimiter;
module.exports.apiLimiter = apiLimiter;
module.exports.codeLimiter = codeLimiter;
module.exports.SocketRateLimiter = SocketRateLimiter;
