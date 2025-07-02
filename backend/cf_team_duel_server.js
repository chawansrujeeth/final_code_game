const { Server } = require("socket.io");
const http = require("http");
const { createClient } = require('@supabase/supabase-js');
const express = require('express');
const cors = require('cors');
const profilesRouter = require('./profiles_api');
const friendsRouter = require('./friends_api');

// Use environment variables compatible with frontend naming
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const app = express();
app.use(cors({
  origin: [
    "https://final-code-game.vercel.app",
    "http://localhost:3000"
  ],
  credentials: true
}));
app.use(express.json());

// Mount API routers
app.use('/api/profile', profilesRouter);
app.use('/api/friends', friendsRouter);

app.get('/', (_req, res) => res.send('Team duel server is running!'));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: [
      "https://final-code-game.vercel.app",
      "http://localhost:3000"
    ],
    methods: ["GET", "POST"],
    credentials: true
  }
});

// --- User ↔ Socket mapping ---
function attachSocket(userId, socket) {
  const prev = userSockets[userId];
  if (prev && prev.id !== socket.id) {
    try { prev.disconnect(true); } catch (_) {}
  }
  userSockets[userId] = socket;
}
let userSockets = {}; // userId: socket

// --- Lobby and Room State (in-memory, but sync with Supabase) ---
let lobby = [];
let rooms = {};

// --- Pending matchmaking state (kept for backward compatibility) ---
let pendingSubteams = {}; // unused in new Supabase flow
let waitingFullTeams = {}; // unused in new Supabase flow

// --- New leader-centric matchmaking ---
const leaderTeams = new Map(); // leaderId -> team data with names
const queuedLeaders = []; // FIFO of leaderIds waiting for opponent

function popTwoLeaders() {
  if (queuedLeaders.length >= 2) {
    const [a, b] = queuedLeaders.splice(0, 2);
    return [a, b];
  }
  return null;
}

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
    const allUserIds = new Set();
    data.forEach(r => {
      if(r.team_a) r.team_a.forEach(uid => allUserIds.add(uid));
      if(r.team_b) r.team_b.forEach(uid => allUserIds.add(uid));
    });

    const profiles = await fetchProfiles(Array.from(allUserIds));

    data.forEach(r => {
      rooms[r.room_id] = {
        teamA: r.team_a ? r.team_a.map(userId => ({ userId, name: profiles[userId] || 'Player', socket: null })) : [],
        teamB: r.team_b ? r.team_b.map(userId => ({ userId, name: profiles[userId] || 'Player', socket: null })) : [],
        state: r.state,
        status: r.status
      };
    });
  }
}

// Helper to fetch user profiles by IDs
async function fetchProfiles(userIds) {
  if (!userIds || userIds.length === 0) return {};
  const { data, error } = await supabase.from('profiles').select('user_id, name').in('user_id', userIds);
  if (error) {
    console.error("Error fetching profiles:", error);
    return {};
  }
  const profilesMap = {};
  data.forEach(p => { profilesMap[p.user_id] = p.name; });
  return profilesMap;
}

// Helper to ensure every player object has a display name
async function ensureNames(playersArr) {
  const missingIds = playersArr.filter(p => !p.name || p.name === 'Player').map(p => p.userId);
  if (missingIds.length) {
    const profs = await fetchProfiles(missingIds);
    playersArr.forEach(pl => {
      if (!pl.name || pl.name === 'Player') {
        pl.name = profs[pl.userId] || pl.name || pl.userId;
      }
    });
  }
}

// --- Matchmaking queue persistence (Supabase) ---
async function syncMatchmakingToSupabase() {
  const rows = [];
  Object.entries(pendingSubteams).forEach(([size, subs]) => {
    subs.forEach((sub, idx) => {
      rows.push({ key: `sub_${size}_${idx}`, kind: 'sub', desired_size: Number(size), team_ids: sub.players.map(p => p.userId) });
    });
  });
  Object.entries(waitingFullTeams).forEach(([size, teams]) => {
    teams.forEach((team, idx) => {
      rows.push({ key: `full_${size}_${idx}`, kind: 'full', desired_size: Number(size), team_ids: team.map(p => p.userId) });
    });
  });
  // replace contents to keep source of truth
  await supabase.from('cfduel_matchmaking').delete().neq('key', '');
  if (rows.length) await supabase.from('cfduel_matchmaking').upsert(rows);
}

async function loadMatchmakingFromSupabase() {
  const { data } = await supabase.from('cfduel_matchmaking').select('*');
  pendingSubteams = {};
  waitingFullTeams = {};
  if (!data) return;

  const allUserIds = new Set();
  data.forEach(row => {
    if(row.team_ids) row.team_ids.forEach(uid => allUserIds.add(uid));
  });

  const profiles = await fetchProfiles(Array.from(allUserIds));

  data.forEach(row => {
    const size = row.desired_size;
    const players = row.team_ids ? row.team_ids.map(uid => ({ userId: uid, name: profiles[uid] || 'Player', socket: null })) : [];
    if (row.kind === 'sub') {
      if (!pendingSubteams[size]) pendingSubteams[size] = [];
      pendingSubteams[size].push({ players });
    } else {
      if (!waitingFullTeams[size]) waitingFullTeams[size] = [];
      waitingFullTeams[size].push(players);
    }
  });
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

// Remove a user from every in-memory room; delete room if empty
function removeUserFromAllRooms(userId) {
  for (const [rid, r] of Object.entries(rooms)) {
    const beforeA = r.teamA.length;
    const beforeB = r.teamB.length;
    r.teamA = r.teamA.filter(p => p.userId !== userId);
    r.teamB = r.teamB.filter(p => p.userId !== userId);
    if (!r.teamA.length && !r.teamB.length) {
      delete rooms[rid];
      console.log('[room]', rid, 'deleted (empty)');
    } else if (r.teamA.length !== beforeA || r.teamB.length !== beforeB) {
      console.log('[room]', rid, 'removed user', userId);
    }
  }
}

function getLobbyList() {
  return lobby.map(p => ({ userId: p.userId, name: p.name }));
}

// --- Socket Events ---
io.on("connection", (socket) => {
  // On connect, try to recover user session
  socket.on("reconnect_user", async ({ userId }) => {
    attachSocket(userId, socket);
    // Find if user is in a room
    await loadRoomsFromSupabase();
    for (const [roomId, room] of Object.entries(rooms)) {
      let team = null;
      if (room.teamA.some(p => p.userId === userId)) team = 'A';
      if (room.teamB.some(p => p.userId === userId)) team = 'B';
      if (team) {
        socket.join(roomId + "_" + team);
        console.log(`[room:${roomId}] reconnect emit to`, userId, 'team', team);
        socket.emit("team_assignment", {
          roomId,
          teamId: team,
          teamMembers: room[team === 'A' ? 'teamA' : 'teamB'].map(p => ({ userId: p.userId, name: p.name })),
          opponents: room[team === 'A' ? 'teamB' : 'teamA'].map(p => ({ userId: p.userId, name: p.name }))
        });
        return; // done, found room
      }
    }

    // Check pending subteams / waitingFullTeams for this user
    for (const size of Object.keys(pendingSubteams)) {
      // Search pending subteams
      const subArr = pendingSubteams[size] || [];
      for (const sub of subArr) {
        if (sub.players.some(p => p.userId === userId)) {
          socket.emit("team_sync", { teamIds: sub.players.map(p => p.userId) });
          socket.emit("waiting_opponent", { message: `Looking for ${size}-player opponent team…` });
          return;
        }
      }
    }
    for (const size of Object.keys(waitingFullTeams)) {
      const fullArr = waitingFullTeams[size] || [];
      for (const full of fullArr) {
        if (full.some(p => p.userId === userId)) {
          socket.emit("team_sync", { teamIds: full.map(p => p.userId) });
          socket.emit("waiting_opponent", { message: `Waiting for ${size}-player opponent team…` });
          return;
        }
      }
    }
  });

  // Join lobby
  socket.on("join_lobby", async ({ userId, name }) => {
    // Ignore lobby join if user is already in an active room
    const stillInRoom = Object.values(rooms).some(r =>
      r.teamA.concat(r.teamB).some(p => p.userId === userId)
    );
    if (stillInRoom) {
      // Assume stale room; force removal and allow lobby join
      console.log('[lobby] user', userId, 'was in stale room, clearing');
      removeUserFromAllRooms(userId);
    }
    removeUserFromAllRooms(userId);
    console.log('[lobby] join request', userId, name);
    attachSocket(userId, socket);
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

  // Simplified matchmaking with leader-centric approach
  socket.on("create_game_team", async ({ team, desiredSize }) => {
    console.log('[match] create_game_team from', team.map(p=>p.userId), 'desired', desiredSize);
    const leaderId = team[0]?.userId;
    
    // Make sure the caller's socket is stored
    if (leaderId) attachSocket(leaderId, socket);
    if (!leaderId) return;
    
    // Store complete team data (including names)
    leaderTeams.set(leaderId, team);
    if (!queuedLeaders.includes(leaderId)) queuedLeaders.push(leaderId);

    // Try to match two teams
    const pair = popTwoLeaders();
    if (pair) {
      const [leadA, leadB] = pair;
      const roomId = "room_" + Math.random().toString(36).slice(2, 10);
      const teamAData = leaderTeams.get(leadA) || [];
      const teamBData = leaderTeams.get(leadB) || [];

      // Create player objects with proper names
      const teamAPlayers = teamAData.map(p => ({ 
        userId: p.userId, 
        name: p.name || 'Player',
        socket: userSockets[p.userId] || null 
      }));
      
      const teamBPlayers = teamBData.map(p => ({ 
        userId: p.userId, 
        name: p.name || 'Player',
        socket: userSockets[p.userId] || null 
      }));
      
      // Ensure names for all players
      await ensureNames([...teamAPlayers, ...teamBPlayers]);

      rooms[roomId] = { 
        teamA: teamAPlayers, 
        teamB: teamBPlayers, 
        status: 'active', 
        state: { codeA: '', codeB: '' } 
      };

      // Notify leaders about match found
      const sockA = userSockets[leadA];
      const sockB = userSockets[leadB];
      const teamAIds = teamAPlayers.map(p => p.userId);
      const teamBIds = teamBPlayers.map(p => p.userId);
      if (sockA) sockA.emit("match_found", { roomId, yourTeam: teamAIds, oppTeam: teamBIds });
      if (sockB) sockB.emit("match_found", { roomId, yourTeam: teamBIds, oppTeam: teamAIds });
      
      // Don't clean up leader data yet - we need it for summon_team
      // Will clean up after team assignment is complete
    } else {
      // Still waiting for opponent
      team.forEach(p => {
        const sock = userSockets[p.userId];
        if (sock) sock.emit('waiting_opponent', { message: `Looking for ${desiredSize}-player opponent team…` });
      });
    }
  });

  // Create team duel room (legacy: used by TeamCFDuel where both teams are chosen on client)
  socket.on("create_team_duel", async ({ teamA, teamB }) => {
    lobby = lobby.filter(p => ![...teamA, ...teamB].some(sel => sel.userId === p.userId));
    await syncLobbyToSupabase();
    // Find sockets
    const teamAPlayers = teamA.map(sel => ({ ...sel, socket: userSockets[sel.userId] || null }));
    const teamBPlayers = teamB.map(sel => ({ ...sel, socket: userSockets[sel.userId] || null }));
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
      const sock = player.socket || userSockets[player.userId];
      if (!sock) return; // skip if player offline
      // keep latest reference
      player.socket = sock;
      sock.join(roomId + "_A");
      sock.emit("team_assignment", {
        roomId,
        teamId: "A",
        teamMembers: teamAPlayers.map(p => ({ userId: p.userId, name: p.name })),
        opponents: teamBPlayers.map(p => ({ userId: p.userId, name: p.name }))
      });
    });
    teamBPlayers.forEach(player => {
      const sock = player.socket || userSockets[player.userId];
      if (!sock) return;
      player.socket = sock;
      sock.join(roomId + "_B");
      sock.emit("team_assignment", {
        roomId,
        teamId: "B",
        teamMembers: teamBPlayers.map(p => ({ userId: p.userId, name: p.name })),
        opponents: teamAPlayers.map(p => ({ userId: p.userId, name: p.name }))
      });
    });
    io.emit("lobby_update", getLobbyList());
  });

  // Invitation relay
  socket.on("invite_player", ({ to, from, teamIds = [], leaderId }) => {
    const target = userSockets[to];
    if (target) target.emit("team_invite", { from, teamIds, leaderId });
  });

  socket.on("invite_response", ({ to, from, accepted, teamIds = [] }) => {
    const target = userSockets[to];
    if (target) target.emit("invite_response", { from, accepted });
    if (accepted) {
      const full = Array.from(new Set([...teamIds, from.userId]));
      full.forEach(uid => {
        const s = userSockets[uid];
        if (s) s.emit("team_sync", { teamIds: full });
      });
    }
  });

  socket.on("kick_player", ({ leader, target }) => {
    // Verify leader is actually leader of target's team by simple heuristic: first id in team list sent previously.
    const tgtSocket = userSockets[target];
    if (tgtSocket) tgtSocket.emit("kicked", { by: leader });
  });

  socket.on("leave_team", ({ userId, teamIds = [] }) => {
    // Broadcast updated team to remaining members
    teamIds.forEach(id => {
      const s = userSockets[id];
      if (s) s.emit("team_sync", { teamIds });
    });
  });

  // Leader tells server to have teammates join created room
  socket.on("summon_team", async ({ roomId, teamIds = [] }) => {
    const room = rooms[roomId];
    if (!room) return;

    // Attach sockets if missing and broadcast join_room (includes leader)
    teamIds.forEach(uid => {
      const sock = userSockets[uid];
      if (sock) {
        // keep socket reference for later
        const pArr = room.teamA.concat(room.teamB);
        const player = pArr.find(p => p.userId === uid);
        if (player) player.socket = sock;
        sock.emit("join_room", { roomId });
      }
    });

    // Ensure we have names for all players before assignment
    await ensureNames(room.teamA);
    await ensureNames(room.teamB);

    const sendAssignment = (player) => {
      const sock = player.socket || userSockets[player.userId];
      if (!sock) return;
      const isTeamA = room.teamA.some(p => p.userId === player.userId);
      const teamId = isTeamA ? 'A' : 'B';
      const teamMembers = (isTeamA ? room.teamA : room.teamB).map(p => ({ userId: p.userId, name: p.name }));
      const opponents = (isTeamA ? room.teamB : room.teamA).map(p => ({ userId: p.userId, name: p.name }));
      
      console.log(`[assignment] Sending to ${player.userId} (${player.name}):`, {
        roomId,
        teamId,
        teamMembers,
        opponents
      });
      
      sock.join(roomId + '_' + teamId);
      sock.emit('team_assignment', {
        roomId,
        teamId,
        teamMembers,
        opponents
      });
    };

    // Delay team_assignment a bit so that teammates who just navigated to the duel page
    // have time to mount their TeamCFDuel component and register socket listeners. Without
    // this, the assignment could be emitted while they are still on the lobby page and
    // will therefore be missed, resulting in the collaborative editor never loading.
    setTimeout(() => {
      room.teamA.forEach(sendAssignment);
      room.teamB.forEach(sendAssignment);
      
      // Clean up leader data after assignment is complete
      const allPlayerIds = [...room.teamA, ...room.teamB].map(p => p.userId);
      for (const [leaderId, teamData] of leaderTeams.entries()) {
        if (teamData.some(p => allPlayerIds.includes(p.userId))) {
          leaderTeams.delete(leaderId);
        }
      }
    }, 200); // 200 ms is ample for a route change + component mount
  });

  // Voice signalling for WebRTC (team voice chat)
  
  // Sync full team membership to all members
  socket.on("sync_team", ({ teamIds }) => {
    teamIds.forEach(id => {
      const tgt = userSockets[id];
      if (tgt) tgt.emit("team_sync", { teamIds });
    });
  });

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
      console.log(`[room:${roomId}] code update from team ${teamId}, length`, code.length);
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
  await loadMatchmakingFromSupabase();

  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
})();
