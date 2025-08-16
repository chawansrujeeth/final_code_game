// frontend/src/battleRoyaleSocket.js
// Optimized for Render free tier with reconnection support

import { io } from 'socket.io-client';

class BattleRoyaleSocket {
  constructor() {
    this.socket = null;
    this.sessionId = null;
    this.playerId = null;
    this.playerName = null;
    this.isConnected = false;
    this.isReconnecting = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.eventHandlers = new Map();
    this.lastEmit = null; // Debug: track last emitted event
  }

  // Matchmaking queue helpers
  joinQueue(playerId, playerName) {
    if (!this.socket) {
      throw new Error('Socket not connected');
    }
    this.lastEmit = 'join_battle_royale_queue';
    this.socket.emit('join_battle_royale_queue', {
      playerId,
      playerName
    });
  }

  leaveQueue() {
    if (!this.socket) {
      return;
    }
    this.lastEmit = 'leave_battle_royale_queue';
    this.socket.emit('leave_battle_royale_queue');
  }

  connect(rawUrl = process.env.REACT_APP_BATTLE_ROYALE_SERVER_URL || 'http://localhost:5003') {
    // Ensure we use HTTPS/WSS when frontend is served over HTTPS to avoid mixed-content errors
    let serverUrl = rawUrl;
    if (typeof window !== 'undefined' && window.location.protocol === 'https:' && serverUrl.startsWith('http://')) {
      serverUrl = serverUrl.replace('http://', 'https://');
    }
    if (this.socket) {
      this.disconnect();
    }

    console.log('Connecting to Battle Royale server:', serverUrl);
    this.socket = io(serverUrl, {
      transports: ['websocket', 'polling'],
      // Optimize for Render free tier
      timeout: 20000,
      forceNew: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      maxReconnectionAttempts: this.maxReconnectAttempts
    });

    this.setupSocketEvents();
    return this.socket;
  }

  setupSocketEvents() {
    this.socket.on('connect', () => {
      console.log('✅ Connected to Battle Royale server:', this.socket.id);
      this.isConnected = true;
      this.isReconnecting = false;
      this.reconnectAttempts = 0;
      
      // Auto-rejoin session if we were in one
      if (this.sessionId && this.playerId && this.playerName) {
        console.log('🔄 Auto-rejoining session after reconnection...');
        this.joinSession(this.sessionId, this.playerId, this.playerName);
      }
      
      this.emit('connection_status', { connected: true, reconnected: this.isReconnecting });
    });

    this.socket.on('disconnect', (reason) => {
      console.log('❌ Disconnected from Battle Royale server:', reason);
      this.isConnected = false;
      
      // Handle different disconnect reasons
      if (reason === 'io server disconnect') {
        // Server initiated disconnect, don't auto-reconnect
        this.emit('connection_status', { connected: false, serverDisconnect: true });
      } else {
        // Client-side or network issue, will auto-reconnect
        this.emit('connection_status', { connected: false, willReconnect: true });
      }
    });

    this.socket.on('reconnect', (attemptNumber) => {
      console.log(`🔄 Reconnected after ${attemptNumber} attempts`);
      this.isReconnecting = true;
    });

    this.socket.on('reconnect_attempt', (attemptNumber) => {
      console.log(`🔄 Reconnection attempt ${attemptNumber}/${this.maxReconnectAttempts}`);
      this.reconnectAttempts = attemptNumber;
      this.emit('connection_status', { 
        connected: false, 
        reconnecting: true, 
        attempt: attemptNumber,
        maxAttempts: this.maxReconnectAttempts
      });
    });

    this.socket.on('reconnect_failed', () => {
      console.log('❌ Failed to reconnect after maximum attempts');
      this.emit('connection_status', { connected: false, reconnectFailed: true });
    });

    this.socket.on('error', (error) => {
      const msg = error && error.message ? error.message : error;
      console.error('Battle Royale socket error:', msg, '| after emit:', this.lastEmit);
      this.emit('socket_error', error);
    });

    // Handle new backend events
    this.socket.on('connection_success', (data) => {
      console.log('✅ Connection success:', data.message);
      this.emit('connection_success', data);
    });

    this.socket.on('player_disconnected', (data) => {
      console.log('👋 Player disconnected:', data.message);
      this.emit('player_disconnected', data);
    });

    this.socket.on('player_left', (data) => {
      console.log('🚪 Player left:', data.message);
      this.emit('player_left', data);
    });

    // Forward additional backend events to the internal event dispatcher so
    // UI components can subscribe via battleRoyaleSocket.onX helpers.
    const forwardEvents = [
      'zone_update',
      'lobby_state_update',
      'lobby_countdown',
      'lobby_countdown_cancelled',
      'lobby_countdown_tick',
      'game_started',
      'game_state_update',
      'queue_update',
      'match_found',
      'queue_joined',
      'queue_left',
      'queue_error'
    ];
    forwardEvents.forEach(evt => {
      this.socket.on(evt, (payload) => {
        console.log(`📡 ${evt}:`, payload);
        this.emit(evt, payload);
      });
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
    }
  }

  joinSession(sessionId, playerId, playerName) {
    if (!this.socket || !this.isConnected) {
      throw new Error('Socket not connected');
    }

    this.sessionId = sessionId;
    this.playerId = playerId;
    this.playerName = playerName;

    console.log(`🎮 Joining session ${sessionId} as ${playerName} (${playerId})`);
    this.lastEmit = 'join_battle_royale';
    this.socket.emit('join_battle_royale', {
      sessionId,
      playerId,
      playerName
    });
  }

  leaveGame() {
    if (!this.socket || !this.sessionId || !this.playerId) {
      return;
    }

    console.log(`🚪 Leaving game session ${this.sessionId}`);
    this.lastEmit = 'leave_game';
    this.socket.emit('leave_game', {
      sessionId: this.sessionId,
      playerId: this.playerId
    });

    // Clear session data
    this.sessionId = null;
    this.playerId = null;
    this.playerName = null;
  }

  // Deprecated - use server-authoritative events instead
  requestQuestion(difficulty, edgeId) {
    console.warn('requestQuestion is deprecated. Use attempt_move event instead.');
    return Promise.reject(new Error('Use server-authoritative attempt_move event'));
  }

  // Deprecated - use server-authoritative events instead
  submitAnswer(questionId, answer, targetNode) {
    console.warn('submitAnswer is deprecated. Use submit_move_answer event instead.');
    return Promise.reject(new Error('Use server-authoritative submit_move_answer event'));
  }

  // Lobby: select a spawn node in the pre-game lobby
  selectSpawnNode(nodeId) {
    if (!this.socket || !this.sessionId || !this.playerId) {
      throw new Error('Socket not properly initialized');
    }
    this.lastEmit = 'select_spawn_node';
    this.socket.emit('select_spawn_node', {
      sessionId: this.sessionId,
      playerId: this.playerId,
      nodeId
    });
  }

  // Enhanced event handling system
  on(event, callback) {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event).add(callback);
    
    if (this.socket) {
      this.socket.on(event, callback);
    }
  }

  off(event, callback) {
    if (this.eventHandlers.has(event)) {
      this.eventHandlers.get(event).delete(callback);
    }
    
    if (this.socket) {
      this.socket.off(event, callback);
    }
  }

  emit(event, data) {
    if (this.eventHandlers.has(event)) {
      this.eventHandlers.get(event).forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in event handler for ${event}:`, error);
        }
      });
    }
  }

  // Convenience methods for common events
  onGameStateUpdate(callback) {
    this.on('game_state_update', callback);
  }

  onGameStarted(callback) {
    this.on('game_started', callback);
  }

  onGameOver(callback) {
    this.on('game_over', callback);
  }

  onPlayerEliminated(callback) {
    this.on('player_eliminated', callback);
  }

  onConnectionStatus(callback) {
    this.on('connection_status', callback);
  }

  onConnectionSuccess(callback) {
    this.on('connection_success', callback);
  }

  onPlayerDisconnected(callback) {
    this.on('player_disconnected', callback);
  }

  onPlayerLeft(callback) {
    this.on('player_left', callback);
  }

  onLobbyStateUpdate(callback) {
    this.on('lobby_state_update', callback);
  }

  // Queue events
  onQueueUpdate(callback) {
    this.on('queue_update', callback);
  }

  onMatchFound(callback) {
    this.on('match_found', callback);
  }

  onQueueJoined(callback) {
    this.on('queue_joined', callback);
  }

  onQueueLeft(callback) {
    this.on('queue_left', callback);
  }

  onQueueError(callback) {
    this.on('queue_error', callback);
  }

  // Connection status helpers
  getConnectionStatus() {
    return {
      isConnected: this.isConnected,
      isReconnecting: this.isReconnecting,
      reconnectAttempts: this.reconnectAttempts,
      maxReconnectAttempts: this.maxReconnectAttempts,
      sessionId: this.sessionId,
      playerId: this.playerId,
      playerName: this.playerName
    };
  }

  // Force reconnection
  forceReconnect() {
    if (this.socket) {
      console.log('🔄 Forcing reconnection...');
      this.socket.disconnect();
      this.socket.connect();
    }
  }

  // Generate session ID
  static generateSessionId() {
    return 'BR_' + Math.random().toString(36).substr(2, 9).toUpperCase();
  }

  // Generate player ID
  static generatePlayerId() {
    return 'PLAYER_' + Math.random().toString(36).substr(2, 6).toUpperCase();
  }
}

// Export singleton instance
export const battleRoyaleSocket = new BattleRoyaleSocket();
export default BattleRoyaleSocket;
