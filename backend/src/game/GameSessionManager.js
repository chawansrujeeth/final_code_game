/**
 * Game Session Manager
 * Production-ready session management with proper lifecycle and memory management
 */

const { EventEmitter } = require('events');
const { createLogger } = require('../utils/logger');
const { SessionError, ErrorFactory } = require('../utils/errors');
const { GameStateMachine, GameStates } = require('./GameStateMachine');
const TimerManager = require('../core/TimerManager');
const config = require('../config');

/**
 * Game Session Class
 */
class GameSession extends EventEmitter {
  constructor(sessionId, options = {}) {
    super();
    
    this.sessionId = sessionId;
    this.createdAt = Date.now();
    this.lastActivity = Date.now();
    this.logger = createLogger(`GameSession:${sessionId}`);
    
    // Configuration
    this.config = {
      minPlayers: options.minPlayers || config.game.minPlayersPerMatch,
      maxPlayers: options.maxPlayers || config.game.maxPlayersPerMatch,
      gameDuration: options.gameDuration || config.game.gameDurationMs,
      lobbyTimeout: options.lobbyTimeout || config.game.lobbyCountdownMs
    };
    
    // State machine
    this.stateMachine = new GameStateMachine(sessionId);
    
    // Players management
    this.players = new Map(); // playerId -> playerData
    this.spectators = new Set(); // playerId
    
    // Game data
    this.gameData = {
      map: null,
      zoneState: null,
      edgeQuestions: new Map(),
      nodeQuestions: new Map(),
      usedQuestions: new Set(),
      gameStartTime: null,
      gameEndTime: null,
      winner: null,
      statistics: {}
    };
    
    // Socket management
    this.sockets = new Map(); // playerId -> socketId
    
    // Initialize
    this.initialize();
  }
  
  initialize() {
    // Listen to state machine events
    this.stateMachine.on('stateChanged', (data) => {
      this.lastActivity = Date.now();
      this.emit('stateChanged', data);
    });
    
    this.stateMachine.on(GameStates.IN_PROGRESS, () => {
      this.gameData.gameStartTime = Date.now();
    });
    
    this.stateMachine.on(GameStates.COMPLETED, () => {
      this.gameData.gameEndTime = Date.now();
      this.calculateStatistics();
    });
    
    this.logger.info('Session initialized', {
      sessionId: this.sessionId,
      config: this.config
    });
  }
  
  /**
   * Player Management
   */
  addPlayer(playerId, playerData) {
    if (this.players.size >= this.config.maxPlayers) {
      throw ErrorFactory.gameFull();
    }
    
    if (this.stateMachine.isTerminal()) {
      throw ErrorFactory.invalidGameState('Game has ended');
    }
    
    const player = {
      playerId,
      playerName: playerData.playerName || `Player ${playerId}`,
      joinedAt: Date.now(),
      isConnected: true,
      socketId: playerData.socketId || null,
      
      // Game state
      health: config.game.health.maxHealth,
      currentNode: null,
      selectedSpawnNode: null,
      questionsAnswered: 0,
      correctAnswers: 0,
      wrongAnswers: 0,
      isAlive: true,
      isEliminated: false,
      
      // Additional data
      ...playerData
    };
    
    this.players.set(playerId, player);
    this.stateMachine.updatePlayerCount(this.players.size);
    
    this.logger.info('Player added', {
      sessionId: this.sessionId,
      playerId,
      playerCount: this.players.size
    });
    
    this.emit('playerAdded', { sessionId: this.sessionId, playerId, player });
    
    return player;
  }
  
  removePlayer(playerId) {
    const player = this.players.get(playerId);
    if (!player) return false;
    
    this.players.delete(playerId);
    this.sockets.delete(playerId);
    this.stateMachine.updatePlayerCount(this.players.size);
    
    this.logger.info('Player removed', {
      sessionId: this.sessionId,
      playerId,
      playerCount: this.players.size
    });
    
    this.emit('playerRemoved', { sessionId: this.sessionId, playerId });
    
    // Check if game should end
    if (this.stateMachine.isActive() && this.getAlivePlayers().length <= 1) {
      this.checkWinCondition();
    }
    
    return true;
  }
  
  updatePlayer(playerId, updates) {
    const player = this.players.get(playerId);
    if (!player) {
      throw ErrorFactory.playerNotFound(playerId);
    }
    
    Object.assign(player, updates, {
      lastUpdated: Date.now()
    });
    
    this.lastActivity = Date.now();
    
    // Check for elimination
    if (updates.health !== undefined && updates.health <= 0) {
      player.isAlive = false;
      player.isEliminated = true;
      this.emit('playerEliminated', {
        sessionId: this.sessionId,
        playerId,
        reason: updates.eliminationReason || 'health_depleted'
      });
      
      // Check win condition
      if (this.stateMachine.isActive()) {
        this.checkWinCondition();
      }
    }
    
    return player;
  }
  
  getPlayer(playerId) {
    return this.players.get(playerId);
  }
  
  getAllPlayers() {
    return Array.from(this.players.values());
  }
  
  getAlivePlayers() {
    return this.getAllPlayers().filter(p => p.isAlive);
  }
  
  getConnectedPlayers() {
    return this.getAllPlayers().filter(p => p.isConnected);
  }
  
  /**
   * Socket Management
   */
  setPlayerSocket(playerId, socketId) {
    const player = this.players.get(playerId);
    if (!player) return false;
    
    player.socketId = socketId;
    player.isConnected = true;
    this.sockets.set(playerId, socketId);
    
    // Clear disconnect timeout if exists
    TimerManager.clearDisconnectTimeout(this.sessionId, playerId);
    
    return true;
  }
  
  disconnectPlayer(playerId) {
    const player = this.players.get(playerId);
    if (!player) return false;
    
    player.isConnected = false;
    player.disconnectedAt = Date.now();
    
    // Set disconnect timeout
    const disconnectTimeout = 60000; // 1 minute
    TimerManager.setDisconnectTimeout(
      this.sessionId,
      playerId,
      disconnectTimeout,
      () => this.handlePlayerTimeout(playerId)
    );
    
    this.emit('playerDisconnected', { sessionId: this.sessionId, playerId });
    
    return true;
  }
  
  handlePlayerTimeout(playerId) {
    const player = this.players.get(playerId);
    if (!player || player.isConnected) return;
    
    // Remove player if game hasn't started
    if (!this.stateMachine.isActive()) {
      this.removePlayer(playerId);
    } else {
      // Mark as eliminated if game is active
      this.updatePlayer(playerId, {
        health: 0,
        isEliminated: true,
        eliminationReason: 'disconnected'
      });
    }
  }
  
  /**
   * Game Flow Management
   */
  startLobby() {
    if (this.stateMachine.getState() !== GameStates.MATCHMAKING) {
      throw ErrorFactory.invalidGameState('Cannot start lobby from current state');
    }
    
    this.stateMachine.transition(GameStates.LOBBY);
    
    // Start lobby countdown
    TimerManager.setLobbyCountdown(
      this.sessionId,
      this.config.lobbyTimeout,
      () => this.startGame(),
      (remaining) => {
        this.emit('lobbyCountdown', {
          sessionId: this.sessionId,
          remaining,
          total: this.config.lobbyTimeout
        });
      }
    );
  }
  
  startGame() {
    try {
      this.stateMachine.startGame({
        playerCount: this.players.size,
        timestamp: Date.now()
      });
      
      // Initialize game components
      this.initializeGameData();
      
      // Start game timer
      TimerManager.setGameTimer(
        this.sessionId,
        this.config.gameDuration,
        () => this.endGame('timeout'),
        (remaining) => {
          this.emit('gameTimer', {
            sessionId: this.sessionId,
            remaining,
            total: this.config.gameDuration
          });
        }
      );
      
      // Start zone progression
      this.startZoneProgression();
      
      this.logger.info('Game started', {
        sessionId: this.sessionId,
        playerCount: this.players.size
      });
      
      this.emit('gameStarted', {
        sessionId: this.sessionId,
        players: this.getAllPlayers(),
        gameData: this.gameData
      });
      
    } catch (error) {
      this.logger.error('Failed to start game', error);
      throw error;
    }
  }
  
  endGame(reason = 'normal', winnerId = null) {
    if (this.stateMachine.isTerminal()) return;
    
    // Determine winner if not provided
    if (!winnerId && reason !== 'cancelled') {
      const alivePlayers = this.getAlivePlayers();
      if (alivePlayers.length === 1) {
        winnerId = alivePlayers[0].playerId;
      } else if (alivePlayers.length > 1) {
        // Player with most health wins
        winnerId = alivePlayers.reduce((prev, curr) => 
          curr.health > prev.health ? curr : prev
        ).playerId;
      }
    }
    
    this.gameData.winner = winnerId;
    
    // Transition state machine
    this.stateMachine.endGame(winnerId, { reason });
    
    // Clear all timers
    TimerManager.clearSession(this.sessionId);
    
    this.logger.info('Game ended', {
      sessionId: this.sessionId,
      reason,
      winner: winnerId
    });
    
    this.emit('gameEnded', {
      sessionId: this.sessionId,
      reason,
      winner: winnerId,
      statistics: this.gameData.statistics
    });
  }
  
  pauseGame(reason) {
    this.stateMachine.pauseGame(reason);
    
    // Pause timers
    // Note: Implement timer pause/resume if needed
    
    this.emit('gamePaused', {
      sessionId: this.sessionId,
      reason
    });
  }
  
  resumeGame() {
    this.stateMachine.resumeGame();
    
    // Resume timers
    // Note: Implement timer pause/resume if needed
    
    this.emit('gameResumed', {
      sessionId: this.sessionId
    });
  }
  
  /**
   * Game Mechanics
   */
  initializeGameData() {
    // Initialize zone state
    this.gameData.zoneState = {
      safeCircle: { x: 0, y: 0, r: config.game.zone.mapBoundary * 0.7 },
      nextSafeCircle: null,
      blueRadius: config.game.zone.mapBoundary,
      phase: 'moving',
      phaseTimer: 0,
      matchElapsed: 0
    };
    
    // Generate next safe circle
    this.generateNextSafeCircle();
  }
  
  startZoneProgression() {
    const TICK_INTERVAL = 1000; // 1 second
    
    TimerManager.setZoneTimer(this.sessionId, TICK_INTERVAL, () => {
      this.updateZone();
    });
  }
  
  updateZone() {
    const zone = this.gameData.zoneState;
    if (!zone) return;
    
    zone.phaseTimer++;
    zone.matchElapsed++;
    
    if (zone.phase === 'moving') {
      const diff = zone.blueRadius - zone.safeCircle.r;
      if (diff <= 1) {
        zone.blueRadius = zone.safeCircle.r;
        zone.phase = 'waiting';
        zone.phaseTimer = 0;
      } else {
        const shrinkPerSecond = diff / config.game.zone.shrinkSeconds;
        zone.blueRadius = Math.max(zone.safeCircle.r, zone.blueRadius - shrinkPerSecond);
      }
    } else if (zone.phase === 'waiting' && zone.phaseTimer >= config.game.zone.waitSeconds) {
      zone.safeCircle = zone.nextSafeCircle;
      this.generateNextSafeCircle();
      zone.phase = 'moving';
      zone.phaseTimer = 0;
    }
    
    // Apply zone damage
    this.applyZoneDamage();
    
    this.emit('zoneUpdate', {
      sessionId: this.sessionId,
      zoneState: zone
    });
  }
  
  generateNextSafeCircle() {
    const zone = this.gameData.zoneState;
    const parent = zone.safeCircle;
    
    if (parent.r > 20) {
      const scale = 0.8 + Math.random() * 0.1; // 80-90% of parent
      const r = parent.r * scale;
      const angle = Math.random() * 2 * Math.PI;
      const distance = Math.random() * (parent.r - r);
      
      zone.nextSafeCircle = {
        x: parent.x + Math.cos(angle) * distance,
        y: parent.y + Math.sin(angle) * distance,
        r
      };
    } else {
      zone.nextSafeCircle = { ...parent, r: 0 };
    }
  }
  
  applyZoneDamage() {
    // Implementation depends on node positions
    // This is a placeholder - implement based on your map structure
    const zone = this.gameData.zoneState;
    const damagePerSecond = config.game.zone.baseDamagePerSecond;
    
    this.getAllPlayers().forEach(player => {
      if (!player.isAlive) return;
      
      // Check if player is outside safe zone
      // This requires node position mapping
      const isOutside = false; // Implement actual check
      
      if (isOutside) {
        this.updatePlayer(player.playerId, {
          health: Math.max(0, player.health - damagePerSecond),
          eliminationReason: 'zone_damage'
        });
      }
    });
  }
  
  checkWinCondition() {
    const alivePlayers = this.getAlivePlayers();
    
    // Check if someone reached target
    const targetReacher = alivePlayers.find(p => p.currentNode === 'TARGET');
    if (targetReacher) {
      this.endGame('target_reached', targetReacher.playerId);
      return;
    }
    
    // Check if only one player remains
    if (alivePlayers.length <= 1) {
      const winner = alivePlayers[0];
      this.endGame('last_survivor', winner ? winner.playerId : null);
    }
  }
  
  calculateStatistics() {
    const stats = {
      duration: this.gameData.gameEndTime - this.gameData.gameStartTime,
      totalPlayers: this.players.size,
      winner: this.gameData.winner,
      playerStats: {}
    };
    
    this.getAllPlayers().forEach(player => {
      stats.playerStats[player.playerId] = {
        questionsAnswered: player.questionsAnswered,
        correctAnswers: player.correctAnswers,
        wrongAnswers: player.wrongAnswers,
        finalHealth: player.health,
        survived: player.isAlive,
        placement: null // Calculate placement based on elimination order
      };
    });
    
    this.gameData.statistics = stats;
  }
  
  /**
   * Cleanup and Disposal
   */
  dispose() {
    // Clear all timers
    TimerManager.clearSession(this.sessionId);
    
    // Clear event listeners
    this.removeAllListeners();
    this.stateMachine.removeAllListeners();
    
    // Clear data
    this.players.clear();
    this.spectators.clear();
    this.sockets.clear();
    
    this.logger.info('Session disposed', {
      sessionId: this.sessionId
    });
  }
  
  /**
   * Serialization
   */
  toJSON() {
    return {
      sessionId: this.sessionId,
      createdAt: this.createdAt,
      lastActivity: this.lastActivity,
      state: this.stateMachine.getStateInfo(),
      players: Array.from(this.players.values()),
      gameData: {
        ...this.gameData,
        edgeQuestions: Array.from(this.gameData.edgeQuestions.entries()),
        nodeQuestions: Array.from(this.gameData.nodeQuestions.entries()),
        usedQuestions: Array.from(this.gameData.usedQuestions)
      },
      config: this.config
    };
  }
}

/**
 * Game Session Manager Singleton
 */
class GameSessionManager extends EventEmitter {
  constructor() {
    super();
    this.sessions = new Map(); // sessionId -> GameSession
    this.logger = createLogger('GameSessionManager');
    this.stats = {
      totalSessionsCreated: 0,
      activeSessionsCount: 0,
      completedSessionsCount: 0
    };
    
    // Start cleanup interval
    this.startCleanupInterval();
  }
  
  /**
   * Create a new session
   */
  createSession(sessionId = null, options = {}) {
    sessionId = sessionId || this.generateSessionId();
    
    if (this.sessions.has(sessionId)) {
      throw new SessionError('Session already exists', 'SESSION_EXISTS', { sessionId });
    }
    
    if (this.sessions.size >= config.session.maxConcurrentSessions) {
      throw new SessionError('Maximum concurrent sessions reached', 'MAX_SESSIONS_REACHED');
    }
    
    const session = new GameSession(sessionId, options);
    
    // Subscribe to session events
    session.on('stateChanged', (data) => {
      this.emit('sessionStateChanged', data);
    });
    
    session.on('gameEnded', (data) => {
      this.stats.completedSessionsCount++;
      this.scheduleSessionCleanup(sessionId);
    });
    
    this.sessions.set(sessionId, session);
    this.stats.totalSessionsCreated++;
    this.stats.activeSessionsCount = this.sessions.size;
    
    this.logger.info('Session created', {
      sessionId,
      totalSessions: this.sessions.size
    });
    
    return session;
  }
  
  /**
   * Get an existing session
   */
  getSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw ErrorFactory.sessionNotFound(sessionId);
    }
    return session;
  }
  
  /**
   * Get or create session
   */
  getOrCreateSession(sessionId, options = {}) {
    try {
      return this.getSession(sessionId);
    } catch (error) {
      if (error.code === 'SESSION_NOT_FOUND') {
        return this.createSession(sessionId, options);
      }
      throw error;
    }
  }
  
  /**
   * Delete a session
   */
  deleteSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    
    session.dispose();
    this.sessions.delete(sessionId);
    this.stats.activeSessionsCount = this.sessions.size;
    
    this.logger.info('Session deleted', {
      sessionId,
      remainingSessions: this.sessions.size
    });
    
    return true;
  }
  
  /**
   * Get all sessions
   */
  getAllSessions() {
    return Array.from(this.sessions.values());
  }
  
  /**
   * Get active sessions
   */
  getActiveSessions() {
    return this.getAllSessions().filter(s => s.stateMachine.isActive());
  }
  
  /**
   * Schedule session cleanup after game ends
   */
  scheduleSessionCleanup(sessionId, delay = 300000) { // 5 minutes default
    TimerManager.setTimeout(
      sessionId,
      'SESSION_CLEANUP',
      () => this.deleteSession(sessionId),
      delay,
      { type: 'session_cleanup' }
    );
  }
  
  /**
   * Cleanup inactive sessions
   */
  cleanupInactiveSessions() {
    const now = Date.now();
    const threshold = config.session.inactiveThresholdMs;
    let cleanedCount = 0;
    
    this.sessions.forEach((session, sessionId) => {
      // Don't clean up active games
      if (session.stateMachine.isActive()) return;
      
      // Check if session is inactive
      if (now - session.lastActivity > threshold) {
        this.deleteSession(sessionId);
        cleanedCount++;
      }
    });
    
    if (cleanedCount > 0) {
      this.logger.info(`Cleaned up ${cleanedCount} inactive sessions`);
    }
    
    return cleanedCount;
  }
  
  /**
   * Start cleanup interval
   */
  startCleanupInterval() {
    setInterval(() => {
      this.cleanupInactiveSessions();
      TimerManager.cleanup();
    }, config.session.cleanupIntervalMs);
  }
  
  /**
   * Generate unique session ID
   */
  generateSessionId() {
    return `BR_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  /**
   * Get statistics
   */
  getStatistics() {
    return {
      ...this.stats,
      sessions: this.sessions.size,
      activeSessions: this.getActiveSessions().length,
      memoryUsage: process.memoryUsage(),
      timerStats: TimerManager.getStats()
    };
  }
}

// Export singleton instance
module.exports = new GameSessionManager();
