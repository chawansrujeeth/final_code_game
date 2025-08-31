// backend/middleware/error.js
// Error handling middleware

/**
 * Custom error class for API errors
 */
class ApiError extends Error {
  constructor(statusCode, message, code = null, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Async error wrapper for route handlers
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * Not found error handler
 */
const notFound = (req, res, next) => {
  const error = new ApiError(404, `Not found - ${req.originalUrl}`, 'NOT_FOUND');
  next(error);
};

/**
 * Global error handler middleware
 */
const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  // Log error
  if (global.logger) {
    global.logger.error({
      error: err.message,
      stack: err.stack,
      url: req.originalUrl,
      method: req.method,
      ip: req.ip,
      user: req.user?.id
    });
  } else {
    console.error(err.stack);
  }

  // Mongoose bad ObjectId
  if (err.name === 'CastError') {
    const message = 'Invalid ID format';
    error = new ApiError(400, message, 'INVALID_ID');
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    const message = `Duplicate field value: ${field}`;
    error = new ApiError(400, message, 'DUPLICATE_FIELD');
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors).map(val => val.message).join(', ');
    error = new ApiError(400, message, 'VALIDATION_ERROR');
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    const message = 'Invalid token';
    error = new ApiError(401, message, 'INVALID_TOKEN');
  }

  if (err.name === 'TokenExpiredError') {
    const message = 'Token expired';
    error = new ApiError(401, message, 'TOKEN_EXPIRED');
  }

  // Default error response
  const statusCode = error.statusCode || err.statusCode || 500;
  const isDevelopment = process.env.NODE_ENV === 'development';

  res.status(statusCode).json({
    success: false,
    error: error.message || 'Server Error',
    code: error.code || 'SERVER_ERROR',
    ...(error.details && { details: error.details }),
    ...(isDevelopment && { stack: err.stack })
  });
};

/**
 * Handle unhandled promise rejections
 */
const handleUnhandledRejection = () => {
  process.on('unhandledRejection', (err, promise) => {
    if (global.logger) {
      global.logger.error(`Unhandled Rejection: ${err.message}`, err);
    } else {
      console.error(`Unhandled Rejection: ${err.message}`, err);
    }
    // Close server & exit process
    if (global.server) {
      global.server.close(() => process.exit(1));
    } else {
      process.exit(1);
    }
  });
};

/**
 * Handle uncaught exceptions
 */
const handleUncaughtException = () => {
  process.on('uncaughtException', (err) => {
    if (global.logger) {
      global.logger.error(`Uncaught Exception: ${err.message}`, err);
    } else {
      console.error(`Uncaught Exception: ${err.message}`, err);
    }
    // Close server & exit process
    if (global.server) {
      global.server.close(() => process.exit(1));
    } else {
      process.exit(1);
    }
  });
};

module.exports = {
  ApiError,
  asyncHandler,
  notFound,
  errorHandler,
  handleUnhandledRejection,
  handleUncaughtException
};
