// backend/sockets/BaseSocketHandler.js
// Base class for all socket handlers providing common functionality

const EventEmitter = require('events');

class BaseSocketHandler extends EventEmitter {
  constructor(io, config, logger) {
    super();
    this.io = io;
    this.config = config;
    this.logger = logger;
    this.namespace = null;
    this.sessions = new Map(); // sessionId -> session data
    this.clients = new Map(); // socketId -> client data
  }

  /**
   * Initialize the handler and set up namespace
   * @param {string} namespacePath - The namespace path for this handler
   */
  initialize(namespacePath) {
    this.namespace = this.io.of(namespacePath);
    this.setupMiddleware();
    this.setupEventHandlers();
    this.logger.info(`Socket handler initialized for namespace: ${namespacePath}`);
  }

  /**
   * Set up middleware for the namespace
   * Override in child classes to add specific middleware
   */
  setupMiddleware() {
    // Authentication middleware
    this.namespace.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth?.token;
        const user = await this.authenticateUser(token);
        if (!user) {
          return next(new Error('Authentication failed'));
        }
        socket.user = user;
        next();
      } catch (error) {
        this.logger.error('Socket authentication error:', error);
        next(new Error('Authentication error'));
      }
    });

    // Logging middleware
    this.namespace.use((socket, next) => {
      this.logger.debug(`Socket connection attempt from ${socket.handshake.address}`);
      next();
    });
  }

  /**
   * Set up event handlers for the namespace
   * Must be implemented by child classes
   */
  setupEventHandlers() {
    this.namespace.on('connection', (socket) => {
      this.handleConnection(socket);

      // Set up common event handlers
      socket.on('disconnect', (reason) => this.handleDisconnect(socket, reason));
      socket.on('error', (error) => this.handleError(socket, error));
      socket.on('ping', () => this.handlePing(socket));

      // Set up specific handlers
      this.registerSocketEvents(socket);
    });
  }

  /**
   * Handle new socket connection
   * @param {Socket} socket - The connected socket
   */
  handleConnection(socket) {
    const clientInfo = {
      socketId: socket.id,
      userId: socket.user?.id,
      username: socket.user?.username,
      connectedAt: new Date(),
      lastActivity: new Date()
    };

    this.clients.set(socket.id, clientInfo);
    this.logger.info(`Client connected: ${socket.id} (User: ${clientInfo.username})`);
    
    // Emit connection success
    socket.emit('connected', {
      socketId: socket.id,
      serverTime: new Date().toISOString()
    });
  }

  /**
   * Handle socket disconnection
   * @param {Socket} socket - The disconnected socket
   * @param {string} reason - Disconnection reason
   */
  handleDisconnect(socket, reason) {
    const client = this.clients.get(socket.id);
    if (client) {
      this.logger.info(`Client disconnected: ${socket.id} (User: ${client.username}, Reason: ${reason})`);
      this.clients.delete(socket.id);
    }
    
    // Clean up any session data
    this.cleanupClientSessions(socket.id);
  }

  /**
   * Handle socket errors
   * @param {Socket} socket - The socket that encountered an error
   * @param {Error} error - The error object
   */
  handleError(socket, error) {
    this.logger.error(`Socket error for ${socket.id}:`, error);
    socket.emit('error', {
      message: 'An error occurred',
      code: error.code || 'UNKNOWN_ERROR'
    });
  }

  /**
   * Handle ping events for keep-alive
   * @param {Socket} socket - The socket sending the ping
   */
  handlePing(socket) {
    const client = this.clients.get(socket.id);
    if (client) {
      client.lastActivity = new Date();
    }
    socket.emit('pong', { serverTime: new Date().toISOString() });
  }

  /**
   * Authenticate user from token
   * @param {string} token - Authentication token
   * @returns {Promise<Object|null>} User object or null if authentication fails
   */
  async authenticateUser(token) {
    // Override in child classes with actual authentication logic
    if (!token) return null;
    
    // Mock authentication for now
    return {
      id: token,
      username: `user_${token}`
    };
  }

  /**
   * Register socket event handlers specific to the handler
   * Must be implemented by child classes
   * @param {Socket} socket - The socket to register events on
   */
  registerSocketEvents(socket) {
    throw new Error('registerSocketEvents must be implemented by child class');
  }

  /**
   * Clean up client sessions when disconnecting
   * @param {string} socketId - The socket ID to clean up
   */
  cleanupClientSessions(socketId) {
    // Override in child classes to clean up specific session data
  }

  /**
   * Broadcast to all clients in a session/room
   * @param {string} room - Room name
   * @param {string} event - Event name
   * @param {*} data - Data to send
   * @param {string} excludeSocketId - Socket ID to exclude from broadcast
   */
  broadcastToRoom(room, event, data, excludeSocketId = null) {
    if (excludeSocketId) {
      this.namespace.to(room).except(excludeSocketId).emit(event, data);
    } else {
      this.namespace.to(room).emit(event, data);
    }
  }

  /**
   * Send to specific socket
   * @param {string} socketId - Target socket ID
   * @param {string} event - Event name
   * @param {*} data - Data to send
   */
  sendToSocket(socketId, event, data) {
    const socket = this.namespace.sockets.get(socketId);
    if (socket) {
      socket.emit(event, data);
    }
  }

  /**
   * Get all clients in a room
   * @param {string} room - Room name
   * @returns {Promise<Set<string>>} Set of socket IDs in the room
   */
  async getClientsInRoom(room) {
    return await this.namespace.in(room).allSockets();
  }

  /**
   * Validate session exists and is active
   * @param {string} sessionId - Session ID to validate
   * @returns {boolean} True if session is valid
   */
  isSessionValid(sessionId) {
    return this.sessions.has(sessionId);
  }

  /**
   * Get session data
   * @param {string} sessionId - Session ID
   * @returns {*} Session data or undefined
   */
  getSession(sessionId) {
    return this.sessions.get(sessionId);
  }

  /**
   * Update session data
   * @param {string} sessionId - Session ID
   * @param {*} data - Data to update
   */
  updateSession(sessionId, data) {
    const session = this.sessions.get(sessionId);
    if (session) {
      this.sessions.set(sessionId, { ...session, ...data, lastUpdated: new Date() });
    }
  }

  /**
   * Clean up inactive sessions
   * @param {number} maxInactiveMs - Maximum inactive time in milliseconds
   */
  cleanupInactiveSessions(maxInactiveMs = 3600000) { // 1 hour default
    const now = Date.now();
    for (const [sessionId, session] of this.sessions.entries()) {
      const lastActivity = session.lastUpdated || session.createdAt;
      if (now - lastActivity.getTime() > maxInactiveMs) {
        this.logger.info(`Cleaning up inactive session: ${sessionId}`);
        this.sessions.delete(sessionId);
      }
    }
  }

  /**
   * Get handler statistics
   * @returns {Object} Statistics object
   */
  getStats() {
    return {
      activeSessions: this.sessions.size,
      connectedClients: this.clients.size,
      namespace: this.namespace?.name
    };
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    this.logger.info(`Shutting down socket handler for namespace: ${this.namespace?.name}`);
    
    // Notify all clients
    this.namespace.emit('server-shutdown', {
      message: 'Server is shutting down for maintenance',
      timestamp: new Date().toISOString()
    });

    // Disconnect all sockets
    const sockets = await this.namespace.fetchSockets();
    for (const socket of sockets) {
      socket.disconnect(true);
    }

    // Clear data
    this.sessions.clear();
    this.clients.clear();
  }
}

module.exports = BaseSocketHandler;
