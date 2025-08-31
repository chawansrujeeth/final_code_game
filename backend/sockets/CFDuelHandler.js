// backend/sockets/CFDuelHandler.js
// Codeforces 1v1 Duel Socket Handler

const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

class CFDuelHandler {
  constructor(io, db, logger) {
    this.io = io;
    this.db = db;
    this.logger = logger;
    this.matchmaking = new Map(); // userId -> { socket, userData }
    this.activeDuels = new Map(); // roomId -> duelData
    this.userRooms = new Map(); // userId -> roomId
    this.pollingIntervals = new Map(); // roomId -> intervalId
  }

  /**
   * Initialize CF Duel socket handlers
   */
  initialize() {
    this.logger.info('Initializing CF Duel Handler');
  }

  /**
   * Handle socket connection
   */
  handleConnection(socket) {
    // Join matchmaking queue
    socket.on('cf_duel:join_queue', (data) => this.handleJoinQueue(socket, data));
    
    // Leave matchmaking queue
    socket.on('cf_duel:leave_queue', () => this.handleLeaveQueue(socket));
    
    // Code updates during duel
    socket.on('cf_duel:code_update', (data) => this.handleCodeUpdate(socket, data));
    
    // Local test results
    socket.on('cf_duel:local_pass', (data) => this.handleLocalPass(socket, data));
    
    // Submit solution
    socket.on('cf_duel:submit', (data) => this.handleSubmit(socket, data));
    
    // Handle disconnection
    socket.on('disconnect', () => this.handleDisconnect(socket));
  }

  /**
   * Handle joining matchmaking queue
   */
  async handleJoinQueue(socket, { userId, cfHandle, rating }) {
    try {
      // Validate user
      if (!userId || !cfHandle) {
        socket.emit('cf_duel:error', { 
          message: 'User ID and CF handle required' 
        });
        return;
      }

      // Check if already in queue or duel
      if (this.matchmaking.has(userId)) {
        socket.emit('cf_duel:error', { 
          message: 'Already in matchmaking queue' 
        });
        return;
      }

      if (this.userRooms.has(userId)) {
        socket.emit('cf_duel:error', { 
          message: 'Already in an active duel' 
        });
        return;
      }

      // Add to matchmaking
      const userData = {
        socket,
        userId,
        cfHandle,
        rating: rating || 1500,
        joinedAt: Date.now()
      };

      this.matchmaking.set(userId, userData);
      socket.userId = userId;

      // Try to find a match
      const match = this.findMatch(userData);
      
      if (match) {
        await this.createDuel(userData, match);
      } else {
        socket.emit('cf_duel:waiting', {
          message: 'Waiting for opponent...',
          queueSize: this.matchmaking.size
        });
      }

      this.logger.info(`User ${userId} joined CF duel queue`);
    } catch (error) {
      this.logger.error('Error joining queue:', error);
      socket.emit('cf_duel:error', { 
        message: 'Failed to join matchmaking' 
      });
    }
  }

  /**
   * Find suitable match for a user
   */
  findMatch(userData) {
    const RATING_THRESHOLD = 200; // Match within 200 rating points
    
    for (const [otherId, otherData] of this.matchmaking) {
      if (otherId === userData.userId) continue;
      
      const ratingDiff = Math.abs(userData.rating - otherData.rating);
      
      // Match based on rating or wait time
      const waitTime = Date.now() - otherData.joinedAt;
      const expandedThreshold = RATING_THRESHOLD + (waitTime / 1000) * 10; // Expand by 10 rating per second
      
      if (ratingDiff <= expandedThreshold) {
        this.matchmaking.delete(otherId);
        return otherData;
      }
    }
    
    return null;
  }

  /**
   * Create a new duel between two players
   */
  async createDuel(player1, player2) {
    try {
      const roomId = `cf_duel_${uuidv4()}`;
      
      // Get random problem from database
      const problem = await this.getRandomProblem(player1.rating, player2.rating);
      
      if (!problem) {
        throw new Error('No suitable problem found');
      }

      // Create duel data
      const duelData = {
        roomId,
        players: [
          {
            userId: player1.userId,
            cfHandle: player1.cfHandle,
            socket: player1.socket,
            rating: player1.rating,
            localPassed: false,
            cfSubmitted: false,
            solveTime: null
          },
          {
            userId: player2.userId,
            cfHandle: player2.cfHandle,
            socket: player2.socket,
            rating: player2.rating,
            localPassed: false,
            cfSubmitted: false,
            solveTime: null
          }
        ],
        problem,
        startTime: Date.now(),
        status: 'active',
        winner: null
      };

      // Store duel data
      this.activeDuels.set(roomId, duelData);
      this.userRooms.set(player1.userId, roomId);
      this.userRooms.set(player2.userId, roomId);

      // Remove from matchmaking
      this.matchmaking.delete(player1.userId);
      this.matchmaking.delete(player2.userId);

      // Join sockets to room
      player1.socket.join(roomId);
      player2.socket.join(roomId);

      // Send duel start event
      const duelInfo = {
        roomId,
        opponent: {
          [player1.userId]: {
            userId: player2.userId,
            cfHandle: player2.cfHandle,
            rating: player2.rating
          },
          [player2.userId]: {
            userId: player1.userId,
            cfHandle: player1.cfHandle,
            rating: player1.rating
          }
        },
        problem: {
          url: problem.problem_url,
          samples: problem.samples,
          difficulty: problem.difficulty,
          tags: problem.tags
        },
        startTime: duelData.startTime
      };

      player1.socket.emit('cf_duel:start', {
        ...duelInfo,
        opponent: duelInfo.opponent[player1.userId]
      });
      
      player2.socket.emit('cf_duel:start', {
        ...duelInfo,
        opponent: duelInfo.opponent[player2.userId]
      });

      // Start polling for CF submissions
      this.startPolling(roomId);

      // Save to database
      await this.saveDuelToDatabase(duelData);

      this.logger.info(`CF Duel created: ${roomId}`);
    } catch (error) {
      this.logger.error('Error creating duel:', error);
      
      // Notify both players
      player1.socket.emit('cf_duel:error', { 
        message: 'Failed to create duel' 
      });
      player2.socket.emit('cf_duel:error', { 
        message: 'Failed to create duel' 
      });
      
      // Return to queue
      this.matchmaking.set(player1.userId, player1);
      this.matchmaking.set(player2.userId, player2);
    }
  }

  /**
   * Get random problem based on player ratings
   */
  async getRandomProblem(rating1, rating2) {
    const avgRating = Math.round((rating1 + rating2) / 2);
    
    // Map rating to difficulty
    let difficulty;
    if (avgRating < 1200) difficulty = 800;
    else if (avgRating < 1400) difficulty = 1000;
    else if (avgRating < 1600) difficulty = 1200;
    else if (avgRating < 1800) difficulty = 1400;
    else if (avgRating < 2000) difficulty = 1600;
    else difficulty = 1800;

    // Get problem from database
    const { data, error } = await this.db.query(
      `SELECT problem_url, samples, difficulty, tags
       FROM cf_problems 
       WHERE difficulty >= $1 AND difficulty <= $2
       ORDER BY RANDOM()
       LIMIT 1`,
      [difficulty - 200, difficulty + 200]
    );

    if (error || !data || data.length === 0) {
      // Fallback to any problem
      const { data: fallback } = await this.db.query(
        `SELECT problem_url, samples, difficulty, tags
         FROM cf_problems 
         ORDER BY RANDOM()
         LIMIT 1`
      );
      return fallback?.[0];
    }

    return data[0];
  }

  /**
   * Handle code updates during duel
   */
  handleCodeUpdate(socket, { roomId, code, language }) {
    const duel = this.activeDuels.get(roomId);
    if (!duel) return;

    const player = duel.players.find(p => p.socket === socket);
    if (!player) return;

    // Broadcast to opponent
    const opponent = duel.players.find(p => p.socket !== socket);
    if (opponent) {
      opponent.socket.emit('cf_duel:opponent_code', {
        code,
        language,
        cfHandle: player.cfHandle
      });
    }
  }

  /**
   * Handle local test pass
   */
  handleLocalPass(socket, { roomId, allPassed }) {
    const duel = this.activeDuels.get(roomId);
    if (!duel) return;

    const player = duel.players.find(p => p.socket === socket);
    if (!player) return;

    player.localPassed = allPassed;
    
    this.logger.info(`Player ${player.userId} local tests ${allPassed ? 'passed' : 'failed'} in room ${roomId}`);

    // Notify opponent
    const opponent = duel.players.find(p => p.socket !== socket);
    if (opponent) {
      opponent.socket.emit('cf_duel:opponent_status', {
        localPassed: allPassed,
        cfHandle: player.cfHandle
      });
    }
  }

  /**
   * Handle solution submission
   */
  handleSubmit(socket, { roomId }) {
    const duel = this.activeDuels.get(roomId);
    if (!duel) return;

    const player = duel.players.find(p => p.socket === socket);
    if (!player) return;

    player.cfSubmitted = true;
    
    this.logger.info(`Player ${player.userId} submitted to CF in room ${roomId}`);

    // Notify opponent
    const opponent = duel.players.find(p => p.socket !== socket);
    if (opponent) {
      opponent.socket.emit('cf_duel:opponent_submitted', {
        cfHandle: player.cfHandle
      });
    }
  }

  /**
   * Start polling Codeforces API for submissions
   */
  startPolling(roomId) {
    const interval = setInterval(async () => {
      try {
        await this.checkCFSubmissions(roomId);
      } catch (error) {
        this.logger.error(`Error polling CF for room ${roomId}:`, error);
      }
    }, 5000); // Poll every 5 seconds

    this.pollingIntervals.set(roomId, interval);

    // Stop polling after 30 minutes
    setTimeout(() => {
      this.stopPolling(roomId);
      this.endDuel(roomId, 'timeout');
    }, 30 * 60 * 1000);
  }

  /**
   * Check Codeforces submissions
   */
  async checkCFSubmissions(roomId) {
    const duel = this.activeDuels.get(roomId);
    if (!duel || duel.status !== 'active') {
      this.stopPolling(roomId);
      return;
    }

    // Parse problem info from URL
    const urlMatch = duel.problem.problem_url.match(/problemset\/problem\/(\d+)\/(\w+)/);
    if (!urlMatch) return;
    
    const [, contestId, index] = urlMatch;

    // Check each player's submissions
    for (const player of duel.players) {
      if (player.solveTime) continue; // Already solved

      try {
        const response = await axios.get(
          `https://codeforces.com/api/user.status?handle=${player.cfHandle}&from=1&count=20`
        );

        const submissions = response.data.result || [];
        
        const solved = submissions.find(sub =>
          sub.problem.contestId == contestId &&
          sub.problem.index === index &&
          sub.verdict === 'OK' &&
          sub.creationTimeSeconds * 1000 >= duel.startTime
        );

        if (solved && player.localPassed) {
          player.solveTime = solved.creationTimeSeconds * 1000;
          
          // Check if this player won
          const opponent = duel.players.find(p => p !== player);
          if (!opponent.solveTime) {
            // This player wins!
            this.endDuel(roomId, 'solved', player.userId);
            return;
          } else {
            // Both solved, check who was faster
            if (player.solveTime < opponent.solveTime) {
              this.endDuel(roomId, 'solved', player.userId);
            } else {
              this.endDuel(roomId, 'solved', opponent.userId);
            }
            return;
          }
        }
      } catch (error) {
        // Ignore API errors, will retry next interval
      }
    }
  }

  /**
   * Stop polling for a room
   */
  stopPolling(roomId) {
    const interval = this.pollingIntervals.get(roomId);
    if (interval) {
      clearInterval(interval);
      this.pollingIntervals.delete(roomId);
    }
  }

  /**
   * End a duel
   */
  async endDuel(roomId, reason, winnerId = null) {
    const duel = this.activeDuels.get(roomId);
    if (!duel || duel.status !== 'active') return;

    duel.status = 'completed';
    duel.winner = winnerId;
    duel.endTime = Date.now();
    duel.endReason = reason;

    // Stop polling
    this.stopPolling(roomId);

    // Notify players
    const result = {
      winner: winnerId,
      reason,
      duration: duel.endTime - duel.startTime,
      players: duel.players.map(p => ({
        userId: p.userId,
        cfHandle: p.cfHandle,
        solveTime: p.solveTime,
        localPassed: p.localPassed
      }))
    };

    this.io.to(roomId).emit('cf_duel:end', result);

    // Update database
    await this.updateDuelInDatabase(duel);

    // Clean up
    for (const player of duel.players) {
      this.userRooms.delete(player.userId);
      player.socket.leave(roomId);
    }
    
    this.activeDuels.delete(roomId);
    
    this.logger.info(`CF Duel ended: ${roomId}, winner: ${winnerId}, reason: ${reason}`);
  }

  /**
   * Handle leave queue
   */
  handleLeaveQueue(socket) {
    const userId = socket.userId;
    if (!userId || !this.matchmaking.has(userId)) {
      return;
    }

    this.matchmaking.delete(userId);
    socket.emit('cf_duel:left_queue', {
      message: 'Left matchmaking queue'
    });
    
    this.logger.info(`User ${userId} left CF duel queue`);
  }

  /**
   * Handle disconnection
   */
  handleDisconnect(socket) {
    const userId = socket.userId;
    if (!userId) return;

    // Remove from matchmaking if present
    if (this.matchmaking.has(userId)) {
      this.matchmaking.delete(userId);
      this.logger.info(`User ${userId} removed from matchmaking due to disconnect`);
    }

    // Handle active duel
    const roomId = this.userRooms.get(userId);
    if (roomId) {
      const duel = this.activeDuels.get(roomId);
      if (duel && duel.status === 'active') {
        const opponent = duel.players.find(p => p.userId !== userId);
        if (opponent) {
          this.endDuel(roomId, 'disconnect', opponent.userId);
        }
      }
    }
  }

  /**
   * Save duel to database
   */
  async saveDuelToDatabase(duelData) {
    try {
      await this.db.query(
        `INSERT INTO cf_duels (
          room_id, player1_id, player2_id, problem_url, 
          status, start_time, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [
          duelData.roomId,
          duelData.players[0].userId,
          duelData.players[1].userId,
          duelData.problem.problem_url,
          'active',
          new Date(duelData.startTime)
        ]
      );
    } catch (error) {
      this.logger.error('Error saving duel to database:', error);
    }
  }

  /**
   * Update duel in database
   */
  async updateDuelInDatabase(duelData) {
    try {
      await this.db.query(
        `UPDATE cf_duels 
         SET status = $1, winner_id = $2, end_time = $3, end_reason = $4
         WHERE room_id = $5`,
        [
          'completed',
          duelData.winner,
          new Date(duelData.endTime),
          duelData.endReason,
          duelData.roomId
        ]
      );
    } catch (error) {
      this.logger.error('Error updating duel in database:', error);
    }
  }
}

module.exports = CFDuelHandler;
