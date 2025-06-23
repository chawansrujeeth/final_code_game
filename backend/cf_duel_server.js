const { Server } = require('socket.io');
const http = require('http');
const axios = require('axios');

const EASY_PROBLEMS = [
  { contestId: 1, index: "A", name: "Theatre Square" },
  { contestId: 4, index: "A", name: "Watermelon" },
  { contestId: 71, index: "A", name: "Way Too Long Words" },
  { contestId: 231, index: "A", name: "Team" },
  { contestId: 158, index: "A", name: "Next Round" }
];

const server = http.createServer();
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

let waiting = null; // { socket, userId, handle }
let rooms = {}; // roomId: { users: [socket1, socket2], problem, startTime }

function randomRoomId() {
  return 'cfroom_' + Math.random().toString(36).substr(2, 9);
}

io.on('connection', (socket) => {
  socket.on('join_cf_matchmaking', ({ userId, handle }) => {
    if (waiting && waiting.userId !== userId) {
      // Pair with waiting user
      const roomId = randomRoomId();
      const problem = EASY_PROBLEMS[Math.floor(Math.random() * EASY_PROBLEMS.length)];
      const startTime = Date.now();
      rooms[roomId] = {
        users: [waiting.socket, socket],
        handles: [waiting.handle, handle],
        problem,
        startTime
      };
      waiting.socket.join(roomId);
      socket.join(roomId);
      // Emit duel_start to both
      io.to(roomId).emit('cf_duel_start', {
        roomId,
        users: [waiting.handle, handle],
        problem,
        startTime
      });
      // Start polling Codeforces API for winner
      pollForWinner(roomId);
      waiting = null;
    } else {
      // Wait for another user
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
      if (solved1 && solved2) {
        // Both solved, who first?
        winner = solved1.creationTimeSeconds < solved2.creationTimeSeconds ? handle1 : handle2;
      } else if (solved1) {
        winner = handle1;
      } else if (solved2) {
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