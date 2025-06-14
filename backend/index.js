const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();
const http = require('http');
const { Server } = require('socket.io');

const app = express();
app.use(cors());
app.use(express.json());

const JUDGE0_URL = 'https://judge0-ce.p.rapidapi.com/submissions';
const JUDGE0_HOST = 'judge0-ce.p.rapidapi.com';
const JUDGE0_KEY = process.env.JUDGE0_KEY || 'YOUR_RAPIDAPI_KEY'; // Replace with your key or use .env

// Health check
app.get('/', (req, res) => {
  res.send('Backend is running');
});

// Run code endpoint
app.post('/run', async (req, res) => {
  const { source_code, language_id, stdin, expected_output, cpu_time_limit } = req.body;
  try {
    // Submit code to Judge0
    const submission = await axios.post(JUDGE0_URL, {
      source_code,
      language_id,
      stdin: stdin || '',
      expected_output: expected_output || '',
      cpu_time_limit: cpu_time_limit || 2,
    }, {
      headers: {
        'X-RapidAPI-Key': JUDGE0_KEY,
        'X-RapidAPI-Host': JUDGE0_HOST,
        'Content-Type': 'application/json',
      },
    });

    const token = submission.data.token;

    // Poll for result
    let result;
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 1000));
      const resPoll = await axios.get(`${JUDGE0_URL}/${token}`, {
        headers: {
          'X-RapidAPI-Key': JUDGE0_KEY,
          'X-RapidAPI-Host': JUDGE0_HOST,
        },
      });
      result = resPoll.data;
      if (result.status && result.status.id >= 3) break; // 3: Done
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Store waiting users and active duels
let waitingUsers = [];
let duels = {};

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  // User requests to join matchmaking
  socket.on('join_matchmaking', (userData) => {
    // userData: { userId, level, username }
    waitingUsers.push({ socket, ...userData });
    matchUsers();
  });

  // Handle duel submission
  socket.on('duel_submission', ({ roomId, user }) => {
    if (duels[roomId] && !duels[roomId].winner) {
      duels[roomId].winner = user;
      io.to(roomId).emit('duel_result', { winner: user });
    }
  });

  // Handle user disconnect
  socket.on('disconnect', () => {
    waitingUsers = waitingUsers.filter(u => u.socket.id !== socket.id);
    // Optionally: handle disconnect from active duel
    console.log('User disconnected:', socket.id);
  });
});

function matchUsers() {
  // Simple: match first two users of similar level (expand as needed)
  if (waitingUsers.length >= 2) {
    const [user1, user2] = waitingUsers.splice(0, 2);
    const roomId = `duel_${user1.userId}_${user2.userId}_${Date.now()}`;
    duels[roomId] = { users: [user1, user2], started: false };
    user1.socket.join(roomId);
    user2.socket.join(roomId);
    // Assign a problem (placeholder)
    const problem = { id: 1, title: 'Sample Problem', description: 'Solve X', difficulty: 'easy' };
    io.to(roomId).emit('duel_start', { roomId, users: [user1.username, user2.username], problem });
    duels[roomId].started = true;
  }
}

const PORT = process.env.PORT || 5051;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

