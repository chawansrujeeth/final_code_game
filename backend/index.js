const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();
const http = require('http');
const { Server } = require('socket.io');
const getRandomSample = require('./cf_random_sample');
const { getRandomCFDuelProblem } = require('./cf_random_util');

const app = express();
app.use(cors());
app.use(express.json());

// Load multiple Judge0 keys from environment variables
const JUDGE0_KEYS = [
  process.env.JUDGE0_KEY_1,
  process.env.JUDGE0_KEY_2,
  process.env.JUDGE0_KEY_3
].filter(Boolean); // Remove any undefined keys
console.log('Loaded Judge0 keys:', JUDGE0_KEYS);

const JUDGE0_HOST = 'judge0-ce.p.rapidapi.com';
const JUDGE0_URL = 'https://judge0-ce.p.rapidapi.com/submissions';

// Health check
app.get('/', (req, res) => {
  res.send('Backend is running');
});

// Run code endpoint
app.post('/run', async (req, res) => {
  const { source_code, language_id, stdin, expected_output, cpu_time_limit } = req.body;
  let lastError = null;
  for (let i = 0; i < JUDGE0_KEYS.length; i++) {
    const JUDGE0_KEY = JUDGE0_KEYS[i];
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
      for (let j = 0; j < 10; j++) {
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
      return res.json(result);
    } catch (err) {
      // Only try next key if error is 500, 429, or 403
      if (
        err.response &&
        (
          err.response.status === 500 ||
          err.response.status === 429 ||
          err.response.status === 403
        )
      ) {
        lastError = err;
        continue;
      } else {
        // For other errors, log and return immediately
        console.error('Judge0 error:', err?.response?.data || err);
        return res.status(500).json({ error: err.message, details: err?.response?.data });
      }
    }
  }
  // If all keys fail
  console.error('All Judge0 keys failed. Last error:', lastError?.response?.data || lastError);
  return res.status(500).json({ error: lastError?.message || "All Judge0 keys failed", details: lastError?.response?.data });
});

// Debug endpoint to view Judge0 submission counters
app.get('/judge0-counter-status', (req, res) => {
  res.json({
    keys: JUDGE0_KEYS.map((key, i) => ({
      key: `JUDGE0_KEY_${i+1}`,
      used: submissionCounters[i],
      limit: SUBMISSION_LIMIT_PER_KEY
    })),
    currentKeyIndex: submissionCounters.findIndex(count => count < SUBMISSION_LIMIT_PER_KEY)
  });
});

// Add Codeforces random sample endpoint
app.get('/api/cf-random-sample', getRandomSample);

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

// Hardcoded problems array
const problems = [
  {
    id: 1,
    title: 'Sum Two Numbers',
    description: 'Write a program that reads two integers from input and prints their sum.',
    difficulty: 'easy',
    input: '2 3',
    expected_output: '5'
  },
  {
    id: 2,
    title: 'Print Hello',
    description: 'Print "Hello, World!" to the output.',
    difficulty: 'easy',
    input: '',
    expected_output: 'Hello, World!'
  }
];

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

async function matchUsers() {
  // Simple: match first two users of similar level (expand as needed)
  if (waitingUsers.length >= 2) {
    const [user1, user2] = waitingUsers.splice(0, 2);
    const roomId = `duel_${user1.userId}_${user2.userId}_${Date.now()}`;
    duels[roomId] = { users: [user1, user2], started: false };
    user1.socket.join(roomId);
    user2.socket.join(roomId);
    // Assign a random Codeforces problem with sample
    getRandomCFDuelProblem().then(problem => {
      io.to(roomId).emit('duel_start', {
        roomId,
        users: [user1.username, user2.username],
        problem
      });
      duels[roomId].started = true;
      duels[roomId].problem = problem;
    }).catch(err => {
      io.to(roomId).emit('duel_error', { error: 'Failed to fetch Codeforces problem: ' + err.message });
      // Optionally: clean up duel state
      delete duels[roomId];
    });
  }
}

const PORT = process.env.PORT || 5051;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

