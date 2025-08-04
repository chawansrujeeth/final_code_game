// backend/battle_royale_server.js
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
  }
});

app.use(cors());
app.use(express.json());

// Store active game sessions and their used questions
const gameSessions = new Map();

// Game session structure
class GameSession {
  constructor(sessionId) {
    this.sessionId = sessionId;
    this.players = new Map(); // playerId -> player data
    this.usedQuestions = new Set(); // Set of question IDs already used
    this.createdAt = new Date();
  }

  addPlayer(playerId, playerData) {
    this.players.set(playerId, {
      ...playerData,
      currentNode: `PLAYER_${playerId}`,
      currentZone: 'spawn',
      health: 100,
      questionsAnswered: 0
    });
  }

  removePlayer(playerId) {
    this.players.delete(playerId);
  }

  markQuestionUsed(questionId) {
    this.usedQuestions.add(questionId);
  }

  isQuestionUsed(questionId) {
    return this.usedQuestions.has(questionId);
  }

  getPlayerData(playerId) {
    return this.players.get(playerId);
  }

  updatePlayer(playerId, updates) {
    const player = this.players.get(playerId);
    if (player) {
      Object.assign(player, updates);
      this.players.set(playerId, player);
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

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);

  // Join game session
  socket.on('join_battle_royale', (data) => {
    const { sessionId, playerId, playerName } = data;
    
    // Create session if it doesn't exist
    if (!gameSessions.has(sessionId)) {
      gameSessions.set(sessionId, new GameSession(sessionId));
    }

    const session = gameSessions.get(sessionId);
    session.addPlayer(playerId, { 
      socketId: socket.id, 
      playerName,
      playerId 
    });

    socket.join(sessionId);
    socket.sessionId = sessionId;
    socket.playerId = playerId;

    // Send current game state to all players in session
    io.to(sessionId).emit('game_state_update', {
      players: Array.from(session.players.values()),
      sessionId
    });

    console.log(`Player ${playerId} joined session ${sessionId}`);
  });

  // Request question for edge traversal
  socket.on('request_question', async (data) => {
    const { sessionId, playerId, difficulty, edgeId } = data;
    
    if (!gameSessions.has(sessionId)) {
      socket.emit('error', { message: 'Game session not found' });
      return;
    }

    const session = gameSessions.get(sessionId);
    const usedQuestionIds = Array.from(session.usedQuestions);

    try {
      const question = await getRandomQuestion(difficulty, usedQuestionIds);
      
      if (!question) {
        socket.emit('error', { 
          message: `No available ${difficulty} questions found` 
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
        edgeId
      });

      console.log(`Sent ${difficulty} question ${question.que_id} to player ${playerId}`);
    } catch (error) {
      console.error('Error handling question request:', error);
      socket.emit('error', { message: 'Failed to fetch question' });
    }
  });

  // Submit answer
  socket.on('submit_answer', async (data) => {
    const { sessionId, playerId, questionId, answer, targetNode } = data;
    
    if (!gameSessions.has(sessionId)) {
      socket.emit('error', { message: 'Game session not found' });
      return;
    }

    const session = gameSessions.get(sessionId);
    const player = session.getPlayerData(playerId);

    if (!player) {
      socket.emit('error', { message: 'Player not found in session' });
      return;
    }

    try {
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
        session.updatePlayer(playerId, {
          currentNode: targetNode,
          currentZone: getZoneFromNode(targetNode),
          questionsAnswered: player.questionsAnswered + 1
        });

        socket.emit('answer_result', {
          correct: true,
          message: 'Correct! Moving to next position.',
          newPosition: targetNode
        });

        // Check win condition
        if (targetNode === 'TARGET') {
          io.to(sessionId).emit('game_over', {
            winner: playerId,
            winnerName: player.playerName,
            message: `${player.playerName} reached the center and won!`
          });
        }
      } else {
        // Wrong answer - lose health
        const newHealth = Math.max(0, player.health - 10);
        session.updatePlayer(playerId, {
          health: newHealth
        });

        socket.emit('answer_result', {
          correct: false,
          message: 'Wrong answer! Lost 10 health.',
          healthLost: 10,
          newHealth
        });

        // Check if player is eliminated
        if (newHealth <= 0) {
          io.to(sessionId).emit('player_eliminated', {
            playerId,
            playerName: player.playerName,
            message: `${player.playerName} has been eliminated!`
          });
        }
      }

      // Broadcast updated game state
      io.to(sessionId).emit('game_state_update', {
        players: Array.from(session.players.values()),
        sessionId
      });

      console.log(`Player ${playerId} answered question ${questionId}: ${isCorrect ? 'CORRECT' : 'WRONG'}`);
    } catch (error) {
      console.error('Error validating answer:', error);
      socket.emit('error', { message: 'Failed to validate answer' });
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);
    
    if (socket.sessionId && socket.playerId) {
      const session = gameSessions.get(socket.sessionId);
      if (session) {
        session.removePlayer(socket.playerId);
        
        // If session is empty, clean it up
        if (session.players.size === 0) {
          gameSessions.delete(socket.sessionId);
          console.log(`Cleaned up empty session: ${socket.sessionId}`);
        } else {
          // Notify remaining players
          io.to(socket.sessionId).emit('game_state_update', {
            players: Array.from(session.players.values()),
            sessionId: socket.sessionId
          });
        }
      }
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
app.get('/api/session/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const session = gameSessions.get(sessionId);
  
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  res.json({
    sessionId,
    playerCount: session.players.size,
    players: Array.from(session.players.values()),
    questionsUsed: session.usedQuestions.size,
    createdAt: session.createdAt
  });
});

// API endpoint to create new session
app.post('/api/create-session', (req, res) => {
  const sessionId = generateSessionId();
  const session = new GameSession(sessionId);
  gameSessions.set(sessionId, session);
  
  res.json({ sessionId });
});

// Generate unique session ID
function generateSessionId() {
  return 'BR_' + Math.random().toString(36).substr(2, 9).toUpperCase();
}

// Clean up old sessions periodically (every 30 minutes)
setInterval(() => {
  const now = new Date();
  const maxAge = 30 * 60 * 1000; // 30 minutes

  for (const [sessionId, session] of gameSessions.entries()) {
    if (now - session.createdAt > maxAge && session.players.size === 0) {
      gameSessions.delete(sessionId);
      console.log(`Cleaned up old session: ${sessionId}`);
    }
  }
}, 30 * 60 * 1000);

const PORT = process.env.BATTLE_ROYALE_PORT || 5003;
server.listen(PORT, () => {
  console.log(`Battle Royale server running on port ${PORT}`);
  console.log(`WebSocket endpoint: ws://localhost:${PORT}`);
});

module.exports = { app, server, io };
