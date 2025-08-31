// backend/sockets/BattleRoyaleSocketHandler.js
// Socket handler for Battle Royale game mode

const BaseSocketHandler = require('./BaseSocketHandler');
const { v4: uuidv4 } = require('uuid');

class BattleRoyaleSocketHandler extends BaseSocketHandler {
  constructor(io, config, logger, services) {
    super(io, config, logger);
    this.services = services;
    this.games = new Map(); // gameId -> game state
    this.playerGames = new Map(); // playerId -> gameId
  }

  /**
   * Register Battle Royale specific socket events
   * @param {Socket} socket - The socket to register events on
   */
  registerSocketEvents(socket) {
    // Lobby events
    socket.on('create-game', (data) => this.handleCreateGame(socket, data));
    socket.on('join-game', (data) => this.handleJoinGame(socket, data));
    socket.on('leave-game', () => this.handleLeaveGame(socket));
    socket.on('ready-toggle', () => this.handleReadyToggle(socket));
    socket.on('start-game', () => this.handleStartGame(socket));

    // In-game events
    socket.on('move-to-node', (data) => this.handleMoveToNode(socket, data));
    socket.on('submit-answer', (data) => this.handleSubmitAnswer(socket, data));
    socket.on('use-power-up', (data) => this.handleUsePowerUp(socket, data));
    socket.on('send-message', (data) => this.handleSendMessage(socket, data));

    // Spectator events
    socket.on('spectate-game', (data) => this.handleSpectateGame(socket, data));
    socket.on('stop-spectating', () => this.handleStopSpectating(socket));
  }

  /**
   * Handle game creation
   */
  async handleCreateGame(socket, data) {
    try {
      const { gameSettings = {} } = data;
      const gameId = uuidv4();
      const hostId = socket.user.id;

      const game = {
        id: gameId,
        hostId,
        status: 'waiting', // waiting, starting, in-progress, finished
        settings: {
          maxPlayers: gameSettings.maxPlayers || this.config.game.battleRoyale.maxPlayers,
          minPlayers: gameSettings.minPlayers || this.config.game.battleRoyale.minPlayers,
          questionTimeout: gameSettings.questionTimeout || this.config.game.battleRoyale.questionTimeout,
          isPrivate: gameSettings.isPrivate || false,
          difficulty: gameSettings.difficulty || 'medium'
        },
        players: new Map(),
        spectators: new Set(),
        mapState: this.initializeMapState(),
        questionAssignments: new Map(),
        startTime: null,
        endTime: null,
        createdAt: new Date()
      };

      // Add host as first player
      const player = {
        id: hostId,
        socketId: socket.id,
        username: socket.user.username,
        isHost: true,
        isReady: false,
        stats: this.createPlayerStats(),
        position: null, // Will be assigned on game start
        health: 100,
        isAlive: true
      };

      game.players.set(hostId, player);
      this.games.set(gameId, game);
      this.playerGames.set(hostId, gameId);

      // Join socket to game room
      socket.join(`game:${gameId}`);

      // Emit success
      socket.emit('game-created', {
        gameId,
        game: this.sanitizeGameState(game)
      });

      this.logger.info(`Game created: ${gameId} by ${socket.user.username}`);
    } catch (error) {
      this.logger.error('Error creating game:', error);
      socket.emit('error', { message: 'Failed to create game' });
    }
  }

  /**
   * Handle player joining a game
   */
  async handleJoinGame(socket, data) {
    try {
      const { gameId } = data;
      const playerId = socket.user.id;

      // Validate game exists
      const game = this.games.get(gameId);
      if (!game) {
        return socket.emit('error', { message: 'Game not found' });
      }

      // Check if game is joinable
      if (game.status !== 'waiting') {
        return socket.emit('error', { message: 'Game already started' });
      }

      if (game.players.size >= game.settings.maxPlayers) {
        return socket.emit('error', { message: 'Game is full' });
      }

      // Check if player is already in a game
      if (this.playerGames.has(playerId) && this.playerGames.get(playerId) !== gameId) {
        return socket.emit('error', { message: 'Already in another game' });
      }

      // Add or update player
      const player = game.players.get(playerId) || {
        id: playerId,
        socketId: socket.id,
        username: socket.user.username,
        isHost: false,
        isReady: false,
        stats: this.createPlayerStats(),
        position: null,
        health: 100,
        isAlive: true
      };

      player.socketId = socket.id; // Update socket ID in case of reconnection
      game.players.set(playerId, player);
      this.playerGames.set(playerId, gameId);

      // Join socket to game room
      socket.join(`game:${gameId}`);

      // Notify all players
      this.broadcastToRoom(`game:${gameId}`, 'player-joined', {
        player: this.sanitizePlayer(player),
        gameState: this.sanitizeGameState(game)
      });

      this.logger.info(`Player ${socket.user.username} joined game ${gameId}`);
    } catch (error) {
      this.logger.error('Error joining game:', error);
      socket.emit('error', { message: 'Failed to join game' });
    }
  }

  /**
   * Handle player leaving a game
   */
  async handleLeaveGame(socket) {
    try {
      const playerId = socket.user.id;
      const gameId = this.playerGames.get(playerId);

      if (!gameId) {
        return socket.emit('error', { message: 'Not in a game' });
      }

      const game = this.games.get(gameId);
      if (!game) {
        this.playerGames.delete(playerId);
        return;
      }

      const player = game.players.get(playerId);
      if (!player) {
        return;
      }

      // Remove player from game
      game.players.delete(playerId);
      this.playerGames.delete(playerId);
      socket.leave(`game:${gameId}`);

      // Handle host leaving
      if (player.isHost && game.players.size > 0) {
        // Transfer host to another player
        const newHost = game.players.values().next().value;
        newHost.isHost = true;
        game.hostId = newHost.id;
      }

      // Delete game if empty
      if (game.players.size === 0) {
        this.games.delete(gameId);
        this.logger.info(`Game ${gameId} deleted (no players)`);
      } else {
        // Notify remaining players
        this.broadcastToRoom(`game:${gameId}`, 'player-left', {
          playerId,
          gameState: this.sanitizeGameState(game)
        });
      }

      socket.emit('left-game');
      this.logger.info(`Player ${socket.user.username} left game ${gameId}`);
    } catch (error) {
      this.logger.error('Error leaving game:', error);
      socket.emit('error', { message: 'Failed to leave game' });
    }
  }

  /**
   * Handle player ready toggle
   */
  async handleReadyToggle(socket) {
    try {
      const playerId = socket.user.id;
      const gameId = this.playerGames.get(playerId);

      if (!gameId) {
        return socket.emit('error', { message: 'Not in a game' });
      }

      const game = this.games.get(gameId);
      const player = game.players.get(playerId);

      if (!player) {
        return socket.emit('error', { message: 'Player not found' });
      }

      // Toggle ready status
      player.isReady = !player.isReady;

      // Notify all players
      this.broadcastToRoom(`game:${gameId}`, 'player-ready-changed', {
        playerId,
        isReady: player.isReady,
        gameState: this.sanitizeGameState(game)
      });

      // Check if all players are ready
      const allReady = Array.from(game.players.values()).every(p => p.isReady);
      const enoughPlayers = game.players.size >= game.settings.minPlayers;

      if (allReady && enoughPlayers) {
        this.broadcastToRoom(`game:${gameId}`, 'can-start-game', {
          canStart: true
        });
      }
    } catch (error) {
      this.logger.error('Error toggling ready:', error);
      socket.emit('error', { message: 'Failed to toggle ready status' });
    }
  }

  /**
   * Handle game start
   */
  async handleStartGame(socket) {
    try {
      const playerId = socket.user.id;
      const gameId = this.playerGames.get(playerId);

      if (!gameId) {
        return socket.emit('error', { message: 'Not in a game' });
      }

      const game = this.games.get(gameId);
      const player = game.players.get(playerId);

      // Validate conditions
      if (!player.isHost) {
        return socket.emit('error', { message: 'Only host can start the game' });
      }

      if (game.status !== 'waiting') {
        return socket.emit('error', { message: 'Game already started' });
      }

      const allReady = Array.from(game.players.values()).every(p => p.isReady);
      if (!allReady) {
        return socket.emit('error', { message: 'Not all players are ready' });
      }

      if (game.players.size < game.settings.minPlayers) {
        return socket.emit('error', { message: 'Not enough players' });
      }

      // Initialize game
      game.status = 'starting';
      game.startTime = new Date();

      // Assign spawn positions
      const spawnNodes = this.getSpawnNodes();
      let spawnIndex = 0;
      for (const player of game.players.values()) {
        player.position = spawnNodes[spawnIndex % spawnNodes.length];
        spawnIndex++;
      }

      // Load questions for the game
      await this.loadGameQuestions(game);

      // Start countdown
      this.broadcastToRoom(`game:${gameId}`, 'game-starting', {
        countdown: this.config.game.battleRoyale.startDelay,
        gameState: this.sanitizeGameState(game)
      });

      // Start game after countdown
      setTimeout(() => {
        game.status = 'in-progress';
        this.broadcastToRoom(`game:${gameId}`, 'game-started', {
          gameState: this.sanitizeGameState(game)
        });
        this.logger.info(`Game ${gameId} started with ${game.players.size} players`);
      }, this.config.game.battleRoyale.startDelay);

    } catch (error) {
      this.logger.error('Error starting game:', error);
      socket.emit('error', { message: 'Failed to start game' });
    }
  }

  /**
   * Handle player movement to a node
   */
  async handleMoveToNode(socket, data) {
    try {
      const { targetNode, edgeId } = data;
      const playerId = socket.user.id;
      const gameId = this.playerGames.get(playerId);

      if (!gameId) {
        return socket.emit('error', { message: 'Not in a game' });
      }

      const game = this.games.get(gameId);
      if (game.status !== 'in-progress') {
        return socket.emit('error', { message: 'Game not in progress' });
      }

      const player = game.players.get(playerId);
      if (!player.isAlive) {
        return socket.emit('error', { message: 'Player is eliminated' });
      }

      // Validate movement
      const canMove = this.validateMovement(player.position, targetNode, game.mapState);
      if (!canMove) {
        return socket.emit('error', { message: 'Invalid movement' });
      }

      // Check if edge requires a question
      const edge = game.mapState.edges.get(edgeId);
      if (edge && edge.requiresQuestion && !edge.completed.has(playerId)) {
        // Get question for this edge
        const question = await this.getEdgeQuestion(game, edgeId);
        
        socket.emit('question-required', {
          edgeId,
          question: this.sanitizeQuestion(question),
          timeout: game.settings.questionTimeout
        });
      } else {
        // Direct movement
        this.executeMovement(game, player, targetNode);
      }

    } catch (error) {
      this.logger.error('Error handling movement:', error);
      socket.emit('error', { message: 'Failed to process movement' });
    }
  }

  /**
   * Handle answer submission
   */
  async handleSubmitAnswer(socket, data) {
    try {
      const { edgeId, answer, questionId } = data;
      const playerId = socket.user.id;
      const gameId = this.playerGames.get(playerId);

      if (!gameId) {
        return socket.emit('error', { message: 'Not in a game' });
      }

      const game = this.games.get(gameId);
      const player = game.players.get(playerId);

      // Validate answer
      const isCorrect = await this.services.questionService.validateAnswer(questionId, answer);

      if (isCorrect) {
        // Mark edge as completed for player
        const edge = game.mapState.edges.get(edgeId);
        edge.completed.add(playerId);

        // Award health
        player.health = Math.min(100, player.health + this.config.game.battleRoyale.correctAnswerHealth);
        player.stats.correctAnswers++;

        // Execute movement
        const [, targetNode] = edgeId.split('-');
        this.executeMovement(game, player, targetNode);

        socket.emit('answer-correct', {
          health: player.health,
          newPosition: targetNode
        });
      } else {
        // Apply damage
        player.health = Math.max(0, player.health - this.config.game.battleRoyale.wrongAnswerDamage);
        player.stats.wrongAnswers++;

        if (player.health <= 0) {
          player.isAlive = false;
          this.handlePlayerElimination(game, player);
        }

        socket.emit('answer-wrong', {
          health: player.health,
          isAlive: player.isAlive
        });
      }

      // Update all players
      this.broadcastToRoom(`game:${gameId}`, 'game-state-updated', {
        gameState: this.sanitizeGameState(game)
      });

    } catch (error) {
      this.logger.error('Error handling answer:', error);
      socket.emit('error', { message: 'Failed to process answer' });
    }
  }

  // Helper methods

  /**
   * Initialize map state for a new game
   */
  initializeMapState() {
    const mapState = {
      nodes: new Map(),
      edges: new Map(),
      zones: []
    };

    // Initialize nodes and edges based on your map structure
    // This is a simplified version - expand based on your actual map

    return mapState;
  }

  /**
   * Create initial player stats
   */
  createPlayerStats() {
    return {
      questionsAnswered: 0,
      correctAnswers: 0,
      wrongAnswers: 0,
      nodesVisited: 0,
      damageDealt: 0,
      damageTaken: 0,
      powerUpsUsed: 0,
      eliminations: 0
    };
  }

  /**
   * Get available spawn nodes
   */
  getSpawnNodes() {
    return ['SPAWN_1', 'SPAWN_2', 'SPAWN_3', 'SPAWN_4', 'SPAWN_5', 'SPAWN_6', 'SPAWN_7', 'SPAWN_8'];
  }

  /**
   * Validate if movement is allowed
   */
  validateMovement(fromNode, toNode, mapState) {
    // Implement movement validation logic
    return true; // Simplified for now
  }

  /**
   * Execute player movement
   */
  executeMovement(game, player, targetNode) {
    player.position = targetNode;
    player.stats.nodesVisited++;

    // Check for victory
    if (targetNode === 'TARGET') {
      this.handleVictory(game, player);
    }
  }

  /**
   * Handle player elimination
   */
  handlePlayerElimination(game, player) {
    player.isAlive = false;
    this.broadcastToRoom(`game:${game.id}`, 'player-eliminated', {
      playerId: player.id,
      username: player.username
    });

    // Check for game end
    const alivePlayers = Array.from(game.players.values()).filter(p => p.isAlive);
    if (alivePlayers.length <= 1) {
      this.endGame(game, alivePlayers[0]);
    }
  }

  /**
   * Handle player victory
   */
  handleVictory(game, winner) {
    this.endGame(game, winner);
  }

  /**
   * End the game
   */
  endGame(game, winner) {
    game.status = 'finished';
    game.endTime = new Date();

    this.broadcastToRoom(`game:${game.id}`, 'game-ended', {
      winner: winner ? this.sanitizePlayer(winner) : null,
      gameStats: this.calculateGameStats(game)
    });

    // Clean up after delay
    setTimeout(() => {
      this.cleanupGame(game.id);
    }, 60000); // Keep game data for 1 minute for stats viewing
  }

  /**
   * Clean up game data
   */
  cleanupGame(gameId) {
    const game = this.games.get(gameId);
    if (game) {
      for (const playerId of game.players.keys()) {
        this.playerGames.delete(playerId);
      }
      this.games.delete(gameId);
      this.logger.info(`Game ${gameId} cleaned up`);
    }
  }

  /**
   * Load questions for the game
   */
  async loadGameQuestions(game) {
    try {
      const questions = await this.services.questionService.getQuestionsForGame(
        game.id,
        game.settings.difficulty
      );
      game.questionAssignments = questions;
    } catch (error) {
      this.logger.error('Error loading questions:', error);
    }
  }

  /**
   * Get question for an edge
   */
  async getEdgeQuestion(game, edgeId) {
    // Return question assigned to this edge
    return game.questionAssignments.get(edgeId);
  }

  /**
   * Sanitize game state for client
   */
  sanitizeGameState(game) {
    return {
      id: game.id,
      hostId: game.hostId,
      status: game.status,
      settings: game.settings,
      players: Array.from(game.players.values()).map(p => this.sanitizePlayer(p)),
      spectatorCount: game.spectators.size,
      startTime: game.startTime,
      createdAt: game.createdAt
    };
  }

  /**
   * Sanitize player data for client
   */
  sanitizePlayer(player) {
    return {
      id: player.id,
      username: player.username,
      isHost: player.isHost,
      isReady: player.isReady,
      position: player.position,
      health: player.health,
      isAlive: player.isAlive,
      stats: player.stats
    };
  }

  /**
   * Sanitize question for client
   */
  sanitizeQuestion(question) {
    return {
      id: question.id,
      title: question.title,
      description: question.description,
      difficulty: question.difficulty,
      timeLimit: question.timeLimit,
      testCases: question.testCases?.map(tc => ({
        input: tc.input,
        expectedOutput: tc.output
      }))
    };
  }

  /**
   * Calculate game statistics
   */
  calculateGameStats(game) {
    const stats = {
      duration: game.endTime - game.startTime,
      totalPlayers: game.players.size,
      playerStats: []
    };

    for (const player of game.players.values()) {
      stats.playerStats.push({
        playerId: player.id,
        username: player.username,
        stats: player.stats,
        finalHealth: player.health,
        survived: player.isAlive
      });
    }

    return stats;
  }

  /**
   * Handle spectate game request
   */
  async handleSpectateGame(socket, data) {
    const { gameId } = data;
    const game = this.games.get(gameId);

    if (!game) {
      return socket.emit('error', { message: 'Game not found' });
    }

    socket.join(`game:${gameId}:spectators`);
    game.spectators.add(socket.id);

    socket.emit('spectating-game', {
      gameState: this.sanitizeGameState(game)
    });
  }

  /**
   * Handle stop spectating
   */
  async handleStopSpectating(socket) {
    // Find and leave spectator rooms
    const rooms = Array.from(socket.rooms);
    for (const room of rooms) {
      if (room.includes(':spectators')) {
        socket.leave(room);
        const gameId = room.split(':')[1];
        const game = this.games.get(gameId);
        if (game) {
          game.spectators.delete(socket.id);
        }
      }
    }
  }

  /**
   * Handle chat message
   */
  async handleSendMessage(socket, data) {
    const { message } = data;
    const playerId = socket.user.id;
    const gameId = this.playerGames.get(playerId);

    if (!gameId) return;

    this.broadcastToRoom(`game:${gameId}`, 'chat-message', {
      playerId,
      username: socket.user.username,
      message,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Clean up when client disconnects
   */
  cleanupClientSessions(socketId) {
    // Find player by socket ID and handle disconnection
    for (const [gameId, game] of this.games.entries()) {
      for (const [playerId, player] of game.players.entries()) {
        if (player.socketId === socketId) {
          // Mark player as disconnected but keep in game
          player.isConnected = false;
          this.broadcastToRoom(`game:${gameId}`, 'player-disconnected', {
            playerId,
            username: player.username
          });
          break;
        }
      }
    }
  }
}

module.exports = BattleRoyaleSocketHandler;
