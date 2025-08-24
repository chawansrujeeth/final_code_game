// backend/battle_royale_server.js
// Optimized for Render free tier with Supabase session persistence

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const { supabase } = require('./supabaseClient');
const judge0Service = require('./services/judge0Service');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*", // Allow all origins - replace with your Vercel frontend URL for production
    methods: ["GET", "POST"]
  },
  // Optimize for Render free tier with longer timeouts
  pingTimeout: 120000, // 2 minutes (increased from 60000)
  pingInterval: 30000, // 30 seconds (increased from 25000)
  transports: ['websocket', 'polling'],
  allowEIO3: true, // Allow different Engine.IO versions
  perMessageDeflate: false // Disable compression for better performance
});

app.use(cors());

// Basic health endpoint for Elastic Beanstalk load-balancer health checks
app.get('/', (_req, res) => res.status(200).send('OK'));
app.get('/health', (_req, res) => res.status(200).json({ status: 'ok' }));
app.use(express.json());

// In-memory cache for active sessions (cleared on Render sleep)
const sessionCache = new Map();

// Simple in-memory matchmaking queue for Battle Royale
const BR_QUEUE_ROOM = 'BR_QUEUE';
const REQUIRED_PLAYERS = 4;
let battleRoyaleQueue = []; // [{ socketId, playerId, playerName }]

// Build a full list of spawnable nodes across all rings once per process
function buildSpawnPool() {
  const nodes = [];
  // Ring 3 – 8 nodes
  for (let i = 1; i <= 8; i++) nodes.push(`R3_${i}`);
  // Ring 2 – 8 nodes
  for (let i = 1; i <= 8; i++) nodes.push(`R2_${i}`);
  // Ring 1 – 6 nodes
  for (let i = 1; i <= 6; i++) nodes.push(`R1_${i}`);
  return nodes;
}

const FULL_SPAWN_POOL = buildSpawnPool();

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

// Note: autoStartTimers and zoneLoops are declared later with other timers

// Function to assign questions to all edges in the map
async function assignQuestionsToEdges(session) {
  try {
    console.log('🎯 Assigning questions to edges...');
    const edgeQuestions = new Map();
    const usedQuestions = new Set();
    
    // First, get all available questions from Supabase
    const { data: allQuestions, error } = await supabase
      .from('battle_royale_questions')
      .select('*');
    
    if (error) {
      console.error('❌ Error fetching questions from Supabase:', error);
      return new Map();
    }
    
    if (!allQuestions || allQuestions.length === 0) {
      console.error('❌ No questions found in battle_royale_questions table');
      return new Map();
    }
    
    console.log(`📚 Found ${allQuestions.length} questions in database`);
    console.log('📊 Questions by difficulty:', {
      easy: allQuestions.filter(q => q.difficulty === 'easy').length,
      medium: allQuestions.filter(q => q.difficulty === 'medium').length,
      hard: allQuestions.filter(q => q.difficulty === 'hard').length
    });
    
    // Define all edges with their difficulty
    const edges = [
      // Ring 3 to Ring 2 (Easy - inward movement)
      { id: 'R3_1-R2_1', difficulty: 'easy' },
      { id: 'R3_2-R2_2', difficulty: 'easy' },
      { id: 'R3_3-R2_3', difficulty: 'easy' },
      { id: 'R3_4-R2_4', difficulty: 'easy' },
      { id: 'R3_5-R2_5', difficulty: 'easy' },
      { id: 'R3_6-R2_6', difficulty: 'easy' },
      { id: 'R3_7-R2_7', difficulty: 'easy' },
      { id: 'R3_8-R2_8', difficulty: 'easy' },
      
      // Ring 3 circular edges (Easy - lateral movement)
      { id: 'R3_1-R3_2', difficulty: 'easy' },
      { id: 'R3_2-R3_3', difficulty: 'easy' },
      { id: 'R3_3-R3_4', difficulty: 'easy' },
      { id: 'R3_4-R3_5', difficulty: 'easy' },
      { id: 'R3_5-R3_6', difficulty: 'easy' },
      { id: 'R3_6-R3_7', difficulty: 'easy' },
      { id: 'R3_7-R3_8', difficulty: 'easy' },
      { id: 'R3_8-R3_1', difficulty: 'easy' },
      
      // Ring 2 to Ring 1 (Medium - inward movement)
      { id: 'R2_1-R1_1', difficulty: 'medium' },
      { id: 'R2_2-R1_2', difficulty: 'medium' },
      { id: 'R2_3-R1_3', difficulty: 'medium' },
      { id: 'R2_4-R1_4', difficulty: 'medium' },
      { id: 'R2_5-R1_5', difficulty: 'medium' },
      { id: 'R2_6-R1_6', difficulty: 'medium' },
      { id: 'R2_7-R1_1', difficulty: 'medium' },
      { id: 'R2_8-R1_2', difficulty: 'medium' },
      
      // Ring 2 circular edges (Medium - lateral movement)
      { id: 'R2_1-R2_2', difficulty: 'medium' },
      { id: 'R2_2-R2_3', difficulty: 'medium' },
      { id: 'R2_3-R2_4', difficulty: 'medium' },
      { id: 'R2_4-R2_5', difficulty: 'medium' },
      { id: 'R2_5-R2_6', difficulty: 'medium' },
      { id: 'R2_6-R2_7', difficulty: 'medium' },
      { id: 'R2_7-R2_8', difficulty: 'medium' },
      { id: 'R2_8-R2_1', difficulty: 'medium' },
      
      // Ring 1 to TARGET (Hard - final approach)
      { id: 'R1_1-TARGET', difficulty: 'hard' },
      { id: 'R1_2-TARGET', difficulty: 'hard' },
      { id: 'R1_3-TARGET', difficulty: 'hard' },
      { id: 'R1_4-TARGET', difficulty: 'hard' },
      { id: 'R1_5-TARGET', difficulty: 'hard' },
      { id: 'R1_6-TARGET', difficulty: 'hard' },
      
      // Ring 1 circular edges (Hard - lateral movement)
      { id: 'R1_1-R1_2', difficulty: 'hard' },
      { id: 'R1_2-R1_3', difficulty: 'hard' },
      { id: 'R1_3-R1_4', difficulty: 'hard' },
      { id: 'R1_4-R1_5', difficulty: 'hard' },
      { id: 'R1_5-R1_6', difficulty: 'hard' },
      { id: 'R1_6-R1_1', difficulty: 'hard' }
    ];
    
    // Limit edges to available questions - assign only as many edges as we have questions
    const maxAssignments = Math.min(edges.length, allQuestions.length);
    const edgesToAssign = edges.slice(0, maxAssignments);
    
    console.log(`🎯 Assigning questions to ${edgesToAssign.length} edges (limited by ${allQuestions.length} available questions)`);
    
    // Create a shuffled copy of questions to ensure random distribution
    const shuffledQuestions = [...allQuestions].sort(() => Math.random() - 0.5);
    
    // Assign questions to edges
    for (let i = 0; i < edgesToAssign.length && i < shuffledQuestions.length; i++) {
      const edge = edgesToAssign[i];
      const question = shuffledQuestions[i];
      
      edgeQuestions.set(edge.id, {
        questionId: question.que_id,
        questionContent: question.que_content,
        testcase: question.testcase,
        difficulty: question.difficulty // Use question's actual difficulty
      });
      usedQuestions.add(question.que_id);
      
      console.log(`✅ Assigned question ${question.que_id} (${question.difficulty}) to edge ${edge.id}`);
    }
    
    // Save edge questions to session
    session.edgeQuestions = edgeQuestions;
    session.usedQuestions = usedQuestions;
    await session.saveSession();
    
    console.log(`✅ Successfully assigned ${edgeQuestions.size} questions to edges`);
    return edgeQuestions;
  } catch (error) {
    console.error('Error assigning questions to edges:', error);
    return new Map();
  }
}

// ---- Zone constants (keep in sync with frontend) ----
const MAP_BOUNDARY = 480;
const SHRINK_SECONDS = 30;
const WAIT_SECONDS = 30;

// ---- Game Timer constants ----
const GAME_DURATION_MS = 32 * 60 * 1000; // 32 minutes in milliseconds
const TIMER_BROADCAST_INTERVAL = 1000; // Broadcast time every second

const lobbySelectionTimers = new Map(); // sessionId -> timeoutId
const gameTimers = new Map(); // sessionId -> { startTime, endTime, intervalId }
const disconnectTimeouts = new Map(); // sessionId -> Map(playerId -> timeoutId)
const socketToPlayer = new Map(); // socketId -> { sessionId, playerId }
const autoStartTimers = new Map(); // sessionId -> timeout ID
const zoneLoops = new Map(); // sessionId -> interval ID

// Helper function to track socket-player mapping
function setPlayerSocket(socketId, sessionId, playerId) {
  socketToPlayer.set(socketId, { sessionId, playerId });
}

// Helper function to get player info from socket
function getPlayerFromSocket(socketId) {
  return socketToPlayer.get(socketId);
}

// Helper function to clear socket mapping
function clearPlayerSocket(socketId) {
  socketToPlayer.delete(socketId);
}

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

function scheduleLobbySelectionTimer(sessionId, delayMs = 10000) {
  try {
    if (lobbySelectionTimers.has(sessionId)) return; // already scheduled

    // Assign questions to edges immediately when timer starts
    (async () => {
      const session = await getOrCreateSession(sessionId);
      const edgeQuestions = await assignQuestionsToEdges(session);
      
      // Convert Map to object for emission
      const edgeQuestionsObject = Object.fromEntries(edgeQuestions);
      io.to(sessionId).emit('edge_questions_assigned', {
        edgeQuestions: edgeQuestionsObject,
        message: 'Questions assigned to edges. You have 10 seconds to select spawn point.'
      });
    })();

    const totalSeconds = Math.round(delayMs / 1000);
    let remainingSeconds = totalSeconds;
    
    // Start synchronized countdown
    const countdownInterval = setInterval(() => {
      io.to(sessionId).emit('lobby_countdown_tick', { 
        remaining: remainingSeconds,
        total: totalSeconds,
        message: `Auto-assigning spawn nodes in ${remainingSeconds}s...`
      });
      
      remainingSeconds--;
      
      if (remainingSeconds < 0) {
        clearInterval(countdownInterval);
        lobbySelectionTimers.delete(sessionId);
        
        // Auto-assign and start game
        assignRandomSpawnNodesAndStart(sessionId);
      }
    }, 1000);
    
    lobbySelectionTimers.set(sessionId, countdownInterval);
    
    // Initial countdown emission
    io.to(sessionId).emit('lobby_countdown_tick', { 
      remaining: remainingSeconds,
      total: totalSeconds,
      message: `Auto-assigning spawn nodes in ${remainingSeconds}s...`
    });
    
    console.log(`⏰ Started synchronized lobby countdown for session ${sessionId} (${totalSeconds}s)`);
  } catch (e) {
    console.error('scheduleLobbySelectionTimer error:', e);
  }
}

// --------------------- ZONE LOOP ---------------------
function initializeZoneState() {
  const firstSafe = { x: 0, y: 0, r: MAP_BOUNDARY * 0.7 };
  const randomInner = (parent) => {
    const scale = 0.8 + Math.random() * 0.1; // 80%-90%
    const r = parent.r * scale;
    const a = Math.random() * 2 * Math.PI;
    const d = Math.random() * (parent.r - r);
    return { x: parent.x + Math.cos(a) * d, y: parent.y + Math.sin(a) * d, r };
  };
  return {
    safeCircle: firstSafe,
    nextSafeCircle: randomInner(firstSafe),
    blueRadius: MAP_BOUNDARY,
    phase: 'moving',
    phaseTimer: 0,
    matchElapsed: 0
  };
}

function startZoneLoop(sessionId, session) {
  if (zoneLoops.has(sessionId)) return;

  if (!session.zoneState) {
    session.zoneState = initializeZoneState();
  }

  const TICK_MS = 1000; // 1s authoritative tick
  const loopId = setInterval(async () => {
    try {
      const zs = session.zoneState;
      if (!zs) return;
      zs.phaseTimer += 1;
      zs.matchElapsed += 1;

      if (zs.phase === 'moving') {
        const diff = zs.blueRadius - zs.safeCircle.r;
        if (diff <= 1) {
          zs.blueRadius = zs.safeCircle.r;
          zs.phase = 'waiting';
          zs.phaseTimer = 0;
        } else {
          zs.blueRadius = Math.max(zs.safeCircle.r, zs.blueRadius - (diff / SHRINK_SECONDS));
        }
      } else if (zs.phase === 'waiting' && zs.phaseTimer >= WAIT_SECONDS) {
        zs.safeCircle = zs.nextSafeCircle;
        if (zs.nextSafeCircle.r > 20) {
          const parent = zs.nextSafeCircle;
          const scale = 0.8 + Math.random() * 0.1;
          const r = parent.r * scale;
          const a = Math.random() * 2 * Math.PI;
          const d = Math.random() * (parent.r - r);
          zs.nextSafeCircle = { x: parent.x + Math.cos(a) * d, y: parent.y + Math.sin(a) * d, r };
        } else {
          zs.nextSafeCircle = { ...zs.nextSafeCircle, r: 0 };
        }
        zs.phase = 'moving';
        zs.phaseTimer = 0;
      }

      // Persist occasionally (every 10s)
      if (zs.phaseTimer % 10 === 0) {
        await session.saveSession();
      }

      // Emit authoritative zone state
      io.to(sessionId).emit('zone_update', { zoneState: zs });
      // Also push periodic game_state_update to sync players/health etc.
      io.to(sessionId).emit('game_state_update', {
        players: session.getAllPlayers(),
        gameState: session.gameState,
        sessionId,
        usedQuestionsCount: session.usedQuestions.size
      });
    } catch (e) {
      console.error('zone loop error:', e);
    }
  }, TICK_MS);

  zoneLoops.set(sessionId, loopId);
  console.log(`🌐 Started zone loop for session ${sessionId}`);
}

function stopZoneLoop(sessionId) {
  const id = zoneLoops.get(sessionId);
  if (id) {
    clearInterval(id);
    zoneLoops.delete(sessionId);
    console.log(`🛑 Stopped zone loop for session ${sessionId}`);
  }
}

function cancelLobbySelectionTimer(sessionId) {
  const existing = lobbySelectionTimers.get(sessionId);
  if (existing) {
    clearInterval(existing);
    lobbySelectionTimers.delete(sessionId);
    io.to(sessionId).emit('lobby_countdown_cancelled');
    console.log(`🛑 Cancelled lobby countdown for session ${sessionId}`);
  }
}

// ---- Edge Question Assignment Functions ----
async function assignQuestionsToEdges(sessionId, session) {
  try {
    console.log(`🎯 Assigning questions to edges for session ${sessionId}`);
    
    // Define ALL edges in the game - including bidirectional edges
    const allEdges = [
      // R3 circular edges (bidirectional)
      'R3_1-R3_2', 'R3_2-R3_1', 'R3_2-R3_3', 'R3_3-R3_2', 'R3_3-R3_4', 'R3_4-R3_3', 
      'R3_4-R3_5', 'R3_5-R3_4', 'R3_5-R3_6', 'R3_6-R3_5', 'R3_6-R3_7', 'R3_7-R3_6', 
      'R3_7-R3_8', 'R3_8-R3_7', 'R3_8-R3_1', 'R3_1-R3_8',
      
      // R3 to R2 edges (bidirectional)
      'R3_1-R2_1', 'R2_1-R3_1', 'R3_2-R2_1', 'R2_1-R3_2', 'R3_3-R2_2', 'R2_2-R3_3', 
      'R3_4-R2_2', 'R2_2-R3_4', 'R3_5-R2_3', 'R2_3-R3_5', 'R3_6-R2_3', 'R2_3-R3_6', 
      'R3_7-R2_4', 'R2_4-R3_7', 'R3_8-R2_4', 'R2_4-R3_8',
      
      // R2 circular edges (bidirectional) - FIXED: Added missing R2_5, R2_6, R2_7, R2_8
      'R2_1-R2_2', 'R2_2-R2_1', 'R2_2-R2_3', 'R2_3-R2_2', 'R2_3-R2_4', 'R2_4-R2_3', 
      'R2_4-R2_5', 'R2_5-R2_4', 'R2_5-R2_6', 'R2_6-R2_5', 'R2_6-R2_7', 'R2_7-R2_6',
      'R2_7-R2_8', 'R2_8-R2_7', 'R2_8-R2_1', 'R2_1-R2_8',
      
      // R2 to R1 edges (bidirectional)
      'R2_1-R1_1', 'R1_1-R2_1', 'R2_2-R1_1', 'R1_1-R2_2', 'R2_3-R1_2', 'R1_2-R2_3', 
      'R2_4-R1_2', 'R1_2-R2_4', 'R2_5-R1_3', 'R1_3-R2_5', 'R2_6-R1_3', 'R1_3-R2_6',
      'R2_7-R1_4', 'R1_4-R2_7', 'R2_8-R1_4', 'R1_4-R2_8',
      
      // R1 circular edges (bidirectional)
      'R1_1-R1_2', 'R1_2-R1_1', 'R1_2-R1_3', 'R1_3-R1_2', 'R1_3-R1_4', 'R1_4-R1_3', 
      'R1_4-R1_1', 'R1_1-R1_4',
      
      // R1 to TARGET edges (bidirectional)
      'R1_1-TARGET', 'TARGET-R1_1', 'R1_2-TARGET', 'TARGET-R1_2', 
      'R1_3-TARGET', 'TARGET-R1_3', 'R1_4-TARGET', 'TARGET-R1_4'
    ];

    console.log(`📝 Total edges to assign: ${allEdges.length}`);

    // Fetch ALL questions from Supabase (ignore difficulty for now)
    const { data: questions, error } = await supabase
      .from('battle_royale_questions')
      .select('*')
      .limit(100); // Get up to 100 questions

    if (error) {
      console.error('❌ Error fetching questions:', error);
      console.error('Supabase error details:', error);
      return;
    }

    if (!questions || questions.length === 0) {
      console.error('❌ No questions found in database');
      console.log('🔍 Checking if table exists and has data...');
      
      // Try to get table info
      const { data: tableCheck, error: tableError } = await supabase
        .from('battle_royale_questions')
        .select('count(*)', { count: 'exact' });
      
      if (tableError) {
        console.error('❌ Table check error:', tableError);
      } else {
        console.log('📊 Table row count:', tableCheck);
      }
      return;
    }

    console.log(`📚 Found ${questions.length} questions in database`);
    console.log('🔍 Sample question:', questions[0]);

    // Initialize edgeQuestions map
    session.edgeQuestions = new Map();

    // Assign random questions to each edge
    allEdges.forEach((edgeId, index) => {
      // Use modulo to cycle through questions if we have fewer questions than edges
      const questionIndex = index % questions.length;
      const question = questions[questionIndex];
      
      session.edgeQuestions.set(edgeId, {
        que_id: question.que_id,
        que_content: question.que_content,
        testcase: question.testcase,
        difficulty: question.difficulty,
        edgeId: edgeId
      });
      
      console.log(`✅ Assigned question ${question.que_id} to edge ${edgeId}`);
    });

    console.log(`🎯 Successfully assigned ${session.edgeQuestions.size} questions to edges`);
    
    // Save the session with assigned questions
    await session.saveSession();
    
  } catch (error) {
    console.error('❌ Error assigning questions to edges:', error);
  }
}

async function getMultipleQuestions(difficulty, count) {
  try {
    const { data, error } = await supabase
      .from('battle_royale_questions')
      .select('*')
      .eq('difficulty', difficulty)
      .limit(Math.max(count, 10)); // Get at least 10 to have variety
    
    if (error) {
      console.error('Supabase error fetching questions:', error);
      return [];
    }
    
    // Shuffle the questions
    const shuffled = data.sort(() => Math.random() - 0.5);
    return shuffled;
    
  } catch (error) {
    console.error('Error fetching multiple questions:', error);
    return [];
  }
}

// ---- Game Timer Functions ----
function startGameTimer(sessionId) {
  try {
    // Clear any existing timer
    stopGameTimer(sessionId);
    
    const now = Date.now();
    const endTime = now + GAME_DURATION_MS;
    
    // Broadcast timer updates every second
    const intervalId = setInterval(async () => {
      try {
        const currentTime = Date.now();
        const timeRemaining = Math.max(0, endTime - currentTime);
        
        // Update session with current time
        const session = await getOrCreateSession(sessionId);
        session.gameState.timeRemaining = timeRemaining;
        session.gameState.gameEndTime = endTime;
        await session.saveSession();
        
        // Broadcast time update to all players
        io.to(sessionId).emit('game_timer_update', {
          timeRemaining,
          totalDuration: GAME_DURATION_MS,
          timeElapsed: GAME_DURATION_MS - timeRemaining,
          formattedTime: formatTime(timeRemaining)
        });
        
        // End game when time runs out
        if (timeRemaining <= 0) {
          await endGameByTimeout(sessionId);
        }
      } catch (error) {
        console.error('Game timer update error:', error);
      }
    }, TIMER_BROADCAST_INTERVAL);
    
    gameTimers.set(sessionId, {
      startTime: now,
      endTime,
      intervalId
    });
    
    console.log(`⏰ Started game timer for session ${sessionId} - Duration: ${GAME_DURATION_MS / 60000} minutes`);
  } catch (error) {
    console.error('Error starting game timer:', error);
  }
}

function stopGameTimer(sessionId) {
  const timer = gameTimers.get(sessionId);
  if (timer) {
    clearInterval(timer.intervalId);
    gameTimers.delete(sessionId);
    console.log(`🛑 Stopped game timer for session ${sessionId}`);
  }
}

function formatTime(milliseconds) {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

async function endGameByTimeout(sessionId) {
  try {
    console.log(`⏰ Game ended by timeout for session ${sessionId}`);
    
    const session = await getOrCreateSession(sessionId);
    if (session.gameState.gameOver) return; // Already ended
    
    // Stop all timers
    stopGameTimer(sessionId);
    stopZoneLoop(sessionId);
    
    // Find winner (player with most health, or random if tied)
    const alivePlayers = Array.from(session.players.values()).filter(p => p.health > 0);
    let winner = null;
    
    if (alivePlayers.length > 0) {
      // Find player(s) with highest health
      const maxHealth = Math.max(...alivePlayers.map(p => p.health));
      const topPlayers = alivePlayers.filter(p => p.health === maxHealth);
      
      // If tied, pick random winner
      winner = topPlayers[Math.floor(Math.random() * topPlayers.length)];
    }
    
    // Update game state
    session.gameState.gameOver = true;
    session.gameState.isGameActive = false;
    session.gameState.winner = winner ? winner.playerId : null;
    session.gameState.timeRemaining = 0;
    
    await session.saveSession();
    
    // Notify all players
    io.to(sessionId).emit('game_ended', {
      reason: 'timeout',
      winner: winner ? {
        playerId: winner.playerId,
        playerName: winner.playerName,
        health: winner.health
      } : null,
      finalStats: {
        playersAlive: alivePlayers.length,
        totalPlayers: session.players.size,
        gameDuration: GAME_DURATION_MS
      }
    });
    
    console.log(`🏆 Game ${sessionId} ended by timeout. Winner: ${winner ? winner.playerName : 'None'}`);
  } catch (error) {
    console.error('Error ending game by timeout:', error);
  }
}

function restoreGameTimer(sessionId, session) {
  try {
    const currentTime = Date.now();
    const endTime = session.gameState.gameEndTime;
    const timeRemaining = Math.max(0, endTime - currentTime);
    
    if (timeRemaining <= 0) {
      // Game should have ended, trigger timeout
      endGameByTimeout(sessionId);
      return;
    }
    
    console.log(`🔄 Restoring game timer for session ${sessionId} - ${Math.floor(timeRemaining / 60000)} minutes remaining`);
    
    // Start timer from current point
    const intervalId = setInterval(async () => {
      try {
        const currentTime = Date.now();
        const timeRemaining = Math.max(0, endTime - currentTime);
        
        // Update session with current time
        session.gameState.timeRemaining = timeRemaining;
        await session.saveSession();
        
        // Broadcast time update to all players
        io.to(sessionId).emit('game_timer_update', {
          timeRemaining,
          totalDuration: GAME_DURATION_MS,
          timeElapsed: GAME_DURATION_MS - timeRemaining,
          formattedTime: formatTime(timeRemaining)
        });
        
        // End game when time runs out
        if (timeRemaining <= 0) {
          await endGameByTimeout(sessionId);
        }
      } catch (error) {
        console.error('Restored timer update error:', error);
      }
    }, TIMER_BROADCAST_INTERVAL);
    
    gameTimers.set(sessionId, {
      startTime: session.gameState.gameStartTime,
      endTime,
      intervalId
    });
    
  } catch (error) {
    console.error('Error restoring game timer:', error);
  }
}

async function assignRandomSpawnNodes(sessionId) {
  try {
    const session = await getOrCreateSession(sessionId);
    if (session.gameState.isGameActive || session.gameState.gameOver) return;

    const connectedPlayers = Array.from(session.players.values()).filter(p => !!p.socketId);
    const unselectedPlayers = connectedPlayers.filter(p => !p.selectedSpawnNode);
    
    if (unselectedPlayers.length === 0) return;

    const allowedSpawnNodes = [...FULL_SPAWN_POOL];
    const alreadyTaken = new Set();
    
    // Track already selected nodes
    connectedPlayers.forEach(p => {
      if (p.selectedSpawnNode && allowedSpawnNodes.includes(p.selectedSpawnNode)) {
        alreadyTaken.add(p.selectedSpawnNode);
      }
    });

    // Get available nodes and shuffle for randomness
    let availableNodes = allowedSpawnNodes.filter(node => !alreadyTaken.has(node));
    availableNodes.sort(() => Math.random() - 0.5);

    // Assign random nodes to unselected players
    unselectedPlayers.forEach((player, index) => {
      if (index < availableNodes.length) {
        const assignedNode = availableNodes[index];
        session.updatePlayer(player.playerId, { selectedSpawnNode: assignedNode });
        console.log(`🎯 Auto-assigned ${assignedNode} to player ${player.playerId}`);
      }
    });

    // Broadcast updated lobby state
    const selections = session.getAllPlayers()
      .filter(p => !!p.selectedSpawnNode)
      .map(p => ({ playerId: p.playerId, playerName: p.playerName, nodeId: p.selectedSpawnNode, isConnected: !!p.socketId }));
    
    io.to(sessionId).emit('lobby_state_update', {
      sessionId,
      availableNodes: allowedSpawnNodes,
      selections,
      players: session.getAllPlayers()
    });

    console.log(`✅ Auto-assigned spawn nodes to ${unselectedPlayers.length} players in session ${sessionId}`);
  } catch (error) {
    console.error('Error assigning random spawn nodes:', error);
  }
}

async function assignRandomSpawnNodesAndStart(sessionId) {
  try {
    const session = await getOrCreateSession(sessionId);
    if (session.gameState.isGameActive || session.gameState.gameOver) return;

    const connectedPlayers = Array.from(session.players.values()).filter(p => !!p.socketId);
    
    // Check if we have enough players to start
    if (connectedPlayers.length < REQUIRED_PLAYERS) {
      console.log(`❌ Not enough players to start game: ${connectedPlayers.length}/${REQUIRED_PLAYERS}`);
      return;
    }
    
    const unselectedPlayers = connectedPlayers.filter(p => !p.selectedSpawnNode);
    
    const allowedSpawnNodes = [...FULL_SPAWN_POOL];
    const alreadyTaken = new Set();
    
    // Track already selected nodes
    connectedPlayers.forEach(p => {
      if (p.selectedSpawnNode && allowedSpawnNodes.includes(p.selectedSpawnNode)) {
        alreadyTaken.add(p.selectedSpawnNode);
      }
    });

    // Get available nodes and shuffle for randomness
    let availableNodes = allowedSpawnNodes.filter(node => !alreadyTaken.has(node));
    availableNodes.sort(() => Math.random() - 0.5);

    // Assign random nodes to unselected players
    unselectedPlayers.forEach((player, index) => {
      if (index < availableNodes.length) {
        const assignedNode = availableNodes[index];
        session.updatePlayer(player.playerId, { selectedSpawnNode: assignedNode });
        console.log(`🎯 Auto-assigned ${assignedNode} to player ${player.playerId}`);
      }
    });

    // Now assign currentNode for ALL players (selected + auto-assigned)
    const ordered = connectedPlayers
      .slice()
      .sort((a, b) => String(a.playerId).localeCompare(String(b.playerId)));

    const finalTaken = new Set();
    
    // First pass: reserve explicitly selected nodes
    ordered.forEach((p) => {
      if (p.selectedSpawnNode && allowedSpawnNodes.includes(p.selectedSpawnNode) && !finalTaken.has(p.selectedSpawnNode)) {
        finalTaken.add(p.selectedSpawnNode);
      }
    });

    // Second pass: assign currentNode to each player
    let remainingNodes = allowedSpawnNodes.filter(n => !finalTaken.has(n));
    remainingNodes.sort(() => Math.random() - 0.5);
    let remainIdx = 0;

    const getNextAvailable = () => {
      while (remainIdx < remainingNodes.length) {
        const node = remainingNodes[remainIdx++];
        if (!finalTaken.has(node)) {
          finalTaken.add(node);
          return node;
        }
      }
      // Fallback - should not happen with proper logic
      return allowedSpawnNodes[Math.floor(Math.random() * allowedSpawnNodes.length)];
    };

    ordered.forEach((p) => {
      let node;
      if (p.selectedSpawnNode && allowedSpawnNodes.includes(p.selectedSpawnNode) && !finalTaken.has(p.selectedSpawnNode)) {
        // Player has selected a valid, available node
        node = p.selectedSpawnNode;
        finalTaken.add(node);
        console.log(`✅ Player ${p.playerId} assigned selected spawn: ${node}`);
      } else {
        // Player didn't select or selected node is taken, assign random
        node = getNextAvailable();
        console.log(`🎲 Player ${p.playerId} assigned random spawn: ${node} (selected: ${p.selectedSpawnNode || 'none'})`);
      }
      
      session.updatePlayer(p.playerId, {
        currentNode: node,
        currentZone: getZoneFromNode(node),
        selectedSpawnNode: node // Ensure selectedSpawnNode is also set
      });
    });

    // Set game state to active
    session.gameState.isGameActive = true;
    session.gameState.currentRound = 1;
    session.gameState.playersAlive = connectedPlayers.length;
    
    // Initialize zone state and timing
    if (!session.zoneState) {
      session.zoneState = initializeZoneState();
    }
    startZoneLoop(sessionId, session);
    
    // Initialize game timing and start synchronized timer
    const now = Date.now();
    session.gameState.gameStartTime = now;
    session.gameState.gameEndTime = now + GAME_DURATION_MS;
    session.gameState.timeRemaining = GAME_DURATION_MS;
    startGameTimer(sessionId);
    
    // Assign questions to all edges from Supabase
    await assignQuestionsToEdges(sessionId, session);

    // Save session before emitting events
    await session.saveSession();

    // Broadcast final lobby state
    const selections = session.getAllPlayers()
      .filter(p => !!p.selectedSpawnNode)
      .map(p => ({ playerId: p.playerId, playerName: p.playerName, nodeId: p.selectedSpawnNode, isConnected: !!p.socketId }));
    
    io.to(sessionId).emit('lobby_state_update', {
      sessionId,
      availableNodes: allowedSpawnNodes,
      selections,
      players: session.getAllPlayers()
    });

    // Emit game started events
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

    console.log(`✅ [TIMER-AUTO-START] Session ${sessionId} started with ${connectedPlayers.length} players after 10s timer`);
    
  } catch (error) {
    console.error('Error in assignRandomSpawnNodesAndStart:', error);
  }
}

async function startGameFromLobby(sessionId, session) {
  try {
    if (session.gameState.isGameActive || session.gameState.gameOver) return;
    const connectedPlayers = Array.from(session.players.values()).filter(p => !!p.socketId);
    if (connectedPlayers.length < REQUIRED_PLAYERS) return;

    // Cancel lobby selection timer since game is starting
    cancelLobbySelectionTimer(sessionId);

    const allowedSpawnNodes = [...FULL_SPAWN_POOL];
    const ordered = connectedPlayers
      .slice()
      .sort((a, b) => String(a.playerId).localeCompare(String(b.playerId)));

    const taken = new Set();
    // Build a pool of available nodes for random assignment
    let availableNodes = [...allowedSpawnNodes];
    availableNodes.sort(() => Math.random() - 0.5);
    let availableIdx = 0;
    
    const getNextAvailable = () => {
      while (availableIdx < availableNodes.length) {
        const node = availableNodes[availableIdx++];
        if (!taken.has(node)) {
          return node;
        }
      }
      // Fallback - should not happen with proper logic
      return allowedSpawnNodes[Math.floor(Math.random() * allowedSpawnNodes.length)];
    };

    ordered.forEach((p) => {
      let node;
      if (p.selectedSpawnNode && allowedSpawnNodes.includes(p.selectedSpawnNode) && !taken.has(p.selectedSpawnNode)) {
        // Player has selected a valid, available node
        node = p.selectedSpawnNode;
        console.log(`✅ Player ${p.playerId} assigned selected spawn: ${node}`);
      } else {
        // Player didn't select or selected node is taken, assign random
        node = getNextAvailable();
        console.log(`🎲 Player ${p.playerId} assigned random spawn: ${node} (selected: ${p.selectedSpawnNode || 'none'})`);
      }
      taken.add(node);
      session.updatePlayer(p.playerId, {
        currentNode: node,
        currentZone: getZoneFromNode(node)
      });
    });

    session.gameState.isGameActive = true;
    session.gameState.currentRound = 1;
    session.gameState.playersAlive = connectedPlayers.length;
    // Initialize blue-zone loop if not yet running
    if (!session.zoneState) {
      session.zoneState = initializeZoneState();
    }
    startZoneLoop(sessionId, session);
    
    // Initialize game timing and start synchronized timer
    const now = Date.now();
    session.gameState.gameStartTime = now;
    session.gameState.gameEndTime = now + GAME_DURATION_MS;
    session.gameState.timeRemaining = GAME_DURATION_MS;
    startGameTimer(sessionId);
    
    // Assign questions to all edges from Supabase
    await assignQuestionsToEdges(sessionId, session);

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

    console.log(`✅ [AUTO-START] Session ${sessionId} started with ${connectedPlayers.length} players.`);
  } catch (e) {
    console.error('startGameFromLobby error:', e);
    // Ensure we save session even if there's an error
    try {
      await session.saveSession();
    } catch (saveError) {
      console.error('Failed to save session after error:', saveError);
    }
  }
}

async function tryFormMatch(ioInstance) {
  try {
    while (battleRoyaleQueue.length >= REQUIRED_PLAYERS) {
      const group = battleRoyaleQueue.splice(0, REQUIRED_PLAYERS);
      const sessionId = generateSessionId();

      const playersPayload = group.map(p => ({ playerId: p.playerId, playerName: p.playerName }));

      // Create session and assign questions immediately when match is formed
      try {
        console.log(`🎯 Match formed! Creating session ${sessionId} and assigning questions...`);
        const session = await getOrCreateSession(sessionId);
        
        // Assign questions to edges immediately when lobby is created
        await assignQuestionsToEdges(sessionId, session);
        console.log(`✅ Questions pre-assigned for session ${sessionId}`);
      } catch (error) {
        console.error(`❌ Error setting up session ${sessionId}:`, error);
      }

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
    this.zoneState = null;
    this.edgeQuestions = new Map(); // Map of edgeId -> question data
    this.gameState = {
      isGameActive: false,
      playersAlive: 0,
      currentRound: 1,
      winner: null,
      gameOver: false,
      gameStartTime: null,
      gameEndTime: null,
      timeRemaining: GAME_DURATION_MS
    };
    this.lastSaved = new Date();
  }

  // Load session from Supabase
  static async loadSession(sessionId) {
    try {
      console.log(`🔍 Loading session ${sessionId} from database...`);
      const { data, error } = await supabase
        .from('battle_royale_sessions')
        .select('*')
        .eq('session_id', sessionId)
        .eq('is_active', true)
        .single();

      if (error) {
        console.log(`📝 No existing session found (${error.message}), creating new: ${sessionId}`);
        return new PersistentGameSession(sessionId);
      }

      if (!data) {
        console.log(`📝 Creating new session: ${sessionId}`);
        return new PersistentGameSession(sessionId);
      }

      console.log('Loading existing session:', sessionId);
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

      // Restore edge questions
      if (data.edge_questions && typeof data.edge_questions === 'object') {
        session.edgeQuestions = new Map(Object.entries(data.edge_questions));
      }

      // Restore zone state
      if (data.zone_state) {
        session.zoneState = data.zone_state;
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

  // Save session to Supabase with better error handling
  async saveSession() {
    try {
      const playersArray = Array.from(this.players.values()).map(player => ({
        playerId: player.playerId,
        playerName: player.playerName,
        socketId: player.socketId,
        color: player.color,
        // Default to no position until game starts (avoids legacy PLAYER_* nodes)
        currentNode: player.currentNode || null,
        currentZone: player.currentZone || 'lobby',
        health: player.health,
        questionsAnswered: player.questionsAnswered,
        isAlive: player.isAlive,
        selectedSpawnNode: player.selectedSpawnNode || null,
        joinedAt: player.joinedAt,
        lastSeen: new Date().toISOString()
      }));

      const usedQuestionsArray = Array.from(this.usedQuestions);
      const edgeQuestionsObject = Object.fromEntries(this.edgeQuestions);

      const sessionData = {
        session_id: this.sessionId,
        players: playersArray,
        used_questions: usedQuestionsArray,
        edge_questions: edgeQuestionsObject,
        game_state: this.gameState,
        zone_state: this.zoneState,
        is_active: !this.gameState.gameOver,
        updated_at: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from('battle_royale_sessions')
        .upsert(sessionData, { onConflict: 'session_id' })
        .select();

      if (error) {
        console.error('Error saving session:', {
          sessionId: this.sessionId,
          error: error.message,
          details: error.details,
          hint: error.hint
        });
      } else {
        this.lastSaved = new Date();
        console.log(`✅ Session ${this.sessionId} saved to database`);
      }
    } catch (error) {
      console.error('Error saving session:', {
        sessionId: this.sessionId,
        message: error.message,
        stack: error.stack
      });
    }
  }

  // ==================== GAME LOGIC METHODS ====================
  
  // Get all accessible edges for a player (moved from frontend)
  getAccessibleEdges(playerId) {
    const player = this.players.get(playerId);
    if (!player || !player.currentNode) return [];
    
    const currentNode = player.currentNode;
    const allEdges = this.getAllEdgeDefinitions();
    
    // Filter edges that start from current node (undirected graph)
    return allEdges.filter(edge => 
      edge.source === currentNode || edge.target === currentNode
    ).map(edge => ({
      ...edge,
      isAccessible: true,
      canTraverse: !player.isEliminated && player.health > 0
    }));
  }
  
  // Define all edges in the game (moved from frontend)
  getAllEdgeDefinitions() {
    return [
      // R3 circular edges
      { id: 'R3_1-R3_2', source: 'R3_1', target: 'R3_2', difficulty: 'easy', pathType: 'lateral' },
      { id: 'R3_2-R3_3', source: 'R3_2', target: 'R3_3', difficulty: 'easy', pathType: 'lateral' },
      { id: 'R3_3-R3_4', source: 'R3_3', target: 'R3_4', difficulty: 'easy', pathType: 'lateral' },
      { id: 'R3_4-R3_5', source: 'R3_4', target: 'R3_5', difficulty: 'easy', pathType: 'lateral' },
      { id: 'R3_5-R3_6', source: 'R3_5', target: 'R3_6', difficulty: 'easy', pathType: 'lateral' },
      { id: 'R3_6-R3_7', source: 'R3_6', target: 'R3_7', difficulty: 'easy', pathType: 'lateral' },
      { id: 'R3_7-R3_8', source: 'R3_7', target: 'R3_8', difficulty: 'easy', pathType: 'lateral' },
      { id: 'R3_8-R3_1', source: 'R3_8', target: 'R3_1', difficulty: 'easy', pathType: 'lateral' },
      
      // R3 to R2 edges
      { id: 'R3_1-R2_1', source: 'R3_1', target: 'R2_1', difficulty: 'easy', pathType: 'inward' },
      { id: 'R3_2-R2_1', source: 'R3_2', target: 'R2_1', difficulty: 'easy', pathType: 'inward' },
      { id: 'R3_3-R2_2', source: 'R3_3', target: 'R2_2', difficulty: 'easy', pathType: 'inward' },
      { id: 'R3_4-R2_2', source: 'R3_4', target: 'R2_2', difficulty: 'easy', pathType: 'inward' },
      { id: 'R3_5-R2_3', source: 'R3_5', target: 'R2_3', difficulty: 'easy', pathType: 'inward' },
      { id: 'R3_6-R2_3', source: 'R3_6', target: 'R2_3', difficulty: 'easy', pathType: 'inward' },
      { id: 'R3_7-R2_4', source: 'R3_7', target: 'R2_4', difficulty: 'easy', pathType: 'inward' },
      { id: 'R3_8-R2_4', source: 'R3_8', target: 'R2_4', difficulty: 'easy', pathType: 'inward' },
      
      // R2 circular edges
      { id: 'R2_1-R2_2', source: 'R2_1', target: 'R2_2', difficulty: 'medium', pathType: 'lateral' },
      { id: 'R2_2-R2_3', source: 'R2_2', target: 'R2_3', difficulty: 'medium', pathType: 'lateral' },
      { id: 'R2_3-R2_4', source: 'R2_3', target: 'R2_4', difficulty: 'medium', pathType: 'lateral' },
      { id: 'R2_4-R2_1', source: 'R2_4', target: 'R2_1', difficulty: 'medium', pathType: 'lateral' },
      
      // R2 to R1 edges
      { id: 'R2_1-R1_1', source: 'R2_1', target: 'R1_1', difficulty: 'medium', pathType: 'inward' },
      { id: 'R2_1-R1_2', source: 'R2_1', target: 'R1_2', difficulty: 'medium', pathType: 'inward' },
      { id: 'R2_2-R1_2', source: 'R2_2', target: 'R1_2', difficulty: 'medium', pathType: 'inward' },
      { id: 'R2_2-R1_3', source: 'R2_2', target: 'R1_3', difficulty: 'medium', pathType: 'inward' },
      { id: 'R2_3-R1_3', source: 'R2_3', target: 'R1_3', difficulty: 'medium', pathType: 'inward' },
      { id: 'R2_3-R1_4', source: 'R2_3', target: 'R1_4', difficulty: 'medium', pathType: 'inward' },
      { id: 'R2_4-R1_4', source: 'R2_4', target: 'R1_4', difficulty: 'medium', pathType: 'inward' },
      { id: 'R2_4-R1_1', source: 'R2_4', target: 'R1_1', difficulty: 'medium', pathType: 'inward' },
      
      // R1 circular edges
      { id: 'R1_1-R1_2', source: 'R1_1', target: 'R1_2', difficulty: 'hard', pathType: 'lateral' },
      { id: 'R1_2-R1_3', source: 'R1_2', target: 'R1_3', difficulty: 'hard', pathType: 'lateral' },
      { id: 'R1_3-R1_4', source: 'R1_3', target: 'R1_4', difficulty: 'hard', pathType: 'lateral' },
      { id: 'R1_4-R1_5', source: 'R1_4', target: 'R1_5', difficulty: 'hard', pathType: 'lateral' },
      { id: 'R1_5-R1_6', source: 'R1_5', target: 'R1_6', difficulty: 'hard', pathType: 'lateral' },
      { id: 'R1_6-R1_1', source: 'R1_6', target: 'R1_1', difficulty: 'hard', pathType: 'lateral' },
      
      // R1 to TARGET edges
      { id: 'R1_1-TARGET', source: 'R1_1', target: 'TARGET', difficulty: 'hard', pathType: 'final' },
      { id: 'R1_2-TARGET', source: 'R1_2', target: 'TARGET', difficulty: 'hard', pathType: 'final' },
      { id: 'R1_3-TARGET', source: 'R1_3', target: 'TARGET', difficulty: 'hard', pathType: 'final' },
      { id: 'R1_4-TARGET', source: 'R1_4', target: 'TARGET', difficulty: 'hard', pathType: 'final' },
      { id: 'R1_5-TARGET', source: 'R1_5', target: 'TARGET', difficulty: 'hard', pathType: 'final' },
      { id: 'R1_6-TARGET', source: 'R1_6', target: 'TARGET', difficulty: 'hard', pathType: 'final' }
    ];
  }
  
  // Validate if edge is accessible from player's current position
  isEdgeAccessible(playerId, edgeId) {
    const accessibleEdges = this.getAccessibleEdges(playerId);
    return accessibleEdges.some(edge => edge.id === edgeId);
  }
  
  // Get target node for edge traversal
  getTargetNode(edgeId, currentNode) {
    const allEdges = this.getAllEdgeDefinitions();
    const edge = allEdges.find(e => e.id === edgeId);
    if (!edge) return null;
    
    // Return the opposite node (undirected graph)
    return edge.source === currentNode ? edge.target : edge.source;
  }
  
  // Update player position after successful traversal
  updatePlayerPosition(playerId, targetNode) {
    const player = this.players.get(playerId);
    if (!player) return false;
    
    player.currentNode = targetNode;
    player.currentZone = this.getZoneFromNode(targetNode);
    player.questionsAnswered++;
    player.lastUpdateTime = new Date();
    
    // Check win condition
    if (targetNode === 'TARGET') {
      this.gameState.winner = playerId;
      this.gameState.gameOver = true;
      this.gameState.isGameActive = false;
      this.gameState.gameEndTime = new Date();
    }
    
    return true;
  }
  
  // Process player movement attempt
  attemptMove(playerId, edgeId) {
    const player = this.players.get(playerId);
    if (!player) return { success: false, error: 'Player not found' };
    
    // Check if player can move
    if (player.isEliminated) {
      return { success: false, error: 'Player is eliminated' };
    }
    
    if (player.health <= 0) {
      return { success: false, error: 'Player has no health' };
    }
    
    // Validate edge accessibility
    const accessibleEdges = this.getAccessibleEdges(playerId);
    const edge = accessibleEdges.find(e => e.id === edgeId);
    
    if (!edge) {
      return { success: false, error: 'Edge not accessible from current position' };
    }
    
    // Get the question for this edge
    const question = this.edgeQuestions?.get(edgeId);
    if (!question) {
      return { success: false, error: 'No question assigned to this edge' };
    }
    
    return { 
      success: true, 
      edge,
      question: {
        id: question.que_id,
        content: question.que_content,
        difficulty: edge.difficulty,
        edgeId: edgeId
      }
    };
  }
  
  // Validate answer and process movement
  processAnswer(playerId, edgeId, answer) {
    const player = this.players.get(playerId);
    if (!player) return { success: false, error: 'Player not found' };
    
    const edge = this.getAllEdgeDefinitions().find(e => e.id === edgeId);
    if (!edge) return { success: false, error: 'Invalid edge' };
    
    const question = this.edgeQuestions?.get(edgeId);
    if (!question) return { success: false, error: 'No question for this edge' };
    
    // Validate answer against testcases
    let isCorrect = false;
    try {
      const testcases = question.testcase;
      if (testcases && Array.isArray(testcases)) {
        isCorrect = testcases.some(tc => {
          const expected = String(tc.expected).trim();
          const userAnswer = String(answer).trim();
          return expected === userAnswer;
        });
      }
    } catch (error) {
      console.error('Error validating answer:', error);
    }
    
    if (isCorrect) {
      // Move player to target node
      const targetNode = this.getTargetNode(edgeId, player.currentNode);
      this.updatePlayerPosition(playerId, targetNode);
      
      return {
        success: true,
        correct: true,
        targetNode,
        health: player.health,
        questionsAnswered: player.questionsAnswered,
        winner: this.gameState.winner
      };
    } else {
      // Wrong answer - reduce health
      player.health = Math.max(0, player.health - 10);
      player.wrongAnswers = (player.wrongAnswers || 0) + 1;
      
      if (player.health <= 0) {
        player.isEliminated = true;
        player.isAlive = false;
        this.gameState.playersAlive--;
      }
      
      return {
        success: true,
        correct: false,
        health: player.health,
        isEliminated: player.isEliminated
      };
    }
  }
  
  // Get current game view for a player
  getPlayerView(playerId) {
    const player = this.players.get(playerId);
    if (!player) return null;
    
    return {
      player: {
        id: playerId,
        health: player.health,
        currentNode: player.currentNode,
        currentZone: player.currentZone,
        questionsAnswered: player.questionsAnswered,
        wrongAnswers: player.wrongAnswers || 0,
        isEliminated: player.isEliminated || false
      },
      accessibleEdges: this.getAccessibleEdges(playerId),
      gameState: this.gameState,
      players: this.getAllPlayers(),
      zoneState: this.zoneState
    };
  }
  
  // Get zone level from node ID
  getZoneFromNode(nodeId) {
    if (nodeId === 'TARGET') return 'target';
    if (nodeId.startsWith('R1_')) return 'ring1';
    if (nodeId.startsWith('R2_')) return 'ring2';
    if (nodeId.startsWith('R3_')) return 'ring3';
    return 'unknown';
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
    // Don't auto-save on every player change to avoid DB spam
    // this.saveSession();
  }

  removePlayer(playerId) {
    this.players.delete(playerId);
    this.gameState.playersAlive = this.players.size;
    // Don't auto-save on every player change to avoid DB spam
    // this.saveSession();
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

// Helper function to get a question by ID
async function getQuestionById(questionId) {
  try {
    const { data, error } = await supabase
      .from('battle_royale_questions')
      .select('*')
      .eq('que_id', questionId)
      .single();
    
    if (error) {
      console.error('Error fetching question by ID:', error);
      return null;
    }
    
    return data;
  } catch (error) {
    console.error('Error in getQuestionById:', error);
    return null;
  }
}

// Helper function to get a random question for a difficulty
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
// Uses a Promise cache to prevent race conditions during concurrent joins
const sessionLoadPromises = new Map();

async function getOrCreateSession(sessionId) {
  // Fast path – already cached
  if (sessionCache.has(sessionId)) return sessionCache.get(sessionId);

  // Check if we're already loading this session
  if (sessionLoadPromises.has(sessionId)) {
    return await sessionLoadPromises.get(sessionId);
  }

  // Start loading and cache the promise
  const loadPromise = PersistentGameSession.loadSession(sessionId);
  sessionLoadPromises.set(sessionId, loadPromise);

  try {
    const session = await loadPromise;
    sessionCache.set(sessionId, session);
    sessionLoadPromises.delete(sessionId);
    
    // Restore game timer if session has an active game
    if (session.gameState.isGameActive && session.gameState.gameStartTime && session.gameState.gameEndTime) {
      restoreGameTimer(sessionId, session);
    }
    
    return session;
  } catch (error) {
    sessionLoadPromises.delete(sessionId);
    throw error;
  }
}

// Attempt to auto-start the game when at least 4 connected players have selected spawn nodes
async function maybeAutoStartBySelections(sessionId, session) {
  try {
    const connectedPlayers = Array.from(session.players.values()).filter(p => !!p.socketId);
    const selectedConnected = connectedPlayers.filter(p => !!p.selectedSpawnNode);
    const canStart = (
      connectedPlayers.length >= REQUIRED_PLAYERS &&
      selectedConnected.length >= REQUIRED_PLAYERS &&
      !session.gameState.isGameActive &&
      !session.gameState.gameOver
    );
    if (!canStart) {
      console.log(`⏳ Auto-start check: ${connectedPlayers.length}/${REQUIRED_PLAYERS} connected, ${selectedConnected.length}/${REQUIRED_PLAYERS} selected`);
      return;
    }

    console.log(`🚀 Starting game: ${connectedPlayers.length} connected, ${selectedConnected.length} selected`);
    // Cancel lobby selection timer since game is starting
    cancelLobbySelectionTimer(sessionId);

    // Allowed selectable spawn nodes in Ring 3
    const allowedSpawnNodes = [...FULL_SPAWN_POOL];

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
    // Initialize blue-zone loop if not yet running
    if (!session.zoneState) {
      session.zoneState = initializeZoneState();
    }
    startZoneLoop(sessionId, session);

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
  console.log('🔌 New socket connection:', socket.id);
  
  // Send welcome message
  socket.emit('connection_success', { 
    message: 'Connected to Battle Royale server', 
    serverId: 'render-br-server',
    timestamp: Date.now()
  });
  
  // Handle heartbeat to keep connection alive
  socket.on('heartbeat', (data) => {
    socket.emit('heartbeat_ack', { 
      timestamp: Date.now(),
      received: data ? data.timestamp : null
    });
  });

  // Matchmaking: join BR queue
  socket.on('join_battle_royale_queue', async (data) => {
    try {
      const { playerId, playerName } = data;

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
      await tryFormMatch(io);
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
      const { sessionId, playerId, playerName, isReconnection } = data || {};
      if (!sessionId || !playerId || !playerName) {
        socket.emit('error', { message: 'Missing required fields' });
        return;
      }

      // Get or create persistent session
      const session = await getOrCreateSession(sessionId);
      
      // Check if player is reconnecting
      const existingPlayer = session.getPlayerData(playerId);
      if (existingPlayer) {
        // Reconnection or updating socket
        const wasDisconnected = !existingPlayer.socketId;
        console.log(`${wasDisconnected ? '🔄' : '⚠️'} Player ${playerName} ${wasDisconnected ? 'reconnecting to' : 'already in'} session ${sessionId}`);
        session.updatePlayer(playerId, { 
          socketId: socket.id,
          isConnected: true,
          lastSeen: Date.now(),
          disconnectedAt: null
        });
      } else {
        // New player joining
        const playerCount = session.players.size;
        if (playerCount >= 8) {
          socket.emit('error', { message: 'Session is full (max 8 players)' });
          return;
        }
        
        // Add player to session
        const spawnNode = playerCount < 8 ? `SPAWN_${playerCount + 1}` : 'R3_1';
        session.addPlayer(playerId, playerName, socket.id, spawnNode);
        console.log(`✅ Player ${playerName} added to session ${sessionId} at ${spawnNode}`);
      }
      
      // Track socket-player mapping for disconnect handling
      setPlayerSocket(socket.id, sessionId, playerId);
      
      // Store session info on socket for disconnect handling
      socket.sessionId = sessionId;
      socket.playerId = playerId;
      socket.playerName = playerName;
      
      // Cancel any existing disconnect timeout if player is reconnecting
      if (disconnectTimeouts.has(sessionId)) {
        const sessionTimeouts = disconnectTimeouts.get(sessionId);
        if (sessionTimeouts.has(playerId)) {
          clearTimeout(sessionTimeouts.get(playerId));
          sessionTimeouts.delete(playerId);
          console.log(`🔄 Cancelled disconnect timeout for ${playerName}`);
        }
      }
      
      // Send connection success
      socket.emit('connection_success', {
        message: isReconnection ? 'Reconnected successfully!' : 'Connected to Battle Royale server!',
        sessionId,
        playerId,
        playerName,
        isReconnection
      });

      // Join the room
      socket.join(sessionId);
      
      // Only start timers if this is the first player joining
      const connectedCount = Array.from(session.players.values()).filter(p => !!p.socketId).length;
      
      // Start lobby selection timer only once when first player joins
      if (connectedCount === 1 && !session.gameState.isGameActive && !session.gameState.gameOver) {
        scheduleLobbySelectionTimer(sessionId, 10000);
      }
      
      // Try to auto-start if conditions are met (but don't cancel timer unless game actually starts)
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

      const allowedSpawnNodes = [...FULL_SPAWN_POOL];
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

      // Check if all connected players have selected - if so, cancel lobby timer
      const connectedPlayers = Array.from(session.players.values()).filter(p => !!p.socketId);
      const selectedConnected = connectedPlayers.filter(p => !!p.selectedSpawnNode);
      if (selectedConnected.length === connectedPlayers.length) {
        cancelLobbySelectionTimer(sessionId);
      }

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
      console.log('🔍 request_question received:', data);
      const { sessionId, playerId, edgeId } = data;
      
      if (!sessionId || !playerId || !edgeId) {
        console.log('❌ Missing required fields:', { sessionId, playerId, edgeId });
        socket.emit('error', { message: 'Missing required fields' });
        return;
      }

      // Get session from cache or database
      const session = await getOrCreateSession(sessionId);
      console.log('📋 Session loaded:', {
        sessionId,
        gameActive: session.gameState.isGameActive,
        gameOver: session.gameState.gameOver,
        edgeQuestionsCount: session.edgeQuestions?.size || 0
      });
      
      // Verify player exists in session
      const player = session.getPlayerData(playerId);
      if (!player) {
        console.log('❌ Player not found in session:', playerId);
        socket.emit('error', { message: 'Player not found in session' });
        return;
      }

      // Check if game is still active
      if (!session.gameState.isGameActive || session.gameState.gameOver) {
        console.log('❌ Game is not active:', {
          isGameActive: session.gameState.isGameActive,
          gameOver: session.gameState.gameOver
        });
        socket.emit('error', { message: 'Game is not active' });
        return;
      }

      // Get pre-assigned question for this edge
      const assignedQuestion = session.edgeQuestions?.get(edgeId);
      console.log('🎯 Looking for question for edge:', edgeId, 'Found:', !!assignedQuestion);
      
      if (!assignedQuestion) {
        console.log('❌ No question assigned to edge:', edgeId);
        console.log('Available edges:', Array.from(session.edgeQuestions?.keys() || []));
        socket.emit('error', { 
          message: `No question assigned to edge ${edgeId}. Please try again.` 
        });
        return;
      }

      // Send question to player
      socket.emit('question_received', {
        question: assignedQuestion.que_content,
        testCases: assignedQuestion.testcase,
        difficulty: assignedQuestion.difficulty,
        questionId: assignedQuestion.que_id,
        edgeId: edgeId,
        playerId: playerId
      });

      console.log(`✅ Pre-assigned question sent to player ${playerId} for edge ${edgeId}: ${assignedQuestion.que_content.substring(0, 50)}...`);
      
    } catch (error) {
      console.error('Error handling request_question:', error);
      socket.emit('error', { message: 'Failed to get question' });
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
          session.gameState.timeRemaining = 0;
          
          // Stop game timer and zone loop
          stopGameTimer(sessionId);
          stopZoneLoop(sessionId);
          
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
            playerId: playerId,
            playerName: player.playerName,
            message: `${player.playerName} has been eliminated!`,
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
              session.gameState.gameEndTime = new Date();
              
              // Stop game timer and zone loop
              stopGameTimer(sessionId);
              stopZoneLoop(sessionId);
              
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

  // Server-authoritative movement attempt
  socket.on('attempt_move', async (data) => {
    try {
      const { sessionId, playerId, edgeId } = data;
      if (!sessionId || !playerId || !edgeId) {
        socket.emit('move_error', { message: 'Missing required data' });
        return;
      }

      const session = await getOrCreateSession(sessionId);
      const result = session.attemptMove(playerId, edgeId);

      if (!result.success) {
        socket.emit('move_error', { message: result.error });
        return;
      }

      // Send question to player
      socket.emit('question_for_move', {
        edgeId,
        question: result.question,
        edge: result.edge
      });

    } catch (error) {
      console.error('Error attempting move:', error);
      socket.emit('move_error', { message: 'Failed to process move' });
    }
  });

  // Server-authoritative answer processing
  socket.on('submit_move_answer', async (data) => {
    try {
      const { sessionId, playerId, edgeId, answer } = data;
      if (!sessionId || !playerId || !edgeId || answer === undefined) {
        socket.emit('answer_error', { message: 'Missing required data' });
        return;
      }

      const session = await getOrCreateSession(sessionId);
      const result = session.processAnswer(playerId, edgeId, answer);

      if (!result.success) {
        socket.emit('answer_error', { message: result.error });
        return;
      }

      // Save session after answer processing
      await session.saveSession();

      // Send result to player
      socket.emit('answer_result', result);

      // Broadcast updated game state to all players
      const gameView = session.getPlayerView(playerId);
      io.to(sessionId).emit('game_state_update', {
        players: session.getAllPlayers(),
        gameState: session.gameState,
        sessionId,
        zoneState: session.zoneState
      });

      // If there's a winner, announce it
      if (result.winner) {
        io.to(sessionId).emit('game_over', {
          winner: result.winner,
          gameState: session.gameState,
          players: session.getAllPlayers()
        });
      }

    } catch (error) {
      console.error('Error processing answer:', error);
      socket.emit('answer_error', { message: 'Failed to process answer' });
    }
  });

  // Get player's current game view
  socket.on('get_game_view', async (data) => {
    try {
      const { sessionId, playerId } = data;
      if (!sessionId || !playerId) {
        socket.emit('view_error', { message: 'Missing required data' });
        return;
      }

      const session = await getOrCreateSession(sessionId);
      const view = session.getPlayerView(playerId);

      if (!view) {
        socket.emit('view_error', { message: 'Player not found' });
        return;
      }

      socket.emit('game_view', view);

    } catch (error) {
      console.error('Error getting game view:', error);
      socket.emit('view_error', { message: 'Failed to get game view' });
    }
  });

  // Get accessible edges for a player
  socket.on('get_accessible_edges', async (data) => {
    try {
      const { sessionId, playerId } = data;
      if (!sessionId || !playerId) {
        socket.emit('edges_error', { message: 'Missing required data' });
        return;
      }

      const session = await getOrCreateSession(sessionId);
      const accessibleEdges = session.getAccessibleEdges(playerId);
      
      socket.emit('accessible_edges', {
        edges: accessibleEdges,
        currentNode: session.players.get(playerId)?.currentNode
      });

    } catch (error) {
      console.error('Error getting accessible edges:', error);
      socket.emit('edges_error', { message: 'Failed to get accessible edges' });
    }
  });

  // Handle edge click to get question
  socket.on('edge_clicked', async (data) => {
    try {
      const { sessionId, playerId, edgeId } = data;
      console.log('🎯 Edge clicked:', { sessionId, playerId, edgeId });
      
      if (!sessionId || !playerId || !edgeId) {
        console.log('❌ Missing required data for edge click');
        socket.emit('edge_error', { message: 'Missing required data' });
        return;
      }

      const session = await getOrCreateSession(sessionId);
      console.log('📋 Session found, checking edge accessibility...');
      
      // Check if edge is accessible
      if (!session.isEdgeAccessible(playerId, edgeId)) {
        console.log('❌ Edge not accessible:', edgeId, 'for player:', playerId);
        socket.emit('edge_error', { message: 'Edge not accessible from your current position' });
        return;
      }
      
      console.log('✅ Edge is accessible, getting question...');

      // Get the question for this edge
      const questionData = session.edgeQuestions?.get(edgeId);
      console.log('🔍 Question data for edge:', edgeId, questionData);
      console.log('📚 Available edges with questions:', Array.from(session.edgeQuestions?.keys() || []));
      
      if (!questionData) {
        console.log('❌ No question assigned to edge:', edgeId);
        socket.emit('edge_error', { message: 'No question assigned to this edge' });
        return;
      }

      // Extract question ID from the stored data
      const questionId = questionData.questionId || questionData.que_id;
      if (!questionId) {
        socket.emit('edge_error', { message: 'Invalid question data for this edge' });
        return;
      }

      // Use the stored question data if available, otherwise fetch from database
      let question;
      if (questionData.questionContent || questionData.que_content) {
        question = {
          que_id: questionId,
          que_content: questionData.questionContent || questionData.que_content,
          difficulty: questionData.difficulty,
          testcase: questionData.testcase
        };
      } else {
        question = await getQuestionById(questionId);
        if (!question) {
          socket.emit('edge_error', { message: 'Question not found' });
          return;
        }
      }

      console.log('✅ Sending edge question to client:', {
        edgeId,
        questionId: question.que_id,
        difficulty: question.difficulty
      });

      socket.emit('edge_question', {
        edgeId,
        question: {
          id: question.que_id,
          content: question.que_content,
          difficulty: question.difficulty,
          testcase: question.testcase
        },
        targetNode: session.getTargetNode(edgeId, session.players.get(playerId)?.currentNode)
      });

    } catch (error) {
      console.error('Error handling edge click:', error);
      socket.emit('edge_error', { message: 'Failed to get edge question' });
    }
  });

  // Handle disconnection with reconnection support
  socket.on('disconnect', async () => {
    try {
      const disconnectedPlayer = getPlayerFromSocket(socket.id);
      
      if (disconnectedPlayer) {
        const { sessionId, playerId } = disconnectedPlayer;
        const session = await getOrCreateSession(sessionId);
        const player = session.getPlayerData(playerId);
        
        if (player) {
          console.log(`⚠️ Player ${player.playerName} disconnected from session ${sessionId}`);
          
          // Mark player as disconnected but don't remove yet
          session.updatePlayer(playerId, {
            socketId: null,
            isConnected: false,
            disconnectedAt: new Date().toISOString()
          });
          
          // Initialize session timeout map if not exists
          if (!disconnectTimeouts.has(sessionId)) {
            disconnectTimeouts.set(sessionId, new Map());
          }
          const sessionTimeouts = disconnectTimeouts.get(sessionId);
          
          // Set timeout to remove player after 30 seconds
          const timeoutId = setTimeout(async () => {
            try {
              const currentSession = await getOrCreateSession(sessionId);
              const currentPlayer = currentSession.getPlayerData(playerId);
              
              // Only remove if still disconnected
              if (currentPlayer && !currentPlayer.socketId) {
                console.log(`🗑️ Removing disconnected player ${player.playerName} after timeout`);
                currentSession.removePlayer(playerId);
                
                // Notify remaining players
                io.to(sessionId).emit('player_removed', {
                  playerId,
                  playerName: player.playerName,
                  reason: 'timeout'
                });
                
                // Broadcast updated game state
                broadcastGameState(sessionId, currentSession, io, {
                  event: 'player_removed',
                  removedPlayer: playerId
                });
                
                // Clean up timeout reference
                sessionTimeouts.delete(playerId);
                if (sessionTimeouts.size === 0) {
                  disconnectTimeouts.delete(sessionId);
                }
                
                // Check if we need to cancel auto-start
                const connectedPlayers = Array.from(currentSession.players.values())
                  .filter(p => !!p.socketId);
                if (connectedPlayers.length < REQUIRED_PLAYERS) {
                  cancelAutoStartIfScheduled(sessionId);
                  cancelLobbySelectionTimer(sessionId);
                }
              }
            } catch (error) {
              console.error('Error in disconnect timeout handler:', error);
            }
          }, 30000); // 30 second timeout
          
          // Store timeout reference
          sessionTimeouts.set(playerId, timeoutId);
          
          // Notify other players about disconnect
          socket.to(sessionId).emit('player_disconnected', {
            playerId,
            playerName: player.playerName,
            canReconnect: true,
            message: `${player.playerName} disconnected (can reconnect within 30s)`
          });
          
          // Update game state for all players
          broadcastGameState(sessionId, session, io, {
            event: 'player_disconnected',
            disconnectedPlayer: playerId
          });
        }
      }
    } catch (error) {
      console.error('Error handling disconnect:', error);
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
          // Cancel any disconnect timeout since player is leaving intentionally
          if (disconnectTimeouts.has(sessionId)) {
            const sessionTimeouts = disconnectTimeouts.get(sessionId);
            if (sessionTimeouts.has(playerId)) {
              clearTimeout(sessionTimeouts.get(playerId));
              sessionTimeouts.delete(playerId);
            }
          }
          
          // Remove player from session
          session.removePlayer(playerId);
          
          // Notify other players
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
          
          // Check if we need to cancel auto-start
          const connectedNow = Array.from(session.players.values()).filter(p => !!p.socketId);
          if (connectedNow.length < REQUIRED_PLAYERS) {
            cancelAutoStartIfScheduled(sessionId);
            cancelLobbySelectionTimer(sessionId);
          }
          
          console.log(`Player ${playerId} left session ${sessionId}`);
        }
      }
    } catch (error) {
      console.error('Error handling leave_game:', error);
    }
  });
}); // End of io.on('connection')

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

// Judge0 API endpoints for code execution
app.post('/api/judge0/run', async (req, res) => {
  try {
    const { code, language, input } = req.body;
    
    if (!code || !language) {
      return res.status(400).json({ error: 'Code and language are required' });
    }

    if (!judge0Service.isConfigured()) {
      return res.status(503).json({ error: 'Judge0 API not configured' });
    }

    const result = await judge0Service.submitCode(code, language, input || '');
    res.json(result);
  } catch (error) {
    console.error('Judge0 run error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/judge0/test', async (req, res) => {
  try {
    const { code, language, testCases } = req.body;
    
    if (!code || !language || !testCases) {
      return res.status(400).json({ error: 'Code, language, and testCases are required' });
    }

    if (!judge0Service.isConfigured()) {
      return res.status(503).json({ error: 'Judge0 API not configured' });
    }

    const results = await judge0Service.runTestCases(code, language, testCases);
    res.json(results);
  } catch (error) {
    console.error('Judge0 test error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/judge0/languages', (req, res) => {
  try {
    const languages = judge0Service.getSupportedLanguages();
    res.json({ languages });
  } catch (error) {
    console.error('Judge0 languages error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/judge0/status', (req, res) => {
  try {
    const isConfigured = judge0Service.isConfigured();
    res.json({ 
      configured: isConfigured,
      message: isConfigured ? 'Judge0 API is configured' : 'Judge0 API key not found'
    });
  } catch (error) {
    console.error('Judge0 status error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Health check endpoint for Render
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    activeSessions: sessionCache.size,
    connectedClients: io.engine.clientsCount,
    judge0Configured: judge0Service.isConfigured()
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
  
  // Clean up all timers before shutdown
  for (const sessionId of gameTimers.keys()) {
    stopGameTimer(sessionId);
  }
  for (const sessionId of zoneLoops.keys()) {
    stopZoneLoop(sessionId);
  }
  for (const sessionId of autoStartTimers.keys()) {
    cancelAutoStartIfScheduled(sessionId);
  }
  for (const sessionId of lobbySelectionTimers.keys()) {
    cancelLobbySelectionTimer(sessionId);
  }
  
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
