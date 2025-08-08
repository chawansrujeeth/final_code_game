// backend/battle_royale_server.js
// Optimized for Render free tier with Supabase session persistence

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const { supabase } = require('./supabaseClient');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*", // Allow all origins - replace with your Vercel frontend URL for production
    methods: ["GET", "POST"]
  },
  // Optimize for Render free tier
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ['websocket', 'polling']
});

app.use(cors());
app.use(express.json());

// In-memory cache for active sessions (cleared on Render sleep)
const sessionCache = new Map();

// Simple in-memory matchmaking queue for Battle Royale
const BR_QUEUE_ROOM = 'BR_QUEUE';
const REQUIRED_PLAYERS = 4;
let battleRoyaleQueue = []; // [{ socketId, playerId, playerName }]

function emitQueueUpdate(ioInstance) {
  try {
    ioInstance.to(BR_QUEUE_ROOM).emit('queue_update', {
      mode: 'battle_royale',
      size: battleRoyaleQueue.length,
      required: REQUIRED_PLAYERS
    });
  } catch (e) {
    console.error('emitQueueUpdate error:', e);
  }
}

// Close emitQueueUpdate function here

// Auto-start timer management per session
const autoStartTimers = new Map(); // sessionId -> timeoutId

function scheduleAutoStartIfReady(sessionId, session, delayMs = 10000) {
  try {
    if (session.gameState.isGameActive || session.gameState.gameOver) return;
    const connectedPlayers = Array.from(session.players.values()).filter(p => !!p.socketId);
    if (connectedPlayers.length < REQUIRED_PLAYERS) return;
    if (autoStartTimers.has(sessionId)) return; // already scheduled

    const timeoutId = setTimeout(async () => {
      autoStartTimers.delete(sessionId);
      try {
        // Re-check conditions just before starting
        const refreshed = await getOrCreateSession(sessionId);
        const connected = Array.from(refreshed.players.values()).filter(p => !!p.socketId);
        if (connected.length < REQUIRED_PLAYERS || refreshed.gameState.isGameActive || refreshed.gameState.gameOver) return;
        await startGameFromLobby(sessionId, refreshed);
      } catch (e) {
        console.error('autoStart timer error:', e);
      }
    }, delayMs);
    autoStartTimers.set(sessionId, timeoutId);
    io.to(sessionId).emit('lobby_countdown', { seconds: Math.round(delayMs/1000), reason: 'enough_players' });
    console.log(`⏳ Scheduled auto-start for session ${sessionId} in ${delayMs}ms`);
  } catch (e) {
    console.error('scheduleAutoStartIfReady error:', e);
  }
}

function cancelAutoStartIfScheduled(sessionId) {
  const existing = autoStartTimers.get(sessionId);
  if (existing) {
    clearTimeout(existing);
    autoStartTimers.delete(sessionId);
    io.to(sessionId).emit('lobby_countdown_cancelled');
    console.log(`🛑 Cancelled auto-start for session ${sessionId}`);
  }
}

async function startGameFromLobby(sessionId, session) {
  try {
    if (session.gameState.isGameActive || session.gameState.gameOver) return;
    const connectedPlayers = Array.from(session.players.values()).filter(p => !!p.socketId);
    if (connectedPlayers.length < REQUIRED_PLAYERS) return;

    const allowedSpawnNodes = ['R3_1', 'R3_2', 'R3_3', 'R3_4', 'R3_5', 'R3_6', 'R3_7', 'R3_8'];
    const ordered = connectedPlayers
      .slice()
      .sort((a, b) => String(a.playerId).localeCompare(String(b.playerId)));

    const taken = new Set();
    ordered.forEach((p) => {
      if (p.selectedSpawnNode && allowedSpawnNodes.includes(p.selectedSpawnNode) && !taken.has(p.selectedSpawnNode)) {
        taken.add(p.selectedSpawnNode);
      }
    });

    let fillIndex = 0;
    // Build a pool of *unused* nodes and shuffle once per game start for uniqueness
    let remainingNodes = allowedSpawnNodes.filter(n => !taken.has(n));
    remainingNodes.sort(() => Math.random() - 0.5);
    let remainIdx = 0;
    const nextAvailable = () => {
      if (remainIdx >= remainingNodes.length) {
        // Fallback – reuse any node not yet taken (should rarely happen)
        remainingNodes = allowedSpawnNodes.filter(n => !taken.has(n));
        remainingNodes.sort(() => Math.random() - 0.5);
        remainIdx = 0;
      }
      const node = remainingNodes[remainIdx++];
      taken.add(node);
      return node;
    };

    ordered.forEach((p) => {
      const node = (p.selectedSpawnNode && allowedSpawnNodes.includes(p.selectedSpawnNode) && !taken.has(p.selectedSpawnNode))
        ? p.selectedSpawnNode
        : nextAvailable();
      taken.add(node);
      session.updatePlayer(p.playerId, {
        currentNode: node,
        currentZone: getZoneFromNode(node)
      });
    });

    session.gameState.isGameActive = true;
    session.gameState.currentRound = 1;
    session.gameState.playersAlive = connectedPlayers.length;

    await session.saveSession();

    io.to(sessionId).emit('game_started', {
      sessionId,
      players: session.getAllPlayers(),
      gameState: session.gameState
    });

    io.to(sessionId).emit('game_state_update', {
      players: session.getAllPlayers(),
      gameState: session.gameState,
      sessionId,
      usedQuestionsCount: session.usedQuestions.size
    });

    console.log(`✅ [AUTO-START] Session ${sessionId} started (>=${REQUIRED_PLAYERS} connected players).`);
  } catch (e) {
    console.error('startGameFromLobby error:', e);
  }
}

function tryFormMatch(ioInstance) {
  try {
    while (battleRoyaleQueue.length >= REQUIRED_PLAYERS) {
      const group = battleRoyaleQueue.splice(0, REQUIRED_PLAYERS);
      const sessionId = generateSessionId();

      const playersPayload = group.map(p => ({ playerId: p.playerId, playerName: p.playerName }));

      // Notify matched players and remove them from queue room
      group.forEach(p => {
        const sock = ioInstance.sockets.sockets.get(p.socketId);
        if (sock) {
          try { sock.leave(BR_QUEUE_ROOM); } catch {}
          sock.emit('match_found', {
            sessionId,
            mode: 'battle_royale',
            players: playersPayload,
            required: REQUIRED_PLAYERS
          });
        }
      });

      // After forming a match, continue to see if more groups can be formed
    }

    emitQueueUpdate(ioInstance);
  } catch (e) {
    console.error('tryFormMatch error:', e);
  }
}

// Persistent Session Management with Supabase
class PersistentGameSession {
  constructor(sessionId) {
    this.sessionId = sessionId;
    this.players = new Map();
    this.usedQuestions = new Set();
    this.gameState = {
      isGameActive: false,
      playersAlive: 0,
      currentRound: 1,
      winner: null,
      gameOver: false
    };
    this.lastSaved = new Date();
  }

  // Load session from Supabase
  static async loadSession(sessionId) {
    try {
      const { data, error } = await supabase
        .from('battle_royale_sessions')
        .select('*')
        .eq('session_id', sessionId)
        .eq('is_active', true)
        .single();

      if (error || !data) {
        console.log(`Creating new session: ${sessionId}`);
        return new PersistentGameSession(sessionId);
      }

      console.log(`Loading existing session: ${sessionId}`);
      const session = new PersistentGameSession(sessionId);
      
      // Restore players
      if (data.players && Array.isArray(data.players)) {
        data.players.forEach(player => {
          session.players.set(player.playerId, {
            ...player,
            socketId: null, // Will be updated when player reconnects
            lastSeen: new Date(player.lastSeen || Date.now())
          });
        });
      }

      // Restore used questions
      if (data.used_questions && Array.isArray(data.used_questions)) {
        data.used_questions.forEach(qId => session.usedQuestions.add(qId));
      }

      // Restore game state
      if (data.game_state) {
        session.gameState = { ...session.gameState, ...data.game_state };
      }

      return session;
    } catch (error) {
      console.error('Error loading session:', error);
      return new PersistentGameSession(sessionId);
    }
  }

  // Save session to Supabase
  async saveSession() {
    try {
      const playersArray = Array.from(this.players.values()).map(player => ({
        ...player,
        lastSeen: new Date().toISOString()
      }));

      const usedQuestionsArray = Array.from(this.usedQuestions);

      const { error } = await supabase
        .from('battle_royale_sessions')
        .upsert({
          session_id: this.sessionId,
          players: playersArray,
          used_questions: usedQuestionsArray,
          game_state: this.gameState,
          current_turn: this.gameState.currentTurn,
          winner: this.gameState.winner,
          game_over: this.gameState.gameOver,
          is_active: this.gameState.isGameActive,
          updated_at: new Date().toISOString()
        });

      if (error) {
        console.error('Error saving session:', error);
      } else {
        this.lastSaved = new Date();
        console.log(`Session ${this.sessionId} saved to database`);
      }
    } catch (error) {
      console.error('Error saving session:', error);
    }
  }

  addPlayer(playerId, playerData) {
    const palette = ['#ff3b30', '#007aff', '#34c759', '#ffcc00', '#af52de', '#ff9f0a', '#32ade6', '#ff453a'];
    const assignedColor = playerData.color || palette[this.players.size % palette.length];

    const player = {
      ...playerData,
      color: assignedColor,
      // Default to no position until game starts (avoids legacy PLAYER_* nodes)
      currentNode: playerData.currentNode || null,
      currentZone: playerData.currentZone || 'lobby',
      health: playerData.health || 100,
      questionsAnswered: playerData.questionsAnswered || 0,
      isAlive: true,
      selectedSpawnNode: playerData.selectedSpawnNode || null,
      joinedAt: new Date().toISOString(),
      lastSeen: new Date().toISOString()
    };
    
    this.players.set(playerId, player);
    this.gameState.playersAlive = this.players.size;
    this.saveSession(); // Auto-save on player changes
  }

  removePlayer(playerId) {
    this.players.delete(playerId);
    this.gameState.playersAlive = this.players.size;
    this.saveSession(); // Auto-save on player changes
  }

  updatePlayer(playerId, updates) {
    const player = this.players.get(playerId);
    if (player) {
      Object.assign(player, updates, { lastSeen: new Date().toISOString() });
      this.players.set(playerId, player);
      
      // Check if player died
      if (updates.health !== undefined && updates.health <= 0) {
        player.isAlive = false;
        this.gameState.playersAlive = Array.from(this.players.values())
          .filter(p => p.isAlive).length;
      }
      
      this.saveSession(); // Auto-save on player updates
    }
  }

  markQuestionUsed(questionId) {
    this.usedQuestions.add(questionId);
    // Save periodically, not on every question
    if (this.usedQuestions.size % 5 === 0) {
      this.saveSession();
    }
  }

  getPlayerData(playerId) {
    return this.players.get(playerId);
  }

  getAllPlayers() {
    return Array.from(this.players.values());
  }

  // Update socket ID for reconnections
  updatePlayerSocket(playerId, socketId) {
    const player = this.players.get(playerId);
    if (player) {
      player.socketId = socketId;
      player.lastSeen = new Date().toISOString();
      this.players.set(playerId, player);
    }
  }

  // Clean up inactive players (haven't been seen for 10 minutes)
  cleanupInactivePlayers() {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    let hasChanges = false;
    
    for (const [playerId, player] of this.players.entries()) {
      const lastSeen = new Date(player.lastSeen);
      if (lastSeen < tenMinutesAgo) {
        console.log(`Removing inactive player: ${playerId}`);
        this.players.delete(playerId);
        hasChanges = true;
      }
    }
    
    if (hasChanges) {
      this.gameState.playersAlive = Array.from(this.players.values())
        .filter(p => p.isAlive).length;
      this.saveSession();
    }
  }
}

// Fetch random question from Supabase based on difficulty
async function getRandomQuestion(difficulty, excludeIds = []) {
  try {
    let query = supabase
      .from('battle_royale_questions')
      .select('*')
      .eq('difficulty', difficulty);

    // Exclude already used questions
    if (excludeIds.length > 0) {
      query = query.not('que_id', 'in', `(${excludeIds.join(',')})`);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching questions:', error);
      return null;
    }

    if (!data || data.length === 0) {
      console.log(`No available ${difficulty} questions found`);
      return null;
    }

    // Return random question from available ones
    const randomIndex = Math.floor(Math.random() * data.length);
    return data[randomIndex];
  } catch (error) {
    console.error('Database error:', error);
    return null;
  }
}

// Helper function to get or create session
async function getOrCreateSession(sessionId) {
  // Check cache first
  if (sessionCache.has(sessionId)) {
    return sessionCache.get(sessionId);
  }
  
  // Load from database
  const session = await PersistentGameSession.loadSession(sessionId);
  sessionCache.set(sessionId, session);
  return session;
}

// Attempt to auto-start the game when at least 4 connected players have selected spawn nodes
async function maybeAutoStartBySelections(sessionId, session) {
  try {
    const connectedPlayers = Array.from(session.players.values()).filter(p => !!p.socketId);
    const selectedConnected = connectedPlayers.filter(p => !!p.selectedSpawnNode);
    const canStart = selectedConnected.length >= 1 && !session.gameState.isGameActive && !session.gameState.gameOver;
    if (!canStart) return;

    // Allowed selectable spawn nodes in Ring 3
    const allowedSpawnNodes = ['R3_1', 'R3_2', 'R3_3', 'R3_4', 'R3_5', 'R3_6', 'R3_7', 'R3_8'];

    // Deterministic order so all clients see the same assignment
    const ordered = connectedPlayers
      .slice()
      .sort((a, b) => String(a.playerId).localeCompare(String(b.playerId)));

    const taken = new Set();
    // Reserve explicitly selected nodes
    ordered.forEach((p) => {
      if (p.selectedSpawnNode && allowedSpawnNodes.includes(p.selectedSpawnNode) && !taken.has(p.selectedSpawnNode)) {
        taken.add(p.selectedSpawnNode);
      }
    });

    // Assign nodes: use selection if present, otherwise fill remaining deterministically
    let fillIndex = 0;
    // Build a pool of unused nodes and shuffle once for fairness
    let remainingNodes = allowedSpawnNodes.filter(n => !taken.has(n));
    remainingNodes.sort(() => Math.random() - 0.5);
    let remainIdx = 0;
    const nextAvailable = () => {
      if (remainIdx >= remainingNodes.length) {
        remainingNodes = allowedSpawnNodes.filter(n => !taken.has(n));
        remainingNodes.sort(() => Math.random() - 0.5);
        remainIdx = 0;
      }
      const node = remainingNodes[remainIdx++];
      taken.add(node);
      return node;
    };

    ordered.forEach((p) => {
      const node = (p.selectedSpawnNode && allowedSpawnNodes.includes(p.selectedSpawnNode) && !taken.has(p.selectedSpawnNode))
        ? p.selectedSpawnNode
        : nextAvailable();
      taken.add(node);
      session.updatePlayer(p.playerId, {
        currentNode: node,
        currentZone: getZoneFromNode(node)
      });
    });

    session.gameState.isGameActive = true;
    session.gameState.currentRound = 1;
    session.gameState.playersAlive = connectedPlayers.length;

    await session.saveSession();

    // Notify clients
    io.to(sessionId).emit('game_started', {
      sessionId,
      players: session.getAllPlayers(),
      gameState: session.gameState
    });

    const gameStateUpdate = {
      players: session.getAllPlayers(),
      gameState: session.gameState,
      sessionId,
      usedQuestionsCount: session.usedQuestions.size
    };
    io.to(sessionId).emit('game_state_update', gameStateUpdate);

    console.log(`✅ [AUTO-START] Session ${sessionId} started (>=4 spawn selections).`);
  } catch (err) {
    console.error('Error in maybeAutoStart:', err);
  }
}

// Socket.IO connection handling with Render optimizations
io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);
  
  // Handle connection errors
  socket.on('error', (error) => {
    console.error('Socket error:', error);
  });

  // Matchmaking: join BR queue
  socket.on('join_battle_royale_queue', (data = {}) => {
    try {
      const playerId = data.playerId;
      const playerName = data.playerName || (playerId ? `Player ${playerId}` : 'Player');

      if (!playerId) {
        socket.emit('queue_error', { message: 'Missing playerId' });
        return;
      }

      // Prevent duplicates by socketId
      const already = battleRoyaleQueue.find(entry => entry.socketId === socket.id);
      if (already) {
        socket.emit('queue_joined', { alreadyInQueue: true, position: battleRoyaleQueue.indexOf(already) + 1, required: REQUIRED_PLAYERS });
        socket.join(BR_QUEUE_ROOM);
        emitQueueUpdate(io);
        return;
      }

      battleRoyaleQueue.push({ socketId: socket.id, playerId, playerName });
      socket.join(BR_QUEUE_ROOM);
      socket.emit('queue_joined', { position: battleRoyaleQueue.length, required: REQUIRED_PLAYERS });
      emitQueueUpdate(io);
      tryFormMatch(io);
    } catch (e) {
      console.error('join_battle_royale_queue error:', e);
      socket.emit('queue_error', { message: 'Failed to join queue' });
    }
  });

  // Matchmaking: leave BR queue
  socket.on('leave_battle_royale_queue', () => {
    try {
      const before = battleRoyaleQueue.length;
      battleRoyaleQueue = battleRoyaleQueue.filter(entry => entry.socketId !== socket.id);
      try { socket.leave(BR_QUEUE_ROOM); } catch {}
      socket.emit('queue_left', { removed: before !== battleRoyaleQueue.length });
      emitQueueUpdate(io);
    } catch (e) {
      console.error('leave_battle_royale_queue error:', e);
      socket.emit('queue_error', { message: 'Failed to leave queue' });
    }
  });

  // Join game session with reconnection support
  socket.on('join_battle_royale', async (data) => {
    try {
      const { sessionId, playerId, playerName } = data;
      
      if (!sessionId || !playerId || !playerName) {
        socket.emit('error', { message: 'Missing required fields' });
        return;
      }

      // Get or create persistent session
      const session = await getOrCreateSession(sessionId);
      
      // Check if player is reconnecting
      const existingPlayer = session.getPlayerData(playerId);
      if (existingPlayer) {
        console.log(`Player ${playerId} reconnecting to session ${sessionId}`);
        // Update socket ID for reconnection
        session.updatePlayerSocket(playerId, socket.id);
      } else {
        console.log(`Player ${playerId} joining new session ${sessionId}`);
        // Add new player
        session.addPlayer(playerId, { 
          socketId: socket.id, 
          playerName,
          playerId 
        });
      }

      socket.join(sessionId);
      socket.sessionId = sessionId;
      socket.playerId = playerId;

      // Send current game state to all players in session
      const gameStateUpdate = {
        players: session.getAllPlayers(),
        gameState: session.gameState,
        sessionId,
        usedQuestionsCount: session.usedQuestions.size
      };
      
      io.to(sessionId).emit('game_state_update', gameStateUpdate);

      // Broadcast lobby state if game not active
      if (!session.gameState.isGameActive && !session.gameState.gameOver) {
        const availableNodes = ['R3_1', 'R3_2', 'R3_3', 'R3_4', 'R3_5', 'R3_6', 'R3_7', 'R3_8'];
        const selections = session.getAllPlayers()
          .filter(p => !!p.selectedSpawnNode)
          .map(p => ({ playerId: p.playerId, playerName: p.playerName, nodeId: p.selectedSpawnNode, isConnected: !!p.socketId }));
        io.to(sessionId).emit('lobby_state_update', {
          sessionId,
          availableNodes,
          selections,
          players: session.getAllPlayers()
        });
      }
      
      // Send welcome message to the connecting player
      socket.emit('connection_success', {
        message: existingPlayer ? 'Reconnected successfully!' : 'Joined game successfully!',
        playerData: session.getPlayerData(playerId),
        gameState: session.gameState
      });

      console.log(`Player ${playerId} ${existingPlayer ? 'reconnected to' : 'joined'} session ${sessionId}`);

      // Try to auto-start if conditions are met
      await maybeAutoStartBySelections(sessionId, session);
      scheduleAutoStartIfReady(sessionId, session);
    } catch (error) {
      console.error('Error handling join_battle_royale:', error);
      socket.emit('error', { message: 'Failed to join game session' });
    }
  });

  // Lobby: player selects a spawn node on the map
  socket.on('select_spawn_node', async (data) => {
    try {
      const { sessionId, playerId, nodeId } = data || {};
      if (!sessionId || !playerId || !nodeId) {
        socket.emit('error', { message: 'Missing required fields' });
        return;
      }

      const session = await getOrCreateSession(sessionId);
      const player = session.getPlayerData(playerId);
      if (!player) {
        socket.emit('error', { message: 'Player not found in session' });
        return;
      }

      // Only allow selection before game starts
      if (session.gameState.isGameActive || session.gameState.gameOver) {
        socket.emit('error', { message: 'Cannot select spawn after game start' });
        return;
      }

      const allowedSpawnNodes = ['R3_1', 'R3_2', 'R3_3', 'R3_4', 'R3_5', 'R3_6', 'R3_7', 'R3_8'];
      if (!allowedSpawnNodes.includes(nodeId)) {
        socket.emit('error', { message: 'Invalid spawn node' });
        return;
      }

      // Prevent duplicate selection by different players
      const alreadyTaken = Array.from(session.players.values())
        .some(p => p.playerId !== playerId && p.selectedSpawnNode === nodeId);
      if (alreadyTaken) {
        socket.emit('error', { message: 'Spawn node already selected by another player' });
        return;
      }

      session.updatePlayer(playerId, { selectedSpawnNode: nodeId });

      // Broadcast lobby state after update
      const selections = session.getAllPlayers()
        .filter(p => !!p.selectedSpawnNode)
        .map(p => ({ playerId: p.playerId, playerName: p.playerName, nodeId: p.selectedSpawnNode, isConnected: !!p.socketId }));
      io.to(sessionId).emit('lobby_state_update', {
        sessionId,
        availableNodes: allowedSpawnNodes,
        selections,
        players: session.getAllPlayers()
      });

      // Attempt auto-start if enough selections
      await maybeAutoStartBySelections(sessionId, session);
      scheduleAutoStartIfReady(sessionId, session);
    } catch (error) {
      console.error('Error handling select_spawn_node:', error);
      socket.emit('error', { message: 'Failed to select spawn node' });
    }
  });

  // Request question for edge traversal
  socket.on('request_question', async (data) => {
    try {
      const { sessionId, playerId, difficulty, edgeId } = data;
      
      if (!sessionId || !playerId || !difficulty || !edgeId) {
        socket.emit('error', { message: 'Missing required fields' });
        return;
      }

      // Get session from cache or database
      const session = await getOrCreateSession(sessionId);
      
      // Verify player exists in session
      const player = session.getPlayerData(playerId);
      if (!player) {
        socket.emit('error', { message: 'Player not found in session' });
        return;
      }

      // Check if game is still active
      if (!session.gameState.isGameActive || session.gameState.gameOver) {
        socket.emit('error', { message: 'Game is not active' });
        return;
      }

      const usedQuestionIds = Array.from(session.usedQuestions);

      const question = await getRandomQuestion(difficulty, usedQuestionIds);
      
      if (!question) {
        socket.emit('error', { 
          message: `No available ${difficulty} questions found. Try a different path.` 
        });
        return;
      }

      // Mark question as used
      session.markQuestionUsed(question.que_id);

      // Send question to player (without testcase for security)
      socket.emit('question_received', {
        questionId: question.que_id,
        content: question.que_content,
        difficulty: question.difficulty,
        edgeId,
        playerPosition: player.currentNode
      });

      console.log(`Sent ${difficulty} question ${question.que_id} to player ${playerId} at ${player.currentNode}`);
    } catch (error) {
      console.error('Error handling question request:', error);
      socket.emit('error', { message: 'Failed to fetch question. Please try again.' });
    }
  });

  // Submit answer
  socket.on('submit_answer', async (data) => {
    try {
      const { sessionId, playerId, questionId, answer, targetNode } = data;
      
      if (!sessionId || !playerId || !questionId || answer === undefined || !targetNode) {
        socket.emit('error', { message: 'Missing required fields' });
        return;
      }

      // Get session from cache or database
      const session = await getOrCreateSession(sessionId);
      const player = session.getPlayerData(playerId);

      if (!player) {
        socket.emit('error', { message: 'Player not found in session' });
        return;
      }

      // Check if player is alive and game is active
      if (!player.isAlive) {
        socket.emit('error', { message: 'Player is eliminated' });
        return;
      }

      if (!session.gameState.isGameActive || session.gameState.gameOver) {
        socket.emit('error', { message: 'Game is not active' });
        return;
      }

      // Fetch question with testcase for validation
      const { data: questionData, error } = await supabase
        .from('battle_royale_questions')
        .select('*')
        .eq('que_id', questionId)
        .single();

      if (error || !questionData) {
        socket.emit('error', { message: 'Question not found' });
        return;
      }

      // Validate answer against testcase
      const testcase = questionData.testcase;
      let isCorrect = false;

      // Handle different testcase formats
      if (Array.isArray(testcase)) {
        // Multiple test cases - check if answer matches any expected output
        isCorrect = testcase.some(tc => 
          tc.expected_output && tc.expected_output.toString().trim() === answer.toString().trim()
        );
      } else if (testcase.expected_output) {
        // Single test case
        isCorrect = testcase.expected_output.toString().trim() === answer.toString().trim();
      }

      // Update player based on answer
      if (isCorrect) {
        // Correct answer - move player
        const updatedPlayer = {
          currentNode: targetNode,
          currentZone: getZoneFromNode(targetNode),
          questionsAnswered: player.questionsAnswered + 1
        };
        
        session.updatePlayer(playerId, updatedPlayer);

        socket.emit('answer_result', {
          correct: true,
          message: 'Correct! Moving to next position.',
          newPosition: targetNode,
          newZone: getZoneFromNode(targetNode),
          questionsAnswered: updatedPlayer.questionsAnswered
        });

        // Check win condition
        if (targetNode === 'TARGET') {
          session.gameState.gameOver = true;
          session.gameState.winner = playerId;
          session.gameState.isGameActive = false;
          
          await session.saveSession(); // Save final state
          
          io.to(sessionId).emit('game_over', {
            winner: playerId,
            winnerName: player.playerName,
            message: `🎉 ${player.playerName} reached the center and won the Battle Royale!`,
            finalStats: {
              questionsAnswered: updatedPlayer.questionsAnswered,
              finalHealth: player.health
            }
          });
        }
      } else {
        // Wrong answer - lose health
        const newHealth = Math.max(0, player.health - 10);
        const isEliminated = newHealth <= 0;
        
        session.updatePlayer(playerId, {
          health: newHealth,
          isAlive: !isEliminated
        });

        socket.emit('answer_result', {
          correct: false,
          message: `Wrong answer! Lost 10 health. ${isEliminated ? 'You are eliminated!' : ''}`,
          healthLost: 10,
          newHealth,
          isEliminated,
          correctAnswer: questionData.testcase.expected_output || 'N/A'
        });

        // Check if player is eliminated
        if (isEliminated) {
          io.to(sessionId).emit('player_eliminated', {
            playerId,
            playerName: player.playerName,
            message: `💀 ${player.playerName} has been eliminated!`,
            playersRemaining: session.gameState.playersAlive
          });
          
          // Check if only one player remains
          if (session.gameState.playersAlive === 1) {
            const remainingPlayers = session.getAllPlayers().filter(p => p.isAlive);
            if (remainingPlayers.length === 1) {
              const winner = remainingPlayers[0];
              session.gameState.gameOver = true;
              session.gameState.winner = winner.playerId;
              session.gameState.isGameActive = false;
              
              await session.saveSession();
              
              io.to(sessionId).emit('game_over', {
                winner: winner.playerId,
                winnerName: winner.playerName,
                message: `🏆 ${winner.playerName} is the last player standing!`,
                winType: 'last_standing'
              });
            }
          }
        }
      }

      // Broadcast updated game state
      const gameStateUpdate = {
        players: session.getAllPlayers(),
        gameState: session.gameState,
        sessionId,
        usedQuestionsCount: session.usedQuestions.size
      };
      
      io.to(sessionId).emit('game_state_update', gameStateUpdate);

      console.log(`Player ${playerId} answered question ${questionId}: ${isCorrect ? 'CORRECT' : 'WRONG'}`);
    } catch (error) {
      console.error('Error validating answer:', error);
      socket.emit('error', { message: 'Failed to validate answer' });
    }
  });

  // Handle disconnection with reconnection support
  socket.on('disconnect', async () => {
    console.log('Player disconnected:', socket.id);
    // Remove from queue if present
    try {
      const before = battleRoyaleQueue.length;
      battleRoyaleQueue = battleRoyaleQueue.filter(entry => entry.socketId !== socket.id);
      if (before !== battleRoyaleQueue.length) {
        emitQueueUpdate(io);
      }
    } catch (e) {
      console.error('queue cleanup on disconnect error:', e);
    }
    
    if (socket.sessionId && socket.playerId) {
      try {
        const session = await getOrCreateSession(socket.sessionId);
        const player = session.getPlayerData(socket.playerId);
        
        if (player) {
          // Mark player as disconnected but don't remove immediately
          // They might reconnect (especially important for Render free tier)
          session.updatePlayerSocket(socket.playerId, null);
          
          // Notify remaining players about disconnection
          socket.to(socket.sessionId).emit('player_disconnected', {
            playerId: socket.playerId,
            playerName: player.playerName,
            message: `${player.playerName} disconnected (can reconnect)`
          });
          
          // Update game state
          const gameStateUpdate = {
            players: session.getAllPlayers(),
            gameState: session.gameState,
            sessionId: socket.sessionId,
            usedQuestionsCount: session.usedQuestions.size
          };
          
          socket.to(socket.sessionId).emit('game_state_update', gameStateUpdate);
          
          console.log(`Player ${socket.playerId} disconnected from session ${socket.sessionId}`);

          // If countdown was scheduled, cancel it when connected players drop below requirement
          try {
            const connectedNow = Array.from(session.players.values()).filter(p => !!p.socketId);
            if (!session.gameState.isGameActive && !session.gameState.gameOver && connectedNow.length < REQUIRED_PLAYERS) {
              cancelAutoStartIfScheduled(socket.sessionId);
            }
          } catch (e) {
            console.error('auto-start cancellation check (disconnect) failed:', e);
          }
        }
      } catch (error) {
        console.error('Error handling disconnect:', error);
      }
    }
  });
  
  // Handle manual leave game
  socket.on('leave_game', async (data) => {
    try {
      const { sessionId, playerId } = data;
      
      if (sessionId && playerId) {
        const session = await getOrCreateSession(sessionId);
        const player = session.getPlayerData(playerId);
        
        if (player) {
          session.removePlayer(playerId);
          
          socket.to(sessionId).emit('player_left', {
            playerId,
            playerName: player.playerName,
            message: `${player.playerName} left the game`
          });
          
          // Update game state
          const gameStateUpdate = {
            players: session.getAllPlayers(),
            gameState: session.gameState,
            sessionId,
            usedQuestionsCount: session.usedQuestions.size
          };
          
          socket.to(sessionId).emit('game_state_update', gameStateUpdate);
          
          console.log(`Player ${playerId} left session ${sessionId}`);

          // If countdown was scheduled, cancel it when connected players drop below requirement
          try {
            const connectedNow = Array.from(session.players.values()).filter(p => !!p.socketId);
            if (!session.gameState.isGameActive && !session.gameState.gameOver && connectedNow.length < REQUIRED_PLAYERS) {
              cancelAutoStartIfScheduled(sessionId);
            }
          } catch (e) {
            console.error('auto-start cancellation check (leave_game) failed:', e);
          }
        }
      }
    } catch (error) {
      console.error('Error handling leave_game:', error);
    }
  });
});

// Helper function to determine zone from node name
function getZoneFromNode(nodeName) {
  if (nodeName === 'TARGET') return 'target';
  if (nodeName.startsWith('PLAYER_')) return 'spawn';
  if (nodeName.startsWith('R1_')) return 'ring1';
  if (nodeName.startsWith('R2_')) return 'ring2';
  if (nodeName.startsWith('R3_')) return 'ring3';
  return 'unknown';
}

// API endpoint to get session info
app.get('/api/session/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = await getOrCreateSession(sessionId);
    
    res.json({
      sessionId,
      playerCount: session.players.size,
      players: session.getAllPlayers(),
      questionsUsed: session.usedQuestions.size,
      gameState: session.gameState,
      lastSaved: session.lastSaved
    });
  } catch (error) {
    console.error('Error getting session info:', error);
    res.status(500).json({ error: 'Failed to get session info' });
  }
});

// API endpoint to create new session
app.post('/api/create-session', async (req, res) => {
  try {
    const sessionId = generateSessionId();
    const session = new PersistentGameSession(sessionId);
    await session.saveSession();
    sessionCache.set(sessionId, session);
    
    res.json({
      sessionId,
      message: 'Session created successfully'
    });
  } catch (error) {
    console.error('Error creating session:', error);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

// API endpoint to list active sessions
app.get('/api/sessions', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('battle_royale_sessions')
      .select('session_id, created_at, updated_at, players, game_state')
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .limit(20);

    if (error) {
      throw error;
    }

    const sessions = data.map(session => ({
      sessionId: session.session_id,
      playerCount: session.players ? session.players.length : 0,
      createdAt: session.created_at,
      updatedAt: session.updated_at,
      gameState: session.game_state
    }));

    res.json({ sessions });
  } catch (error) {
    console.error('Error listing sessions:', error);
    res.status(500).json({ error: 'Failed to list sessions' });
  }
});

// Health check endpoint for Render
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    activeSessions: sessionCache.size,
    connectedClients: io.engine.clientsCount
  });
});

// Generate unique session ID
function generateSessionId() {
  return 'BR_' + Math.random().toString(36).substr(2, 9).toUpperCase() + '_' + Date.now();
}

// Clean up inactive sessions and players periodically
setInterval(async () => {
  console.log('Running cleanup task...');
  
  try {
    // Clean up inactive players in cached sessions
    for (const [sessionId, session] of sessionCache.entries()) {
      session.cleanupInactivePlayers();
    }
    
    // Clean up old sessions from database (older than 24 hours)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    
    const { error } = await supabase
      .from('battle_royale_sessions')
      .update({ is_active: false })
      .lt('updated_at', oneDayAgo);
    
    if (error) {
      console.error('Error cleaning up old sessions:', error);
    } else {
      console.log('Cleaned up old sessions from database');
    }
    
    // Clear cache of sessions not accessed recently
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
    for (const [sessionId, session] of sessionCache.entries()) {
      if (session.lastSaved < thirtyMinutesAgo) {
        sessionCache.delete(sessionId);
        console.log(`Removed cached session: ${sessionId}`);
      }
    }
    
  } catch (error) {
    console.error('Error in cleanup task:', error);
  }
}, 15 * 60 * 1000); // Run every 15 minutes

// Graceful shutdown for Render
process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  
  // Save all cached sessions to database
  for (const [sessionId, session] of sessionCache.entries()) {
    try {
      await session.saveSession();
      console.log(`Saved session ${sessionId} before shutdown`);
    } catch (error) {
      console.error(`Error saving session ${sessionId}:`, error);
    }
  }
  
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

// Start server
const PORT = process.env.PORT || process.env.BATTLE_ROYALE_PORT || 5003;
server.listen(PORT, () => {
  console.log(`🚀 Battle Royale server running on port ${PORT}`);
  console.log(`🎮 Optimized for Render free tier with Supabase persistence`);
  console.log(`📊 Health check available at /health`);
});

module.exports = { app, server, io };
