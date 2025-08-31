// backend/server.js
// Main server entry point - Production-ready architecture

const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const winston = require('winston');
const path = require('path');

// Import configuration
const config = require('./config');

// Import services
const DatabaseService = require('./services/DatabaseService');
const QuestionService = require('./services/QuestionService');

// Import socket handlers
const BattleRoyaleSocketHandler = require('./sockets/BattleRoyaleSocketHandler');

// Import middleware
const middleware = require('./middleware');
const { auth: authMiddleware, error: errorMiddleware, logging: loggingMiddleware, rateLimit: rateLimitMiddleware } = middleware;

// Import API routes
const routes = require('./routes');
const { api: apiRoutes, auth: authRoutes, profile: profileRoutes, friends: friendsRoutes, games: gameRoutes } = routes;

class CodeGameServer {
  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.io = null;
    this.logger = null;
    this.services = {};
    this.socketHandlers = {};
    this.isShuttingDown = false;
  }

  /**
   * Initialize the server
   */
  async initialize() {
    try {
      // Setup logging first
      this.setupLogging();
      this.logger.info('🚀 Starting Code Game Server...');
      
      // Initialize services
      await this.initializeServices();
      
      // Setup Express middleware
      this.setupMiddleware();
      
      // Setup routes
      this.setupRoutes();
      
      // Setup Socket.io
      this.setupSocketIO();
      
      // Setup socket handlers
      await this.setupSocketHandlers();
      
      // Setup error handling
      this.setupErrorHandling();
      
      // Setup graceful shutdown
      this.setupGracefulShutdown();
      
      this.logger.info('✅ Server initialization complete');
    } catch (error) {
      console.error('Failed to initialize server:', error);
      process.exit(1);
    }
  }

  /**
   * Setup Winston logging
   */
  setupLogging() {
    const logFormat = winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.splat(),
      winston.format.json()
    );

    // Create logger
    this.logger = winston.createLogger({
      level: config.logging.level,
      format: logFormat,
      defaultMeta: { service: 'code-game-server' },
      transports: [
        // Console transport
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          ),
          silent: !config.logging.console
        })
      ]
    });

    // Add file transport in production
    if (config.isProduction) {
      const { DailyRotateFile } = require('winston-daily-rotate-file');
      
      // Error log file
      this.logger.add(new DailyRotateFile({
        filename: path.join(config.logging.directory, 'error-%DATE%.log'),
        datePattern: config.logging.datePattern,
        maxSize: config.logging.maxSize,
        maxFiles: config.logging.maxFiles,
        level: 'error'
      }));

      // Combined log file
      this.logger.add(new DailyRotateFile({
        filename: path.join(config.logging.directory, config.logging.filename),
        datePattern: config.logging.datePattern,
        maxSize: config.logging.maxSize,
        maxFiles: config.logging.maxFiles
      }));
    }

    // Make logger available globally for other modules
    global.logger = this.logger;
  }

  /**
   * Initialize services
   */
  async initializeServices() {
    this.logger.info('Initializing services...');

    // Initialize database service
    this.services.database = new DatabaseService(config, this.logger);
    
    // Check database connection
    const dbHealth = await this.services.database.healthCheck();
    if (!dbHealth.healthy) {
      throw new Error(`Database connection failed: ${dbHealth.message}`);
    }
    this.logger.info('✅ Database connected');

    // Initialize question service
    this.services.question = new QuestionService(
      this.services.database,
      config,
      this.logger
    );
    this.logger.info('✅ Question service initialized');

    // Initialize other services as needed
    // this.services.codeforces = new CodeforcesService(config, this.logger);
    // this.services.auth = new AuthService(this.services.database, config, this.logger);
  }

  /**
   * Setup Express middleware
   */
  setupMiddleware() {
    // Trust proxy
    this.app.set('trust proxy', 1);

    // CORS configuration
    this.app.use(cors({
      origin: config.server.corsOrigin,
      credentials: config.security.cors.credentials,
      methods: config.security.cors.methods,
      allowedHeaders: config.security.cors.allowedHeaders
    }));

    // Body parsing
    this.app.use(express.json({ limit: config.server.maxPayloadSize }));
    this.app.use(express.urlencoded({ extended: true, limit: config.server.maxPayloadSize }));

    // Logging middleware
    if (loggingMiddleware) {
      this.app.use(loggingMiddleware(this.logger));
    }

    // Rate limiting
    if (config.isProduction && rateLimitMiddleware) {
      this.app.use(rateLimitMiddleware(config));
    }

    // Health check endpoints (before auth)
    this.app.get(config.monitoring.healthCheckPath, (req, res) => {
      res.json({ status: 'healthy', timestamp: new Date().toISOString() });
    });

    this.app.get(config.monitoring.readinessPath, async (req, res) => {
      const checks = await this.performReadinessChecks();
      const isReady = Object.values(checks).every(check => check.healthy);
      res.status(isReady ? 200 : 503).json({ ready: isReady, checks });
    });
  }

  /**
   * Setup API routes
   */
  setupRoutes() {
    // Public routes
    if (authRoutes) {
      this.app.use('/api/auth', authRoutes);
    }

    // Protected routes
    const apiRouter = express.Router();

    // Apply auth middleware to protected routes
    if (authMiddleware) {
      apiRouter.use(authMiddleware(this.services, config));
    }

    // Mount protected routes
    if (profileRoutes) {
      apiRouter.use('/profile', profileRoutes(this.services));
    }
    if (friendsRoutes) {
      apiRouter.use('/friends', friendsRoutes(this.services));
    }
    if (gameRoutes) {
      apiRouter.use('/games', gameRoutes(this.services));
    }
    if (apiRoutes) {
      apiRouter.use('/', apiRoutes(this.services));
    }

    // Mount API router
    this.app.use(config.server.apiPrefix, apiRouter);

    // Serve static files in production
    if (config.isProduction) {
      this.app.use(express.static(path.join(__dirname, '../frontend/build')));
      this.app.get('*', (req, res) => {
        res.sendFile(path.join(__dirname, '../frontend/build', 'index.html'));
      });
    }
  }

  /**
   * Setup Socket.io
   */
  setupSocketIO() {
    this.io = new Server(this.server, {
      path: config.socket.socketPath,
      cors: {
        origin: config.server.corsOrigin,
        credentials: config.security.cors.credentials
      },
      pingTimeout: config.socket.pingTimeout,
      pingInterval: config.socket.pingInterval,
      maxHttpBufferSize: config.socket.maxHttpBufferSize,
      transports: config.socket.transports,
      allowEIO3: config.socket.allowEIO3
    });

    // Global socket middleware
    this.io.use(async (socket, next) => {
      try {
        // Log connection attempt
        this.logger.debug(`Socket connection attempt from ${socket.handshake.address}`);
        
        // You can add global authentication here if needed
        // const token = socket.handshake.auth?.token;
        // if (!token) {
        //   return next(new Error('Authentication required'));
        // }
        
        next();
      } catch (error) {
        this.logger.error('Socket middleware error:', error);
        next(error);
      }
    });

    this.logger.info('✅ Socket.io initialized');
  }

  /**
   * Setup socket handlers
   */
  async setupSocketHandlers() {
    // Battle Royale handler
    if (config.features.enableBattleRoyale) {
      this.socketHandlers.battleRoyale = new BattleRoyaleSocketHandler(
        this.io,
        config,
        this.logger,
        this.services
      );
      this.socketHandlers.battleRoyale.initialize('/battle-royale');
      this.logger.info('✅ Battle Royale socket handler initialized');
    }

    // CF Duel handler
    if (config.features.enableCFDuel) {
      // this.socketHandlers.cfDuel = new CFDuelSocketHandler(
      //   this.io,
      //   config,
      //   this.logger,
      //   this.services
      // );
      // this.socketHandlers.cfDuel.initialize('/cf-duel');
      this.logger.info('⏭️  CF Duel socket handler skipped (not implemented)');
    }

    // Team Duel handler
    if (config.features.enableTeamDuel) {
      // this.socketHandlers.teamDuel = new TeamDuelSocketHandler(
      //   this.io,
      //   config,
      //   this.logger,
      //   this.services
      // );
      // this.socketHandlers.teamDuel.initialize('/team-duel');
      this.logger.info('⏭️  Team Duel socket handler skipped (not implemented)');
    }
  }

  /**
   * Setup error handling
   */
  setupErrorHandling() {
    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({
        error: 'Not Found',
        message: `Cannot ${req.method} ${req.path}`,
        timestamp: new Date().toISOString()
      });
    });

    // Global error handler
    if (errorMiddleware) {
      this.app.use(errorMiddleware(this.logger, config));
    } else {
      this.app.use((err, req, res, next) => {
        this.logger.error('Unhandled error:', err);
        res.status(err.status || 500).json({
          error: 'Internal Server Error',
          message: config.isDevelopment ? err.message : 'An error occurred',
          timestamp: new Date().toISOString()
        });
      });
    }

    // Uncaught exception handler
    process.on('uncaughtException', (error) => {
      this.logger.error('Uncaught Exception:', error);
      this.shutdown(1);
    });

    // Unhandled rejection handler
    process.on('unhandledRejection', (reason, promise) => {
      this.logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
      this.shutdown(1);
    });
  }

  /**
   * Setup graceful shutdown
   */
  setupGracefulShutdown() {
    const shutdownSignals = ['SIGTERM', 'SIGINT', 'SIGUSR2'];
    
    shutdownSignals.forEach(signal => {
      process.on(signal, () => {
        this.logger.info(`Received ${signal}, starting graceful shutdown...`);
        this.shutdown(0);
      });
    });
  }

  /**
   * Perform readiness checks
   */
  async performReadinessChecks() {
    const checks = {};

    // Database check
    try {
      checks.database = await this.services.database.healthCheck();
    } catch (error) {
      checks.database = { healthy: false, message: error.message };
    }

    // Judge0 check
    try {
      const judge0Service = require('./services/judge0Service');
      checks.judge0 = {
        healthy: judge0Service.isConfigured(),
        message: judge0Service.isConfigured() ? 'Configured' : 'No API keys configured'
      };
    } catch (error) {
      checks.judge0 = { healthy: false, message: error.message };
    }

    return checks;
  }

  /**
   * Start the server
   */
  async start() {
    const port = config.server.port;
    const host = config.server.host;

    return new Promise((resolve, reject) => {
      this.server.listen(port, host, (error) => {
        if (error) {
          this.logger.error('Failed to start server:', error);
          reject(error);
        } else {
          this.logger.info(`🎮 Code Game Server running on http://${host}:${port}`);
          this.logger.info(`📊 Environment: ${config.env}`);
          this.logger.info(`🔧 Features enabled:`, {
            battleRoyale: config.features.enableBattleRoyale,
            cfDuel: config.features.enableCFDuel,
            teamDuel: config.features.enableTeamDuel
          });
          resolve();
        }
      });
    });
  }

  /**
   * Graceful shutdown
   */
  async shutdown(exitCode = 0) {
    if (this.isShuttingDown) {
      this.logger.warn('Shutdown already in progress');
      return;
    }

    this.isShuttingDown = true;
    this.logger.info('Starting graceful shutdown...');

    // Stop accepting new connections
    this.server.close(() => {
      this.logger.info('HTTP server closed');
    });

    // Shutdown socket handlers
    for (const [name, handler] of Object.entries(this.socketHandlers)) {
      try {
        await handler.shutdown();
        this.logger.info(`${name} handler shutdown complete`);
      } catch (error) {
        this.logger.error(`Error shutting down ${name} handler:`, error);
      }
    }

    // Close Socket.io
    if (this.io) {
      this.io.close(() => {
        this.logger.info('Socket.io closed');
      });
    }

    // Close database connections
    // await this.services.database.close();

    // Wait a bit for connections to close
    setTimeout(() => {
      this.logger.info('Shutdown complete');
      process.exit(exitCode);
    }, 5000);
  }

  /**
   * Get server statistics
   */
  getStats() {
    const stats = {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      handlers: {}
    };

    // Get stats from each handler
    for (const [name, handler] of Object.entries(this.socketHandlers)) {
      stats.handlers[name] = handler.getStats();
    }

    return stats;
  }
}

// Create and start server
async function main() {
  const server = new CodeGameServer();
  
  try {
    await server.initialize();
    await server.start();
    
    // Export for testing
    module.exports = server;
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start if run directly
if (require.main === module) {
  main();
}

module.exports = CodeGameServer;
