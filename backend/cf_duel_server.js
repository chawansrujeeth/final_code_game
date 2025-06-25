const { Server } = require('socket.io');
const http = require('http');
const axios = require('axios');

// Fetch a random problem from Supabase cf_problems table (only url and samples)
async function getRandomSupabaseProblem() {
  const { supabase } = require('./supabaseClient');
  // Get total count
  const { count, error: countError } = await supabase
    .from('cf_problems')
    .select('id', { count: 'exact', head: true });
  if (countError) throw countError;
  if (!count || count === 0) throw new Error('No problems in Supabase');
  // Pick a random offset
  const randomOffset = Math.floor(Math.random() * count);
  const { data, error } = await supabase
    .from('cf_problems')
    .select('problem_url,samples')
    .range(randomOffset, randomOffset)
    .single();
  if (error) throw error;
  return data;
}

const server = http.createServer();
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

let waiting = null; // { socket, userId, handle }
let rooms = {}; // roomId: { users: [socket1, socket2], problem, startTime, localPassed: { handle1: false, handle2: false } }

function randomRoomId() {
  return 'cfroom_' + Math.random().toString(36).substr(2, 9);
}

io.on('connection', (socket) => {
  socket.on('join_cf_matchmaking', async ({ userId, handle }) => {
    if (waiting && waiting.userId !== userId) {
      // Pair with waiting user
      const roomId = randomRoomId();
      // Fetch a random problem from Supabase
      const problem = await getRandomSupabaseProblem();
      const startTime = Date.now();
      rooms[roomId] = {
        users: [waiting.socket, socket],
        handles: [waiting.handle, handle],
        problem,
        startTime,
        localPassed: { [waiting.handle]: false, [handle]: false }
      };
      waiting.socket.join(roomId);
      socket.join(roomId);
      io.to(roomId).emit('cf_duel_start', {
        roomId,
        users: [waiting.handle, handle],
        problem,
        startTime
      });
      pollForWinner(roomId);
      waiting = null;
    } else {
      waiting = { socket, userId, handle };
      socket.emit('cf_waiting', { msg: 'Waiting for opponent...' });
    }
  });

  socket.on('disconnect', () => {
    // Remove from waiting if needed
    if (waiting && waiting.socket === socket) {
      waiting = null;
    }
    // Remove from rooms
    for (const roomId in rooms) {
      const room = rooms[roomId];
      if (room.users.includes(socket)) {
        // Find the other user
        const idx = room.users.indexOf(socket);
        const otherSocket = room.users[1 - idx];
        const winnerHandle = room.handles[1 - idx];
        // Notify the other user as winner
        if (otherSocket) {
          otherSocket.emit('cf_duel_winner', { winner: winnerHandle });
        }
        delete rooms[roomId];
      }
    }
  });

  socket.on('cf_code_update', ({ roomId, code, from }) => {
    console.log('[DEBUG] cf_code_update received:', { roomId, code, from });
    // Broadcast to the other user in the room
    if (rooms[roomId]) {
      rooms[roomId].users.forEach(s => {
        if (s !== socket) {
          console.log('[DEBUG] Emitting cf_code_receive to other user:', { code, from });
          s.emit('cf_code_receive', { code, from });
        }
      });
    }
  });

  // New: Listen for local pass event from frontend
  socket.on('cf_local_pass', ({ roomId, handle }) => {
    if (rooms[roomId] && rooms[roomId].localPassed) {
      rooms[roomId].localPassed[handle] = true;
      console.log(`[DEBUG] Local Judge0 pass for ${handle} in room ${roomId}`);
    }
  });
});

// Poll Codeforces API for first to solve
async function pollForWinner(roomId) {
  if (!rooms[roomId]) return;
  const { handles, problem, startTime } = rooms[roomId];
  const [handle1, handle2] = handles;
  const contestId = problem.contestId;
  const index = problem.index;
  let winner = null;
  let interval = setInterval(async () => {
    try {
      // Fetch submissions for both users
      const [res1, res2] = await Promise.all([
        axios.get(`https://codeforces.com/api/user.status?handle=${handle1}&from=1&count=20`),
        axios.get(`https://codeforces.com/api/user.status?handle=${handle2}&from=1&count=20`)
      ]);
      const solved1 = res1.data.result.find(sub =>
        sub.problem.contestId == contestId &&
        sub.problem.index == index &&
        sub.verdict === 'OK' &&
        sub.creationTimeSeconds * 1000 >= startTime
      );
      const solved2 = res2.data.result.find(sub =>
        sub.problem.contestId == contestId &&
        sub.problem.index == index &&
        sub.verdict === 'OK' &&
        sub.creationTimeSeconds * 1000 >= startTime
      );
      // Check localPassed for both users
      const localPassed = rooms[roomId]?.localPassed || {};
      if (solved1 && localPassed[handle1] && solved2 && localPassed[handle2]) {
        // Both solved and passed locally, who first?
        winner = solved1.creationTimeSeconds < solved2.creationTimeSeconds ? handle1 : handle2;
      } else if (solved1 && localPassed[handle1]) {
        winner = handle1;
      } else if (solved2 && localPassed[handle2]) {
        winner = handle2;
      }
      if (winner) {
        io.to(roomId).emit('cf_duel_winner', { winner });
        clearInterval(interval);
        delete rooms[roomId];
      }
    } catch (err) {
      // Ignore errors, try again next interval
    }
  }, 5000); // poll every 5 seconds
}

const PORT = process.env.PORT || 5051;
server.listen(PORT, () => {
  console.log(`Codeforces Duel server running on port ${PORT}`);
});