// backend/middleware/logging.js
// Request logging middleware

const { v4: uuidv4 } = require('uuid');

/**
 * Create request logging middleware
 * @param {Object} logger - Winston logger instance
 */
const createLoggingMiddleware = (logger) => {
  return (req, res, next) => {
    // Generate request ID
    req.id = req.headers['x-request-id'] || uuidv4();
    res.setHeader('X-Request-Id', req.id);

    // Log request start
    const startTime = Date.now();
    
    logger.info({
      type: 'request',
      requestId: req.id,
      method: req.method,
      url: req.originalUrl,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      userId: req.user?.id
    });

    // Capture response
    const originalSend = res.send;
    let responseBody;
    
    res.send = function(data) {
      responseBody = data;
      return originalSend.call(this, data);
    };

    // Log response
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      
      logger.info({
        type: 'response',
        requestId: req.id,
        method: req.method,
        url: req.originalUrl,
        statusCode: res.statusCode,
        duration: `${duration}ms`,
        userId: req.user?.id,
        ...(res.statusCode >= 400 && responseBody && { 
          responseBody: typeof responseBody === 'string' 
            ? responseBody.substring(0, 500) // Limit response body logging
            : responseBody 
        })
      });

      // Log slow requests
      if (duration > 1000) {
        logger.warn({
          type: 'slow_request',
          requestId: req.id,
          method: req.method,
          url: req.originalUrl,
          duration: `${duration}ms`
        });
      }
    });

    next();
  };
};

/**
 * Socket.IO logging middleware
 */
const createSocketLoggingMiddleware = (logger) => {
  return (socket, next) => {
    const requestId = uuidv4();
    socket.requestId = requestId;

    logger.info({
      type: 'socket_connection',
      requestId,
      socketId: socket.id,
      userId: socket.user?.id,
      address: socket.handshake.address
    });

    // Log all socket events
    const originalEmit = socket.emit;
    socket.emit = function(event, ...args) {
      logger.debug({
        type: 'socket_emit',
        requestId: socket.requestId,
        socketId: socket.id,
        event,
        userId: socket.user?.id
      });
      return originalEmit.apply(socket, [event, ...args]);
    };

    // Log socket disconnection
    socket.on('disconnect', (reason) => {
      logger.info({
        type: 'socket_disconnect',
        requestId: socket.requestId,
        socketId: socket.id,
        reason,
        userId: socket.user?.id
      });
    });

    next();
  };
};

/**
 * Performance monitoring middleware
 */
const performanceMiddleware = (req, res, next) => {
  const start = process.hrtime.bigint();
  
  res.on('finish', () => {
    const end = process.hrtime.bigint();
    const duration = Number(end - start) / 1000000; // Convert to milliseconds
    
    // Add performance header
    res.setHeader('X-Response-Time', `${duration.toFixed(2)}ms`);
    
    // Store performance metrics (could be sent to monitoring service)
    if (global.metrics) {
      global.metrics.recordResponseTime(req.path, req.method, duration);
    }
  });
  
  next();
};

module.exports = createLoggingMiddleware;
module.exports.createSocketLoggingMiddleware = createSocketLoggingMiddleware;
module.exports.performanceMiddleware = performanceMiddleware;
