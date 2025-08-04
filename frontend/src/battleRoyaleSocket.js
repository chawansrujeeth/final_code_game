// frontend/src/battleRoyaleSocket.js
import { io } from 'socket.io-client';

class BattleRoyaleSocket {
  constructor() {
    this.socket = null;
    this.sessionId = null;
    this.playerId = null;
    this.isConnected = false;
  }

  connect(serverUrl = process.env.REACT_APP_BATTLE_ROYALE_SERVER_URL || 'http://localhost:5003') {
    if (this.socket) {
      this.disconnect();
    }

    console.log('Connecting to Battle Royale server:', serverUrl);
    this.socket = io(serverUrl, {
      transports: ['websocket', 'polling']
    });

    this.socket.on('connect', () => {
      console.log('Connected to Battle Royale server:', this.socket.id);
      this.isConnected = true;
    });

    this.socket.on('disconnect', () => {
      console.log('Disconnected from Battle Royale server');
      this.isConnected = false;
    });

    this.socket.on('error', (error) => {
      console.error('Battle Royale socket error:', error);
    });

    return this.socket;
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

    this.socket.emit('join_battle_royale', {
      sessionId,
      playerId,
      playerName
    });
  }

  requestQuestion(difficulty, edgeId) {
    if (!this.socket || !this.sessionId || !this.playerId) {
      throw new Error('Socket not properly initialized');
    }

    return new Promise((resolve, reject) => {
      // Set up one-time listeners for the response
      const timeout = setTimeout(() => {
        this.socket.off('question_received');
        this.socket.off('error');
        reject(new Error('Question request timeout'));
      }, 10000);

      this.socket.once('question_received', (data) => {
        clearTimeout(timeout);
        this.socket.off('error');
        resolve(data);
      });

      this.socket.once('error', (error) => {
        clearTimeout(timeout);
        this.socket.off('question_received');
        reject(error);
      });

      // Send the request
      this.socket.emit('request_question', {
        sessionId: this.sessionId,
        playerId: this.playerId,
        difficulty,
        edgeId
      });
    });
  }

  submitAnswer(questionId, answer, targetNode) {
    if (!this.socket || !this.sessionId || !this.playerId) {
      throw new Error('Socket not properly initialized');
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.socket.off('answer_result');
        this.socket.off('error');
        reject(new Error('Answer submission timeout'));
      }, 10000);

      this.socket.once('answer_result', (data) => {
        clearTimeout(timeout);
        this.socket.off('error');
        resolve(data);
      });

      this.socket.once('error', (error) => {
        clearTimeout(timeout);
        this.socket.off('answer_result');
        reject(error);
      });

      this.socket.emit('submit_answer', {
        sessionId: this.sessionId,
        playerId: this.playerId,
        questionId,
        answer,
        targetNode
      });
    });
  }

  // Event listeners
  onGameStateUpdate(callback) {
    if (this.socket) {
      this.socket.on('game_state_update', callback);
    }
  }

  onGameOver(callback) {
    if (this.socket) {
      this.socket.on('game_over', callback);
    }
  }

  onPlayerEliminated(callback) {
    if (this.socket) {
      this.socket.on('player_eliminated', callback);
    }
  }

  // Remove event listeners
  off(event, callback) {
    if (this.socket) {
      this.socket.off(event, callback);
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
