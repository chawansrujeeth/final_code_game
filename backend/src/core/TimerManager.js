/**
 * Centralized Timer Management System
 * Handles all game timers with proper cleanup and conflict prevention
 */

const { createLogger } = require('../utils/logger');

class TimerManager {
  constructor() {
    this.timers = new Map(); // sessionId -> { timerId -> { type, timer, metadata } }
    this.logger = createLogger('TimerManager');
  }

  /**
   * Timer types enum
   */
  static TIMER_TYPES = {
    LOBBY_COUNTDOWN: 'LOBBY_COUNTDOWN',
    AUTO_START: 'AUTO_START',
    GAME_DURATION: 'GAME_DURATION',
    ZONE_PROGRESSION: 'ZONE_PROGRESSION',
    DISCONNECT_TIMEOUT: 'DISCONNECT_TIMEOUT',
    SESSION_CLEANUP: 'SESSION_CLEANUP',
    HEARTBEAT: 'HEARTBEAT'
  };

  /**
   * Initialize timers for a session
   */
  initSession(sessionId) {
    if (!this.timers.has(sessionId)) {
      this.timers.set(sessionId, new Map());
      this.logger.debug(`Initialized timer storage for session ${sessionId}`);
    }
  }

  /**
   * Set a timeout timer
   */
  setTimeout(sessionId, timerId, callback, delay, metadata = {}) {
    this.initSession(sessionId);
    
    // Clear existing timer if present
    this.clearTimer(sessionId, timerId);
    
    const timer = setTimeout(() => {
      this.logger.debug(`Timer ${timerId} fired for session ${sessionId}`, metadata);
      this.clearTimer(sessionId, timerId);
      callback();
    }, delay);
    
    const sessionTimers = this.timers.get(sessionId);
    sessionTimers.set(timerId, {
      type: 'timeout',
      timer,
      startTime: Date.now(),
      delay,
      metadata
    });
    
    this.logger.debug(`Set timeout ${timerId} for session ${sessionId}`, {
      delay,
      ...metadata
    });
    
    return timer;
  }

  /**
   * Set an interval timer
   */
  setInterval(sessionId, timerId, callback, interval, metadata = {}) {
    this.initSession(sessionId);
    
    // Clear existing timer if present
    this.clearTimer(sessionId, timerId);
    
    const timer = setInterval(() => {
      this.logger.debug(`Interval ${timerId} ticked for session ${sessionId}`, metadata);
      callback();
    }, interval);
    
    const sessionTimers = this.timers.get(sessionId);
    sessionTimers.set(timerId, {
      type: 'interval',
      timer,
      startTime: Date.now(),
      interval,
      metadata
    });
    
    this.logger.debug(`Set interval ${timerId} for session ${sessionId}`, {
      interval,
      ...metadata
    });
    
    return timer;
  }

  /**
   * Clear a specific timer
   */
  clearTimer(sessionId, timerId) {
    const sessionTimers = this.timers.get(sessionId);
    if (!sessionTimers) return false;
    
    const timerData = sessionTimers.get(timerId);
    if (!timerData) return false;
    
    if (timerData.type === 'timeout') {
      clearTimeout(timerData.timer);
    } else if (timerData.type === 'interval') {
      clearInterval(timerData.timer);
    }
    
    sessionTimers.delete(timerId);
    this.logger.debug(`Cleared timer ${timerId} for session ${sessionId}`);
    
    return true;
  }

  /**
   * Clear all timers for a session
   */
  clearSession(sessionId) {
    const sessionTimers = this.timers.get(sessionId);
    if (!sessionTimers) return;
    
    let clearedCount = 0;
    sessionTimers.forEach((timerData, timerId) => {
      if (timerData.type === 'timeout') {
        clearTimeout(timerData.timer);
      } else if (timerData.type === 'interval') {
        clearInterval(timerData.timer);
      }
      clearedCount++;
    });
    
    this.timers.delete(sessionId);
    this.logger.info(`Cleared ${clearedCount} timers for session ${sessionId}`);
  }

  /**
   * Check if a timer exists
   */
  hasTimer(sessionId, timerId) {
    const sessionTimers = this.timers.get(sessionId);
    return sessionTimers ? sessionTimers.has(timerId) : false;
  }

  /**
   * Get timer info
   */
  getTimerInfo(sessionId, timerId) {
    const sessionTimers = this.timers.get(sessionId);
    if (!sessionTimers) return null;
    
    const timerData = sessionTimers.get(timerId);
    if (!timerData) return null;
    
    const elapsed = Date.now() - timerData.startTime;
    const remaining = timerData.type === 'timeout' 
      ? Math.max(0, timerData.delay - elapsed)
      : null;
    
    return {
      timerId,
      type: timerData.type,
      startTime: timerData.startTime,
      elapsed,
      remaining,
      metadata: timerData.metadata
    };
  }

  /**
   * Get all timers for a session
   */
  getSessionTimers(sessionId) {
    const sessionTimers = this.timers.get(sessionId);
    if (!sessionTimers) return [];
    
    const timers = [];
    sessionTimers.forEach((timerData, timerId) => {
      timers.push(this.getTimerInfo(sessionId, timerId));
    });
    
    return timers;
  }

  /**
   * Get statistics
   */
  getStats() {
    let totalTimers = 0;
    let timeoutCount = 0;
    let intervalCount = 0;
    
    this.timers.forEach(sessionTimers => {
      sessionTimers.forEach(timerData => {
        totalTimers++;
        if (timerData.type === 'timeout') timeoutCount++;
        else if (timerData.type === 'interval') intervalCount++;
      });
    });
    
    return {
      sessions: this.timers.size,
      totalTimers,
      timeoutCount,
      intervalCount
    };
  }

  /**
   * Clean up inactive sessions
   */
  cleanup(inactiveThresholdMs = 1800000) { // 30 minutes default
    const now = Date.now();
    const sessionsToRemove = [];
    
    this.timers.forEach((sessionTimers, sessionId) => {
      let latestActivity = 0;
      
      sessionTimers.forEach(timerData => {
        latestActivity = Math.max(latestActivity, timerData.startTime);
      });
      
      if (now - latestActivity > inactiveThresholdMs) {
        sessionsToRemove.push(sessionId);
      }
    });
    
    sessionsToRemove.forEach(sessionId => {
      this.clearSession(sessionId);
    });
    
    if (sessionsToRemove.length > 0) {
      this.logger.info(`Cleaned up ${sessionsToRemove.length} inactive timer sessions`);
    }
    
    return sessionsToRemove.length;
  }

  /**
   * Specialized timer methods for game mechanics
   */
  
  // Lobby countdown timer
  setLobbyCountdown(sessionId, duration, onComplete, onTick) {
    const endTime = Date.now() + duration;
    
    // Set tick interval if provided
    if (onTick) {
      this.setInterval(sessionId, 'LOBBY_TICK', () => {
        const remaining = Math.max(0, endTime - Date.now());
        onTick(remaining);
        
        if (remaining <= 0) {
          this.clearTimer(sessionId, 'LOBBY_TICK');
        }
      }, 1000);
    }
    
    // Set completion timeout
    return this.setTimeout(sessionId, TimerManager.TIMER_TYPES.LOBBY_COUNTDOWN, () => {
      this.clearTimer(sessionId, 'LOBBY_TICK');
      onComplete();
    }, duration, { type: 'lobby_countdown' });
  }

  // Game duration timer
  setGameTimer(sessionId, duration, onComplete, onTick) {
    const endTime = Date.now() + duration;
    
    // Set tick interval for time updates
    if (onTick) {
      this.setInterval(sessionId, 'GAME_TICK', () => {
        const remaining = Math.max(0, endTime - Date.now());
        onTick(remaining);
        
        if (remaining <= 0) {
          this.clearTimer(sessionId, 'GAME_TICK');
        }
      }, 1000);
    }
    
    // Set game end timeout
    return this.setTimeout(sessionId, TimerManager.TIMER_TYPES.GAME_DURATION, () => {
      this.clearTimer(sessionId, 'GAME_TICK');
      onComplete();
    }, duration, { type: 'game_duration' });
  }

  // Zone progression timer
  setZoneTimer(sessionId, interval, onTick) {
    return this.setInterval(
      sessionId, 
      TimerManager.TIMER_TYPES.ZONE_PROGRESSION,
      onTick,
      interval,
      { type: 'zone_progression' }
    );
  }

  // Disconnect timeout
  setDisconnectTimeout(sessionId, playerId, duration, onTimeout) {
    const timerId = `${TimerManager.TIMER_TYPES.DISCONNECT_TIMEOUT}_${playerId}`;
    return this.setTimeout(
      sessionId,
      timerId,
      onTimeout,
      duration,
      { type: 'disconnect_timeout', playerId }
    );
  }

  // Clear disconnect timeout
  clearDisconnectTimeout(sessionId, playerId) {
    const timerId = `${TimerManager.TIMER_TYPES.DISCONNECT_TIMEOUT}_${playerId}`;
    return this.clearTimer(sessionId, timerId);
  }
}

// Export singleton instance
module.exports = new TimerManager();
