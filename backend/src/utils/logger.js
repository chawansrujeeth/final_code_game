/**
 * Production-grade Logging System
 * Centralized logging with Winston for better debugging and monitoring
 */

const winston = require('winston');
const path = require('path');
const fs = require('fs');
const config = require('../config');

// Ensure log directory exists
const logDir = config.logging.directory;
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Custom log format
const customFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss.SSS'
  }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({
    format: 'HH:mm:ss.SSS'
  }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `[${timestamp}] ${level}: ${message}${metaStr}`;
  })
);

// Create Winston logger instance
const logger = winston.createLogger({
  level: config.logging.level,
  format: customFormat,
  defaultMeta: { 
    service: 'battle-royale',
    environment: config.server.environment 
  },
  transports: [
    // Error logs
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    // Combined logs
    new winston.transports.File({
      filename: path.join(logDir, 'combined.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5
    })
  ],
  // Handle uncaught exceptions
  exceptionHandlers: [
    new winston.transports.File({
      filename: path.join(logDir, 'exceptions.log'),
      maxsize: 5242880,
      maxFiles: 5
    })
  ],
  // Handle unhandled promise rejections
  rejectionHandlers: [
    new winston.transports.File({
      filename: path.join(logDir, 'rejections.log'),
      maxsize: 5242880,
      maxFiles: 5
    })
  ]
});

// Add console transport for non-production environments
if (config.server.environment !== 'production') {
  logger.add(new winston.transports.Console({
    format: consoleFormat,
    handleExceptions: true,
    handleRejections: true
  }));
} else {
  // In production, still log to console but with JSON format
  logger.add(new winston.transports.Console({
    format: customFormat,
    handleExceptions: true,
    handleRejections: true
  }));
}

// Create specialized loggers for different contexts
class Logger {
  constructor(context = 'General') {
    this.context = context;
  }

  // Add context to all log messages
  _log(level, message, meta = {}) {
    logger.log(level, message, {
      context: this.context,
      timestamp: new Date().toISOString(),
      ...meta
    });
  }

  info(message, meta) {
    this._log('info', message, meta);
  }

  warn(message, meta) {
    this._log('warn', message, meta);
  }

  error(message, error, meta = {}) {
    const errorMeta = error instanceof Error ? {
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name
      }
    } : { error };

    this._log('error', message, { ...errorMeta, ...meta });
  }

  debug(message, meta) {
    this._log('debug', message, meta);
  }

  // Performance logging
  performance(operation, duration, meta = {}) {
    this._log('info', `Performance: ${operation}`, {
      type: 'performance',
      operation,
      duration,
      ...meta
    });
  }

  // Game event logging
  gameEvent(event, sessionId, playerId, data = {}) {
    this._log('info', `Game Event: ${event}`, {
      type: 'game_event',
      event,
      sessionId,
      playerId,
      ...data
    });
  }

  // Socket event logging
  socketEvent(event, socketId, data = {}) {
    this._log('debug', `Socket Event: ${event}`, {
      type: 'socket_event',
      event,
      socketId,
      ...data
    });
  }

  // Database operation logging
  database(operation, table, duration, meta = {}) {
    this._log('debug', `Database: ${operation} on ${table}`, {
      type: 'database',
      operation,
      table,
      duration,
      ...meta
    });
  }

  // API request logging
  apiRequest(method, endpoint, statusCode, duration, meta = {}) {
    const level = statusCode >= 400 ? 'warn' : 'info';
    this._log(level, `API: ${method} ${endpoint} - ${statusCode}`, {
      type: 'api_request',
      method,
      endpoint,
      statusCode,
      duration,
      ...meta
    });
  }
}

// Export logger factory
module.exports = {
  createLogger: (context) => new Logger(context),
  
  // Predefined loggers for common contexts
  systemLogger: new Logger('System'),
  gameLogger: new Logger('Game'),
  socketLogger: new Logger('Socket'),
  databaseLogger: new Logger('Database'),
  serviceLogger: new Logger('Service'),
  
  // Express middleware for request logging
  requestLogger: (req, res, next) => {
    const start = Date.now();
    const requestLogger = new Logger('HTTP');
    
    // Log request
    requestLogger.info(`${req.method} ${req.url}`, {
      method: req.method,
      url: req.url,
      ip: req.ip,
      userAgent: req.get('user-agent')
    });
    
    // Log response
    res.on('finish', () => {
      const duration = Date.now() - start;
      requestLogger.apiRequest(
        req.method,
        req.url,
        res.statusCode,
        duration,
        {
          ip: req.ip,
          contentLength: res.get('content-length')
        }
      );
    });
    
    next();
  },
  
  // Stream for Morgan logging
  stream: {
    write: (message) => {
      logger.info(message.trim());
    }
  }
};
