/**
 * Game State Machine
 * Manages game phases and transitions with validation
 */

const { EventEmitter } = require('events');
const { createLogger } = require('../utils/logger');
const { GameError } = require('../utils/errors');

/**
 * Game States Enum
 */
const GameStates = {
  CREATED: 'CREATED',           // Session created, waiting for players
  MATCHMAKING: 'MATCHMAKING',   // Players joining from queue
  LOBBY: 'LOBBY',               // Pre-game lobby, selecting spawn points
  STARTING: 'STARTING',         // Transitioning from lobby to game
  IN_PROGRESS: 'IN_PROGRESS',   // Active gameplay
  PAUSED: 'PAUSED',            // Game paused (admin action or technical issue)
  ENDING: 'ENDING',            // Game ending, calculating results
  COMPLETED: 'COMPLETED',       // Game finished, results available
  CANCELLED: 'CANCELLED'        // Game cancelled before completion
};

/**
 * Valid State Transitions
 */
const StateTransitions = {
  [GameStates.CREATED]: [GameStates.MATCHMAKING, GameStates.LOBBY, GameStates.CANCELLED],
  [GameStates.MATCHMAKING]: [GameStates.LOBBY, GameStates.CANCELLED],
  [GameStates.LOBBY]: [GameStates.STARTING, GameStates.CANCELLED],
  [GameStates.STARTING]: [GameStates.IN_PROGRESS, GameStates.CANCELLED],
  [GameStates.IN_PROGRESS]: [GameStates.PAUSED, GameStates.ENDING, GameStates.CANCELLED],
  [GameStates.PAUSED]: [GameStates.IN_PROGRESS, GameStates.ENDING, GameStates.CANCELLED],
  [GameStates.ENDING]: [GameStates.COMPLETED],
  [GameStates.COMPLETED]: [], // Terminal state
  [GameStates.CANCELLED]: []  // Terminal state
};

/**
 * Game State Machine Class
 */
class GameStateMachine extends EventEmitter {
  constructor(sessionId, initialState = GameStates.CREATED) {
    super();
    this.sessionId = sessionId;
    this.currentState = initialState;
    this.previousState = null;
    this.stateHistory = [{
      state: initialState,
      timestamp: Date.now(),
      metadata: {}
    }];
    this.metadata = {};
    this.logger = createLogger(`GameStateMachine:${sessionId}`);
    
    // State-specific data
    this.stateData = {
      playerCount: 0,
      minPlayers: 4,
      maxPlayers: 8,
      startTime: null,
      endTime: null,
      winner: null,
      cancelReason: null
    };
  }

  /**
   * Get current state
   */
  getState() {
    return this.currentState;
  }

  /**
   * Check if a transition is valid
   */
  canTransition(toState) {
    const validTransitions = StateTransitions[this.currentState] || [];
    return validTransitions.includes(toState);
  }

  /**
   * Transition to a new state
   */
  transition(toState, metadata = {}) {
    // Validate transition
    if (!this.canTransition(toState)) {
      throw new GameError(
        `Invalid state transition from ${this.currentState} to ${toState}`,
        'INVALID_STATE_TRANSITION',
        { currentState: this.currentState, attemptedState: toState }
      );
    }

    // Store previous state
    this.previousState = this.currentState;
    
    // Perform transition
    this.currentState = toState;
    
    // Record in history
    this.stateHistory.push({
      state: toState,
      previousState: this.previousState,
      timestamp: Date.now(),
      metadata
    });
    
    // Update metadata
    this.metadata = { ...this.metadata, ...metadata };
    
    // Log transition
    this.logger.info(`State transition: ${this.previousState} -> ${toState}`, {
      sessionId: this.sessionId,
      metadata
    });
    
    // Emit events
    this.emit('stateChanged', {
      sessionId: this.sessionId,
      previousState: this.previousState,
      currentState: this.currentState,
      metadata
    });
    
    // Emit state-specific events
    this.emit(toState, {
      sessionId: this.sessionId,
      metadata
    });
    
    // Handle state-specific logic
    this.handleStateEntry(toState, metadata);
    
    return this.currentState;
  }

  /**
   * Handle state entry logic
   */
  handleStateEntry(state, metadata) {
    switch (state) {
      case GameStates.STARTING:
        this.stateData.startTime = Date.now();
        break;
        
      case GameStates.ENDING:
        this.stateData.endTime = Date.now();
        break;
        
      case GameStates.CANCELLED:
        this.stateData.cancelReason = metadata.reason || 'Unknown';
        this.stateData.endTime = Date.now();
        break;
        
      case GameStates.COMPLETED:
        if (metadata.winner) {
          this.stateData.winner = metadata.winner;
        }
        break;
    }
  }

  /**
   * Check if game can start
   */
  canStart() {
    return this.currentState === GameStates.LOBBY && 
           this.stateData.playerCount >= this.stateData.minPlayers;
  }

  /**
   * Check if game is active
   */
  isActive() {
    return [GameStates.IN_PROGRESS, GameStates.PAUSED].includes(this.currentState);
  }

  /**
   * Check if game is terminal
   */
  isTerminal() {
    return [GameStates.COMPLETED, GameStates.CANCELLED].includes(this.currentState);
  }

  /**
   * Update player count
   */
  updatePlayerCount(count) {
    this.stateData.playerCount = count;
    
    // Auto-transition to matchmaking if in created state and players join
    if (this.currentState === GameStates.CREATED && count > 0) {
      this.transition(GameStates.MATCHMAKING, { playerCount: count });
    }
    
    // Check if we can move to lobby
    if (this.currentState === GameStates.MATCHMAKING && 
        count >= this.stateData.minPlayers) {
      this.transition(GameStates.LOBBY, { playerCount: count });
    }
  }

  /**
   * Start the game
   */
  startGame(metadata = {}) {
    if (!this.canStart()) {
      throw new GameError(
        'Cannot start game in current state',
        'CANNOT_START_GAME',
        { 
          currentState: this.currentState,
          playerCount: this.stateData.playerCount,
          minPlayers: this.stateData.minPlayers
        }
      );
    }
    
    this.transition(GameStates.STARTING, metadata);
    
    // Automatically transition to IN_PROGRESS after initialization
    setTimeout(() => {
      if (this.currentState === GameStates.STARTING) {
        this.transition(GameStates.IN_PROGRESS, { 
          ...metadata,
          actualStartTime: Date.now() 
        });
      }
    }, 1000); // 1 second for initialization
  }

  /**
   * Pause the game
   */
  pauseGame(reason = 'Manual pause') {
    if (this.currentState !== GameStates.IN_PROGRESS) {
      throw new GameError(
        'Can only pause game that is in progress',
        'CANNOT_PAUSE',
        { currentState: this.currentState }
      );
    }
    
    this.transition(GameStates.PAUSED, { reason });
  }

  /**
   * Resume the game
   */
  resumeGame() {
    if (this.currentState !== GameStates.PAUSED) {
      throw new GameError(
        'Can only resume paused game',
        'CANNOT_RESUME',
        { currentState: this.currentState }
      );
    }
    
    this.transition(GameStates.IN_PROGRESS, { resumedAt: Date.now() });
  }

  /**
   * End the game
   */
  endGame(winner = null, metadata = {}) {
    if (!this.isActive()) {
      throw new GameError(
        'Can only end active game',
        'CANNOT_END',
        { currentState: this.currentState }
      );
    }
    
    this.transition(GameStates.ENDING, { winner, ...metadata });
    
    // Transition to completed after processing
    setTimeout(() => {
      if (this.currentState === GameStates.ENDING) {
        this.transition(GameStates.COMPLETED, { winner, ...metadata });
      }
    }, 500); // 500ms for end game processing
  }

  /**
   * Cancel the game
   */
  cancelGame(reason = 'Game cancelled') {
    if (this.isTerminal()) {
      throw new GameError(
        'Cannot cancel terminated game',
        'ALREADY_TERMINATED',
        { currentState: this.currentState }
      );
    }
    
    this.transition(GameStates.CANCELLED, { reason });
  }

  /**
   * Get state information
   */
  getStateInfo() {
    return {
      sessionId: this.sessionId,
      currentState: this.currentState,
      previousState: this.previousState,
      stateData: this.stateData,
      metadata: this.metadata,
      canStart: this.canStart(),
      isActive: this.isActive(),
      isTerminal: this.isTerminal(),
      history: this.stateHistory,
      duration: this.stateData.startTime 
        ? (this.stateData.endTime || Date.now()) - this.stateData.startTime
        : null
    };
  }

  /**
   * Get valid transitions from current state
   */
  getValidTransitions() {
    return StateTransitions[this.currentState] || [];
  }

  /**
   * Reset state machine (for testing)
   */
  reset() {
    this.currentState = GameStates.CREATED;
    this.previousState = null;
    this.stateHistory = [{
      state: GameStates.CREATED,
      timestamp: Date.now(),
      metadata: {}
    }];
    this.metadata = {};
    this.stateData = {
      playerCount: 0,
      minPlayers: 4,
      maxPlayers: 8,
      startTime: null,
      endTime: null,
      winner: null,
      cancelReason: null
    };
    
    this.emit('reset', { sessionId: this.sessionId });
  }
}

module.exports = {
  GameStateMachine,
  GameStates,
  StateTransitions
};
