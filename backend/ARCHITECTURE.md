# Battle Royale - Refactored Architecture

## 🏗️ Production-Ready Architecture Overview

This document describes the refactored, production-ready architecture for the Battle Royale game server.

## 📁 Project Structure

```
backend/
├── src/
│   ├── config/                 # Configuration management
│   │   └── index.js            # Centralized config with env support
│   │
│   ├── core/                   # Core system components
│   │   └── TimerManager.js     # Centralized timer management
│   │
│   ├── game/                   # Game logic
│   │   ├── GameSessionManager.js   # Session lifecycle management
│   │   ├── GameStateMachine.js     # Game phase state machine
│   │   ├── MapManager.js           # Map and zone management
│   │   └── QuestionManager.js      # Question assignment logic
│   │
│   ├── services/               # External service integrations
│   │   ├── DatabaseService.js      # Supabase database operations
│   │   ├── QuestionService.js      # Question fetching and caching
│   │   ├── CodeExecutionService.js # Judge0 integration
│   │   └── UserService.js          # User management
│   │
│   ├── sockets/                # Socket.IO event handlers
│   │   ├── SocketManager.js        # Main socket connection manager
│   │   ├── handlers/
│   │   │   ├── ConnectionHandler.js    # Connection events
│   │   │   ├── MatchmakingHandler.js   # Queue and matchmaking
│   │   │   ├── LobbyHandler.js         # Lobby phase events
│   │   │   ├── GameHandler.js          # In-game events
│   │   │   └── SpectatorHandler.js     # Spectator mode
│   │   └── middleware/
│   │       ├── AuthMiddleware.js       # Socket authentication
│   │       └── ValidationMiddleware.js # Input validation
│   │
│   ├── utils/                  # Utility modules
│   │   ├── logger.js               # Winston logging system
│   │   ├── errors.js               # Custom error classes
│   │   ├── validators.js           # Input validators
│   │   └── helpers.js              # Helper functions
│   │
│   ├── middleware/             # Express middleware
│   │   ├── errorHandler.js        # Global error handling
│   │   ├── rateLimiter.js         # Rate limiting
│   │   └── requestLogger.js       # Request logging
│   │
│   └── server.js               # Main server entry point
│
├── tests/                      # Test suites
│   ├── unit/
│   ├── integration/
│   └── e2e/
│
├── logs/                       # Log files (gitignored)
├── .env                        # Environment variables
├── .env.example               # Environment template
└── package.json               # Dependencies
```

## 🎯 Key Components

### 1. **Configuration Management** (`src/config/`)
- Centralized configuration with environment variable support
- Validation of required settings on startup
- Feature flags for enabling/disabling features
- Environment-specific configurations (dev/staging/prod)

### 2. **Timer Management** (`src/core/TimerManager.js`)
- Centralized timer handling prevents memory leaks
- Automatic cleanup of expired timers
- Support for timeout and interval timers
- Session-based timer organization
- Built-in timer types:
  - Lobby countdown
  - Game duration
  - Zone progression
  - Disconnect timeout
  - Session cleanup

### 3. **Game State Machine** (`src/game/GameStateMachine.js`)
- Enforces valid state transitions
- States: CREATED → MATCHMAKING → LOBBY → STARTING → IN_PROGRESS → ENDING → COMPLETED
- Event-driven state changes
- State history tracking
- Validation of game actions based on current state

### 4. **Session Management** (`src/game/GameSessionManager.js`)
- Memory-efficient session storage with automatic cleanup
- Player lifecycle management
- Spectator support
- Session statistics and analytics
- Automatic disposal of completed sessions
- Maximum concurrent session limits

### 5. **Error Handling** (`src/utils/errors.js`)
- Custom error classes with proper HTTP status codes
- Centralized error handling for both HTTP and WebSocket
- Production-safe error messages (no stack traces in prod)
- Error factories for common scenarios
- Async error wrappers

### 6. **Logging System** (`src/utils/logger.js`)
- Winston-based structured logging
- Context-aware loggers for different components
- Log rotation and size limits
- Separate files for errors, combined logs, exceptions
- Performance logging for monitoring
- Environment-specific log levels

## 🔄 Request Flow

### WebSocket Connection Flow
```
Client → Socket.IO → SocketManager → AuthMiddleware → ValidationMiddleware → Handler → GameSession → Response
```

### Game Session Lifecycle
```
1. Matchmaking: Players join queue
2. Session Creation: 4+ players matched
3. Lobby Phase: 10-second spawn selection
4. Game Start: Initialize map, questions, timers
5. In Progress: Handle moves, questions, zone updates
6. Game End: Calculate winner, statistics
7. Cleanup: Clear timers, archive session
```

## 🛡️ Production Features

### Security
- Input validation on all socket events
- Rate limiting per connection
- SQL injection prevention via parameterized queries
- XSS protection for user-generated content
- Environment variable protection

### Performance
- Memory leak prevention via timer cleanup
- Session cache with TTL
- Database connection pooling
- Efficient event broadcasting
- Lazy loading of game resources

### Monitoring
- Structured logging with correlation IDs
- Performance metrics tracking
- Memory usage monitoring
- Active session tracking
- Error rate monitoring

### Reliability
- Graceful error handling
- Automatic reconnection support
- Session persistence in database
- Transaction support for critical operations
- Health check endpoints

## 📊 Database Schema

### Sessions Table
```sql
battle_royale_sessions
├── session_id (PK)
├── state
├── players (JSONB)
├── game_data (JSONB)
├── created_at
├── updated_at
└── is_active
```

### User States Table
```sql
battle_royale_user_states
├── id (PK)
├── session_id (FK)
├── player_id
├── current_state (JSONB)
├── statistics (JSONB)
└── timestamps
```

## 🚀 Deployment Considerations

### Environment Variables
```env
# Server
NODE_ENV=production
PORT=5003

# Database
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_key

# Game Config
MIN_PLAYERS=4
MAX_PLAYERS=8
GAME_DURATION_MS=1920000

# Services
JUDGE0_API_URL=judge0_url
JUDGE0_API_KEY=judge0_key

# Monitoring
LOG_LEVEL=info
ENABLE_ANALYTICS=true
```

### Scaling Strategies
1. **Horizontal Scaling**: Multiple server instances with sticky sessions
2. **Load Balancing**: HAProxy or NGINX for WebSocket support
3. **Caching**: Redis for session cache and matchmaking queue
4. **Database**: Read replicas for analytics queries
5. **CDN**: Static assets and frontend distribution

### Monitoring Stack
- **Logs**: Winston → CloudWatch/ELK Stack
- **Metrics**: Custom metrics → Prometheus/Grafana
- **Errors**: Sentry for error tracking
- **APM**: New Relic/DataDog for performance monitoring

## 🔧 Development Guidelines

### Code Style
- ESLint configuration for consistent code style
- Prettier for automatic formatting
- JSDoc comments for all public methods
- Meaningful variable and function names

### Testing Strategy
- Unit tests for game logic (Jest)
- Integration tests for socket events
- Load testing for concurrent sessions
- E2E tests for complete game flows

### Git Workflow
- Feature branches from `develop`
- Pull requests with code review
- Semantic versioning for releases
- Automated CI/CD pipeline

## 📈 Performance Benchmarks

### Target Metrics
- **Response Time**: < 100ms for game actions
- **Concurrent Sessions**: 100+ active games
- **Players per Session**: 4-8 players
- **Memory Usage**: < 512MB for 100 sessions
- **CPU Usage**: < 70% under normal load
- **Uptime**: 99.9% availability

### Optimization Techniques
1. Object pooling for frequently created objects
2. Efficient data structures (Map vs Object)
3. Debouncing for frequent updates
4. Batch database operations
5. Lazy evaluation where possible

## 🎮 Next Steps

### Immediate Priorities
1. Complete socket event handler refactoring
2. Implement service layer pattern
3. Add comprehensive test coverage
4. Set up CI/CD pipeline

### Future Enhancements
1. Implement Redis for session caching
2. Add WebRTC for voice chat
3. Create admin dashboard
4. Implement replay system
5. Add tournament mode

## 📝 Migration Guide

### From Old Architecture to New
1. **Stop old server**: Gracefully shutdown existing server
2. **Database migration**: Run migration scripts if schema changed
3. **Environment setup**: Configure all required environment variables
4. **Deploy new server**: Start refactored server
5. **Monitor**: Check logs and metrics for issues
6. **Rollback plan**: Keep old server ready for quick rollback

### API Compatibility
- Socket event names remain the same for backward compatibility
- Response formats unchanged to maintain frontend compatibility
- New features use versioned events (e.g., `v2_game_state`)

## 🤝 Contributing

### Development Setup
```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env with your configuration

# Run development server
npm run dev

# Run tests
npm test

# Run linter
npm run lint
```

### Code Review Checklist
- [ ] No memory leaks (timers cleared, listeners removed)
- [ ] Proper error handling (try-catch, error events)
- [ ] Input validation (socket events, API requests)
- [ ] Logging added (info, warnings, errors)
- [ ] Tests written/updated
- [ ] Documentation updated
- [ ] Performance impact considered

## 📚 Documentation

- [API Documentation](./docs/API.md)
- [Socket Events](./docs/SOCKET_EVENTS.md)
- [Game Rules](./docs/GAME_RULES.md)
- [Deployment Guide](./docs/DEPLOYMENT.md)

---

**Version**: 2.0.0  
**Last Updated**: December 2024  
**Maintained By**: Development Team
