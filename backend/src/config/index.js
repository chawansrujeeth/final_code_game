/**
 * Centralized Configuration Management
 * Production-ready configuration with environment-based settings
 */

const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const config = {
  // Server Configuration
  server: {
    port: parseInt(process.env.PORT || '5003', 10),
    host: process.env.HOST || '0.0.0.0',
    environment: process.env.NODE_ENV || 'development',
    corsOrigin: process.env.CORS_ORIGIN || '*'
  },

  // Database Configuration
  database: {
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
    connectionPool: {
      min: parseInt(process.env.DB_POOL_MIN || '2', 10),
      max: parseInt(process.env.DB_POOL_MAX || '10', 10)
    }
  },

  // Game Configuration
  game: {
    // Match settings
    minPlayersPerMatch: parseInt(process.env.MIN_PLAYERS || '4', 10),
    maxPlayersPerMatch: parseInt(process.env.MAX_PLAYERS || '8', 10),
    lobbyCountdownMs: parseInt(process.env.LOBBY_COUNTDOWN_MS || '10000', 10),
    gameDurationMs: parseInt(process.env.GAME_DURATION_MS || '1920000', 10), // 32 minutes
    
    // Zone settings
    zone: {
      shrinkSeconds: parseInt(process.env.ZONE_SHRINK_SECONDS || '30', 10),
      waitSeconds: parseInt(process.env.ZONE_WAIT_SECONDS || '30', 10),
      baseDamagePerSecond: parseInt(process.env.ZONE_BASE_DAMAGE || '5', 10),
      mapBoundary: parseInt(process.env.MAP_BOUNDARY || '480', 10)
    },
    
    // Health settings
    health: {
      maxHealth: parseInt(process.env.MAX_HEALTH || '100', 10),
      wrongAnswerDamage: parseInt(process.env.WRONG_ANSWER_DAMAGE || '10', 10)
    },
    
    // Timer settings
    timers: {
      broadcastIntervalMs: parseInt(process.env.TIMER_BROADCAST_INTERVAL || '1000', 10),
      autoStartDelayMs: parseInt(process.env.AUTO_START_DELAY || '10000', 10)
    }
  },

  // Socket Configuration
  socket: {
    pingTimeout: parseInt(process.env.SOCKET_PING_TIMEOUT || '120000', 10),
    pingInterval: parseInt(process.env.SOCKET_PING_INTERVAL || '30000', 10),
    maxHttpBufferSize: parseInt(process.env.MAX_HTTP_BUFFER_SIZE || '1e6', 10),
    transports: ['websocket', 'polling'],
    cors: {
      origin: process.env.CORS_ORIGIN || '*',
      methods: ['GET', 'POST']
    }
  },

  // Session Management
  session: {
    cleanupIntervalMs: parseInt(process.env.SESSION_CLEANUP_INTERVAL || '60000', 10),
    inactiveThresholdMs: parseInt(process.env.SESSION_INACTIVE_THRESHOLD || '1800000', 10), // 30 minutes
    maxConcurrentSessions: parseInt(process.env.MAX_CONCURRENT_SESSIONS || '100', 10)
  },

  // External Services
  services: {
    judge0: {
      apiUrl: process.env.JUDGE0_API_URL,
      apiKey: process.env.JUDGE0_API_KEY,
      timeout: parseInt(process.env.JUDGE0_TIMEOUT || '30000', 10)
    }
  },

  // Logging Configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.LOG_FORMAT || 'json',
    directory: process.env.LOG_DIR || path.join(__dirname, '../../logs')
  },

  // Security Configuration
  security: {
    rateLimiting: {
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
      maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10)
    },
    maxPayloadSize: process.env.MAX_PAYLOAD_SIZE || '10mb'
  },

  // Feature Flags
  features: {
    enableSpectatorMode: process.env.ENABLE_SPECTATOR_MODE === 'true',
    enableReplay: process.env.ENABLE_REPLAY === 'true',
    enableAnalytics: process.env.ENABLE_ANALYTICS === 'true',
    enableDebugMode: process.env.DEBUG_MODE === 'true'
  }
};

// Validate required configuration
const validateConfig = () => {
  const errors = [];

  if (!config.database.supabaseUrl) {
    errors.push('SUPABASE_URL is required');
  }

  if (!config.database.supabaseAnonKey) {
    errors.push('SUPABASE_ANON_KEY is required');
  }

  if (config.server.environment === 'production') {
    if (config.server.corsOrigin === '*') {
      console.warn('⚠️  Warning: CORS is set to allow all origins in production');
    }
  }

  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
  }
};

// Export configuration based on environment
module.exports = {
  ...config,
  validateConfig,
  isDevelopment: () => config.server.environment === 'development',
  isProduction: () => config.server.environment === 'production',
  isTest: () => config.server.environment === 'test'
};
