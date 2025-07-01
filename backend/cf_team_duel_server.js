const { Server } = require("socket.io");
const http = require("http");
const { createClient } = require('@supabase/supabase-js');

// Use environment variables compatible with frontend naming
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end("Team duel server is running!");
});
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
let userSockets = {}; // userId: socket

// --- Lobby and Room State (in-memory, but sync with Supabase) ---
let lobby = [];
let rooms = {};

// --- Pending matchmaking state ---
// pendingSubteams[size] = array of subteams (each subteam = { players: [] })
let pendingSubteams = {};
// waitingFullTeams[size] = array of full teams (each fullTeam = players[] length == size)
let waitingFullTeams = {};

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
  const { data, error } = await supabase.from('profiles').select('id, name').in('id', userIds);
  if (error) {
    console.error("Error fetching profiles:", error);
    return {};
  }
  const profilesMap = {};
  data.forEach(p => { profilesMap[p.id] = p.name; });
  return profilesMap;
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

  // -----------------------------------------------------------------
  // Flexible matchmaking with desired team size.
  // Client emits `create_game_team` with { team, desiredSize }
  // We merge sub-teams to reach desiredSize, then wait for another
  // full team of same size to start a match.
  // -----------------------------------------------------------------
  socket.on("create_game_team", async ({ team, desiredSize }) => {
    // Remove team members from lobby while they wait
    lobby = lobby.filter(p => !team.some(sel => sel.userId === p.userId));
    await syncLobbyToSupabase();

        // Map to player objects including socket ref (leave null if socket unknown)
    const subPlayers = team.map(sel => ({ ...sel, socket: userSockets[sel.userId] || null }));

    // Init bucket structures if missing
    if (!pendingSubteams[desiredSize]) pendingSubteams[desiredSize] = [];
    if (!waitingFullTeams[desiredSize]) waitingFullTeams[desiredSize] = [];

    // If caller already provides a full-sized roster, treat as full team directly.
    if (subPlayers.length === desiredSize) {
      waitingFullTeams[desiredSize].push(subPlayers);
    } else {
      // Otherwise, treat as sub-team to be merged later
      pendingSubteams[desiredSize].push({ players: subPlayers });
    }
    await syncMatchmakingToSupabase();

    // Helper: attempt to build a full team by merging smaller sub-teams
    function tryBuildFullTeam(size) {
      const bucket = pendingSubteams[size];
      if (!bucket || bucket.length === 0) return null;
      let collected = [];
      let removeCount = 0;
      for (const sub of bucket) {
        if (collected.length + sub.players.length <= size) {
          collected = collected.concat(sub.players);
          removeCount++;
          if (collected.length === size) break;
        } else {
          break; // can't fit this subteam; keep waiting
        }
      }
      if (collected.length === size) {
        bucket.splice(0, removeCount);
        return collected;
      }
      return null;
    }

    // If we added a sub-team, try to assemble full team(s)
    if (subPlayers.length !== desiredSize) {
      let newTeam;
      while ((newTeam = tryBuildFullTeam(desiredSize))) {
        waitingFullTeams[desiredSize].push(newTeam);
      }
    }

    // After any update, persist
    await syncMatchmakingToSupabase();

    // Notify each subteam player they are waiting
    subPlayers.forEach(p => {
       const sock = p.socket || userSockets[p.userId];
       if (sock) sock.emit("waiting_opponent", { message: `Looking for ${desiredSize}-player opponent team…` });
     });

    // If we now have two full teams, create match
    if (waitingFullTeams[desiredSize].length >= 2) {
      const teamAPlayers = waitingFullTeams[desiredSize].shift();
      const teamBPlayers = waitingFullTeams[desiredSize].shift();
      const roomId = "room_" + Math.random().toString(36).slice(2, 10);

      rooms[roomId] = {
        teamA: teamAPlayers,
        teamB: teamBPlayers,
        state: { codeA: '', codeB: '' },
        status: 'active',
      };
      await syncRoomsToSupabase();

      // Notify players
      const notify = (playersArr, teamId, opp) => {
        playersArr.forEach(player => {
          const sock = player.socket || userSockets[player.userId];
          if (!sock) return; // player currently offline
          // keep latest socket reference
          player.socket = sock;
          sock.join(roomId + "_" + teamId);
          sock.emit("team_assignment", {
            roomId,
            teamId,
            teamMembers: playersArr.map(p => ({ userId: p.userId, name: p.name })),
            opponents: opp.map(p => ({ userId: p.userId, name: p.name }))
          });
        });
      };
      notify(teamAPlayers, "A", teamBPlayers);
      notify(teamBPlayers, "B", teamAPlayers);
      // After pairing remove from waiting lists already done; sync again
      await syncMatchmakingToSupabase();
    }

    io.emit("lobby_update", getLobbyList());
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
  socket.on("invite_player", ({ to, from, teamIds = [] }) => {
    const target = userSockets[to];
    if (target) target.emit("team_invite", { from, teamIds });
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
    const tgt = userSockets[target];
    if (tgt) tgt.emit("kicked", { by: leader });
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
