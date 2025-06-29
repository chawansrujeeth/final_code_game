const { Server } = require("socket.io");
const http = require("http");
const { createClient } = require('@supabase/supabase-js');

// Use environment variables compatible with frontend naming
const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL;
const SUPABASE_KEY = process.env.REACT_APP_SUPABASE_ANON_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end("Team duel server is running!");
});
const io = new Server(server, { cors: { origin: "*" } });

// --- User ↔ Socket mapping ---
let userSockets = {}; // userId: socket

// --- Lobby and Room State (in-memory, but sync with Supabase) ---
let lobby = [];
let rooms = {};

// --- Helper Functions ---
async function syncLobbyToSupabase() {
  await supabase.from('cfduel_lobby').upsert(lobby.map(p => ({ user_id: p.userId, name: p.name })));
}
async function loadLobbyFromSupabase() {
  const { data } = await supabase.from('cfduel_lobby').select('*');
  lobby = data ? data.map(p => ({ userId: p.user_id, name: p.name })) : [];
}
async function syncRoomsToSupabase() {
  await supabase.from('cfduel_rooms').upsert(Object.entries(rooms).map(([roomId, room]) => ({
    room_id: roomId,
    team_a: room.teamA.map(p => p.userId),
    team_b: room.teamB.map(p => p.userId),
    state: room.state,
    status: room.status
  })));
}
async function loadRoomsFromSupabase() {
  const { data } = await supabase.from('cfduel_rooms').select('*');
  if (data) {
    rooms = {};
    data.forEach(r => {
      rooms[r.room_id] = {
        teamA: r.team_a.map(userId => ({ userId, name: '', socket: null })),
        teamB: r.team_b.map(userId => ({ userId, name: '', socket: null })),
        state: r.state,
        status: r.status
      };
    });
  }
}

function createRoom(teamA, teamB) {
  const roomId = "room_" + Math.random().toString(36).slice(2, 10);
  rooms[roomId] = {
    teamA: teamA.map(p => ({ userId: p.userId, name: p.name, socket: p.socket })),
    teamB: teamB.map(p => ({ userId: p.userId, name: p.name, socket: p.socket })),
    state: { codeA: '', codeB: '' },
    status: 'active',
  };
  return roomId;
}

function getLobbyList() {
  return lobby.map(p => ({ userId: p.userId, name: p.name }));
}

// --- Socket Events ---
io.on("connection", (socket) => {
  // On connect, try to recover user session
  socket.on("reconnect_user", async ({ userId }) => {
    userSockets[userId] = socket;
    // Find if user is in a room
    await loadRoomsFromSupabase();
    for (const [roomId, room] of Object.entries(rooms)) {
      let team = null;
      if (room.teamA.some(p => p.userId === userId)) team = 'A';
      if (room.teamB.some(p => p.userId === userId)) team = 'B';
      if (team) {
        socket.join(roomId + "_" + team);
        socket.emit("team_assignment", {
          roomId,
          teamId: team,
          teamMembers: room[team === 'A' ? 'teamA' : 'teamB'].map(p => ({ userId: p.userId, name: p.name })),
          opponents: room[team === 'A' ? 'teamB' : 'teamA'].map(p => ({ userId: p.userId, name: p.name }))
        });
        break;
      }
    }
  });

  // Join lobby
  socket.on("join_lobby", async ({ userId, name }) => {
    userSockets[userId] = socket;
    if (!lobby.find(p => p.userId === userId)) {
      lobby.push({ socket, userId, name });
      await syncLobbyToSupabase();
    }
    io.emit("lobby_update", getLobbyList());
  });

  // Leave lobby
  socket.on("leave_lobby", async ({ userId }) => {
    lobby = lobby.filter(p => p.userId !== userId);
    await syncLobbyToSupabase();
    io.emit("lobby_update", getLobbyList());
  });

  // Create team duel room
  socket.on("create_team_duel", async ({ teamA, teamB }) => {
    lobby = lobby.filter(p => ![...teamA, ...teamB].some(sel => sel.userId === p.userId));
    await syncLobbyToSupabase();
    // Find sockets
    const teamAPlayers = teamA.map(sel => ({ ...sel, socket: userSockets[sel.userId] || socket }));
    const teamBPlayers = teamB.map(sel => ({ ...sel, socket: userSockets[sel.userId] || socket }));
    const roomId = "room_" + Math.random().toString(36).slice(2, 10);
    rooms[roomId] = {
      teamA: teamAPlayers,
      teamB: teamBPlayers,
      state: { codeA: '', codeB: '' },
      status: 'active',
    };
    await syncRoomsToSupabase();
    // Join rooms and notify
    teamAPlayers.forEach(player => {
      player.socket.join(roomId + "_A");
      player.socket.emit("team_assignment", {
        roomId,
        teamId: "A",
        teamMembers: teamAPlayers.map(p => ({ userId: p.userId, name: p.name })),
        opponents: teamBPlayers.map(p => ({ userId: p.userId, name: p.name }))
      });
    });
    teamBPlayers.forEach(player => {
      player.socket.join(roomId + "_B");
      player.socket.emit("team_assignment", {
        roomId,
        teamId: "B",
        teamMembers: teamBPlayers.map(p => ({ userId: p.userId, name: p.name })),
        opponents: teamAPlayers.map(p => ({ userId: p.userId, name: p.name }))
      });
    });
    io.emit("lobby_update", getLobbyList());
  });

  // Invitation relay
  socket.on("invite_player", ({ to, from }) => {
    const target = userSockets[to];
    if (target) target.emit("team_invite", { from });
  });

  socket.on("invite_response", ({ to, from, accepted }) => {
    const target = userSockets[to];
    if (target) target.emit("invite_response", { from, accepted });
  });

  socket.on("kick_player", ({ leader, target }) => {
    const tgt = userSockets[target];
    if (tgt) tgt.emit("kicked", { by: leader });
  });

  // Voice signalling for WebRTC (team voice chat)
  socket.on("voice-signal", ({ to, from, signal, room }) => {
    const target = userSockets[to];
    if (target) {
      target.emit("voice-signal", { from, signal, room });
    }
  });

  // Team code update
  socket.on("team_code_update", async ({ code, roomId, teamId }) => {
    if (rooms[roomId]) {
      rooms[roomId].state[teamId === 'A' ? 'codeA' : 'codeB'] = code;
      await syncRoomsToSupabase();
      io.to(roomId + "_" + teamId).emit("team_code_update", { code });
    }
  });

  // Get lobby list
  socket.on("get_lobby", async () => {
    await loadLobbyFromSupabase();
    socket.emit("lobby_update", getLobbyList());
  });

  // Disconnect handling
  socket.on("disconnect", async () => {
    // Remove from lobby
    for (const userId in userSockets) {
      if (userSockets[userId] === socket) {
        delete userSockets[userId];
        lobby = lobby.filter(p => p.userId !== userId);
        await syncLobbyToSupabase();
        break;
      }
    }
    // Remove from rooms (optional: handle reconnection logic)
    Object.keys(rooms).forEach(roomId => {
      ['teamA', 'teamB'].forEach(team => {
        rooms[roomId][team] = rooms[roomId][team].filter(p => p.socket !== socket);
      });
    });
    await syncRoomsToSupabase();
    io.emit("lobby_update", getLobbyList());
  });
});

// On server start, load state from Supabase and then start server
(async () => {
  await loadLobbyFromSupabase();
  await loadRoomsFromSupabase();

  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
})();
