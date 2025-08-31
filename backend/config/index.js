// backend/config/index.js
// Centralized configuration management for the application

const path = require('path');

// Load environment variables
require('dotenv').config({
  path: path.join(__dirname, '..', '.env')
});

/**
 * Application configuration
 */
const config = {
  // Environment
  env: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  isDevelopment: process.env.NODE_ENV === 'development',
  isTest: process.env.NODE_ENV === 'test',

  // Server configuration
  server: {
    port: parseInt(process.env.PORT || '3001', 10),
    host: process.env.HOST || '0.0.0.0',
    corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    apiPrefix: process.env.API_PREFIX || '/api',
    socketPath: process.env.SOCKET_PATH || '/socket.io',
    maxPayloadSize: process.env.MAX_PAYLOAD_SIZE || '10mb'
  },

  // Database configuration
  database: {
    supabase: {
      url: process.env.SUPABASE_URL,
      anonKey: process.env.SUPABASE_ANON_KEY,
      serviceKey: process.env.SUPABASE_SERVICE_KEY,
      jwtSecret: process.env.SUPABASE_JWT_SECRET
    },
    pooling: {
      max: parseInt(process.env.DB_POOL_MAX || '10', 10),
      min: parseInt(process.env.DB_POOL_MIN || '2', 10),
      idle: parseInt(process.env.DB_POOL_IDLE || '10000', 10)
    }
  },

  // External services
  services: {
    judge0: {
      baseUrl: process.env.JUDGE0_BASE_URL || 'https://judge0-ce.p.rapidapi.com',
      apiHost: process.env.JUDGE0_API_HOST || 'judge0-ce.p.rapidapi.com',
      apiKeys: [
        process.env.JUDGE0_KEY_1,
        process.env.JUDGE0_KEY_2,
        process.env.JUDGE0_KEY_3,
        process.env.JUDGE0_API_KEY,
        process.env.JUDGE0_KEY
      ].filter(Boolean),
      timeout: parseInt(process.env.JUDGE0_TIMEOUT || '30000', 10),
      maxRetries: parseInt(process.env.JUDGE0_MAX_RETRIES || '3', 10)
    },
    codeforces: {
      apiUrl: process.env.CF_API_URL || 'https://codeforces.com/api',
      rateLimit: parseInt(process.env.CF_RATE_LIMIT || '5', 10),
      cacheTTL: parseInt(process.env.CF_CACHE_TTL || '3600', 10)
    }
  },

  // Game configuration
  game: {
    battleRoyale: {
      maxPlayers: parseInt(process.env.BR_MAX_PLAYERS || '8', 10),
      minPlayers: parseInt(process.env.BR_MIN_PLAYERS || '2', 10),
      startDelay: parseInt(process.env.BR_START_DELAY || '5000', 10),
      questionTimeout: parseInt(process.env.BR_QUESTION_TIMEOUT || '300000', 10), // 5 minutes
      healthDecay: parseInt(process.env.BR_HEALTH_DECAY || '10', 10),
      correctAnswerHealth: parseInt(process.env.BR_CORRECT_HEALTH || '20', 10),
      wrongAnswerDamage: parseInt(process.env.BR_WRONG_DAMAGE || '25', 10)
    },
    cfDuel: {
      maxPlayers: parseInt(process.env.CF_MAX_PLAYERS || '2', 10),
      roundTime: parseInt(process.env.CF_ROUND_TIME || '600000', 10), // 10 minutes
      problemCount: parseInt(process.env.CF_PROBLEM_COUNT || '3', 10),
      ratingRange: {
        min: parseInt(process.env.CF_MIN_RATING || '800', 10),
        max: parseInt(process.env.CF_MAX_RATING || '2000', 10)
      }
    },
    teamDuel: {
      maxTeams: parseInt(process.env.TEAM_MAX_TEAMS || '2', 10),
      maxPlayersPerTeam: parseInt(process.env.TEAM_MAX_PLAYERS || '4', 10),
      roundTime: parseInt(process.env.TEAM_ROUND_TIME || '900000', 10) // 15 minutes
    }
  },

  // Socket.io configuration
  socket: {
    pingTimeout: parseInt(process.env.SOCKET_PING_TIMEOUT || '60000', 10),
    pingInterval: parseInt(process.env.SOCKET_PING_INTERVAL || '25000', 10),
    maxHttpBufferSize: parseInt(process.env.SOCKET_MAX_BUFFER || '1000000', 10), // 1MB
    transports: (process.env.SOCKET_TRANSPORTS || 'websocket,polling').split(','),
    allowEIO3: process.env.SOCKET_ALLOW_EIO3 === 'true'
  },

  // Security configuration
  security: {
    jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
    jwtExpiry: process.env.JWT_EXPIRY || '7d',
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || '10', 10),
    rateLimiting: {
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW || '900000', 10), // 15 minutes
      maxRequests: parseInt(process.env.RATE_LIMIT_MAX || '100', 10)
    },
    cors: {
      credentials: process.env.CORS_CREDENTIALS !== 'false',
      methods: (process.env.CORS_METHODS || 'GET,HEAD,PUT,PATCH,POST,DELETE').split(','),
      allowedHeaders: (process.env.CORS_HEADERS || 'Content-Type,Authorization').split(',')
    }
  },

  // Logging configuration
  logging: {
    level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
    format: process.env.LOG_FORMAT || 'json',
    directory: process.env.LOG_DIR || path.join(__dirname, '..', 'logs'),
    filename: process.env.LOG_FILENAME || 'app-%DATE%.log',
    datePattern: process.env.LOG_DATE_PATTERN || 'YYYY-MM-DD',
    maxSize: process.env.LOG_MAX_SIZE || '20m',
    maxFiles: process.env.LOG_MAX_FILES || '14d',
    console: process.env.LOG_CONSOLE !== 'false'
  },

  // Monitoring configuration
  monitoring: {
    enabled: process.env.MONITORING_ENABLED === 'true',
    metricsPort: parseInt(process.env.METRICS_PORT || '9090', 10),
    healthCheckPath: process.env.HEALTH_CHECK_PATH || '/health',
    readinessPath: process.env.READINESS_PATH || '/ready'
  },

  // Feature flags
  features: {
    enableBattleRoyale: process.env.FEATURE_BATTLE_ROYALE !== 'false',
    enableCFDuel: process.env.FEATURE_CF_DUEL !== 'false',
    enableTeamDuel: process.env.FEATURE_TEAM_DUEL !== 'false',
    enableVoiceChat: process.env.FEATURE_VOICE_CHAT === 'true',
    enableSpectatorMode: process.env.FEATURE_SPECTATOR === 'true',
    enableReplay: process.env.FEATURE_REPLAY === 'true'
  },

  // Cache configuration
  cache: {
    redis: {
      enabled: process.env.REDIS_ENABLED === 'true',
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB || '0', 10),
      keyPrefix: process.env.REDIS_KEY_PREFIX || 'codegame:'
    },
    memory: {
      max: parseInt(process.env.MEMORY_CACHE_MAX || '100', 10),
      ttl: parseInt(process.env.MEMORY_CACHE_TTL || '600', 10) // 10 minutes
    }
  }
};

/**
 * Validate required configuration
 */
function validateConfig() {
  const errors = [];

  // Check required database configuration
  if (!config.database.supabase.url) {
    errors.push('SUPABASE_URL is required');
  }
  if (!config.database.supabase.anonKey) {
    errors.push('SUPABASE_ANON_KEY is required');
  }

  // Check Judge0 configuration for production
  if (config.isProduction && config.services.judge0.apiKeys.length === 0) {
    errors.push('At least one Judge0 API key is required in production');
  }

  // Check security configuration for production
  if (config.isProduction && config.security.jwtSecret === 'dev-secret-change-in-production') {
    errors.push('JWT_SECRET must be changed in production');
  }

  if (errors.length > 0) {
    console.error('Configuration validation failed:');
    errors.forEach(error => console.error(`  - ${error}`));
    if (config.isProduction) {
      process.exit(1);
    }
  }
}

// Validate configuration on load
validateConfig();

module.exports = config;
