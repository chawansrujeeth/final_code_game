/**
 * Custom Error Classes and Error Handling
 * Production-ready error handling with proper status codes and logging
 */

const { systemLogger } = require('./logger');

/**
 * Base Error Class
 */
class BaseError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', data = {}) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.data = data;
    this.timestamp = new Date().toISOString();
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      data: this.data,
      timestamp: this.timestamp
    };
  }
}

/**
 * Game-specific Error Classes
 */
class GameError extends BaseError {
  constructor(message, code = 'GAME_ERROR', data = {}) {
    super(message, 400, code, data);
  }
}

class SessionError extends BaseError {
  constructor(message, code = 'SESSION_ERROR', data = {}) {
    super(message, 404, code, data);
  }
}

class ValidationError extends BaseError {
  constructor(message, code = 'VALIDATION_ERROR', data = {}) {
    super(message, 400, code, data);
  }
}

class AuthenticationError extends BaseError {
  constructor(message = 'Authentication required', code = 'AUTH_ERROR', data = {}) {
    super(message, 401, code, data);
  }
}

class AuthorizationError extends BaseError {
  constructor(message = 'Insufficient permissions', code = 'AUTHZ_ERROR', data = {}) {
    super(message, 403, code, data);
  }
}

class NotFoundError extends BaseError {
  constructor(resource = 'Resource', code = 'NOT_FOUND', data = {}) {
    super(`${resource} not found`, 404, code, data);
  }
}

class ConflictError extends BaseError {
  constructor(message, code = 'CONFLICT', data = {}) {
    super(message, 409, code, data);
  }
}

class RateLimitError extends BaseError {
  constructor(message = 'Too many requests', code = 'RATE_LIMIT', data = {}) {
    super(message, 429, code, data);
  }
}

class ServiceUnavailableError extends BaseError {
  constructor(message = 'Service temporarily unavailable', code = 'SERVICE_UNAVAILABLE', data = {}) {
    super(message, 503, code, data);
  }
}

/**
 * Error Handler Middleware for Express
 */
const errorHandler = (err, req, res, next) => {
  // Log the error
  systemLogger.error('Request error', err, {
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('user-agent')
  });

  // Determine status code and message
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal server error';
  let code = err.code || 'INTERNAL_ERROR';
  let data = err.data || {};

  // Handle specific error types
  if (err.name === 'ValidationError') {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
  } else if (err.name === 'CastError') {
    statusCode = 400;
    code = 'INVALID_ID';
    message = 'Invalid ID format';
  } else if (err.name === 'MongoError' && err.code === 11000) {
    statusCode = 409;
    code = 'DUPLICATE_KEY';
    message = 'Duplicate key error';
  }

  // Don't expose internal error details in production
  if (process.env.NODE_ENV === 'production' && statusCode === 500) {
    message = 'Internal server error';
    data = {};
  }

  // Send error response
  res.status(statusCode).json({
    success: false,
    error: {
      message,
      code,
      statusCode,
      ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
      ...data
    },
    timestamp: new Date().toISOString()
  });
};

/**
 * Socket Error Handler
 */
const handleSocketError = (socket, error, context = {}) => {
  // Log the error
  systemLogger.error('Socket error', error, {
    socketId: socket.id,
    ...context
  });

  // Emit error to client
  const errorResponse = {
    success: false,
    error: {
      message: error.message || 'An error occurred',
      code: error.code || 'SOCKET_ERROR',
      timestamp: new Date().toISOString()
    }
  };

  // Don't expose sensitive information
  if (process.env.NODE_ENV === 'production' && !(error instanceof BaseError)) {
    errorResponse.error.message = 'An error occurred';
    errorResponse.error.code = 'INTERNAL_ERROR';
  }

  socket.emit('error', errorResponse);
};

/**
 * Async Error Wrapper for Express Routes
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * Socket Event Error Wrapper
 */
const socketAsyncHandler = (fn) => async (socket, ...args) => {
  try {
    await fn(socket, ...args);
  } catch (error) {
    handleSocketError(socket, error);
  }
};

/**
 * Error Factories
 */
const ErrorFactory = {
  sessionNotFound: (sessionId) => 
    new SessionError(`Session ${sessionId} not found`, 'SESSION_NOT_FOUND', { sessionId }),
  
  playerNotFound: (playerId) => 
    new NotFoundError('Player', 'PLAYER_NOT_FOUND', { playerId }),
  
  invalidGameState: (reason) => 
    new GameError(`Invalid game state: ${reason}`, 'INVALID_GAME_STATE'),
  
  gameAlreadyStarted: () => 
    new ConflictError('Game has already started', 'GAME_ALREADY_STARTED'),
  
  gameFull: () => 
    new ConflictError('Game session is full', 'GAME_FULL'),
  
  invalidMove: (reason) => 
    new GameError(`Invalid move: ${reason}`, 'INVALID_MOVE'),
  
  notYourTurn: () => 
    new GameError('It is not your turn', 'NOT_YOUR_TURN'),
  
  unauthorized: (action) => 
    new AuthorizationError(`Not authorized to ${action}`, 'UNAUTHORIZED_ACTION'),
  
  invalidInput: (field, reason) => 
    new ValidationError(`Invalid ${field}: ${reason}`, 'INVALID_INPUT', { field, reason }),
  
  missingRequired: (field) => 
    new ValidationError(`Missing required field: ${field}`, 'MISSING_FIELD', { field }),
  
  rateLimitExceeded: (limit) => 
    new RateLimitError(`Rate limit exceeded: ${limit} requests allowed`, 'RATE_LIMIT_EXCEEDED', { limit })
};

module.exports = {
  // Error classes
  BaseError,
  GameError,
  SessionError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  ServiceUnavailableError,
  
  // Error handlers
  errorHandler,
  handleSocketError,
  asyncHandler,
  socketAsyncHandler,
  
  // Error factory
  ErrorFactory
};
