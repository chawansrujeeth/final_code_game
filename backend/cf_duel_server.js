const { Server } = require('socket.io');
const http = require('http');

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
      if (rooms[roomId].users.includes(socket)) {
        delete rooms[roomId];
      }
    }
  });
});

const PORT = process.env.PORT || 5051;
server.listen(PORT, () => {
  console.log(`Codeforces Duel server running on port ${PORT}`);
}); 