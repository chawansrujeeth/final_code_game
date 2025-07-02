const { Server } = require("socket.io");
const http = require("http");
const { createClient } = require('@supabase/supabase-js');
const express = require('express');
const cors = require('cors');

// Use environment variables
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

// Simple in-memory storage
const userSockets = {}; // userId -> socket
const lobby = []; // users in lobby
const teams = {}; // teamId -> { leader, members: [user objects], status: 'forming'|'queued'|'matched' }
const rooms = {}; // roomId -> { teamA, teamB, status: 'active'|'expired', createdAt, timer }

// Helper functions
function generateId() {
  return Math.random().toString(36).substr(2, 9);
}

async function getUserName(userId) {
  try {
    const { data } = await supabase
      .from('profiles')
      .select('name')
      .eq('user_id', userId)
      .single();
    return data?.name || userId;
  } catch {
    return userId;
  }
}

function findUserTeam(userId) {
  for (const [teamId, team] of Object.entries(teams)) {
    if (team.members.some(m => m.userId === userId)) {
      return { teamId, team };
    }
  }
  return null;
}

function cleanupExpiredRooms() {
  const now = Date.now();
  for (const [roomId, room] of Object.entries(rooms)) {
    if (now - room.createdAt > 5 * 60 * 1000) { // 5 minutes
      console.log(`[cleanup] Removing expired room ${roomId}`);
      
      // Notify all players
      [...room.teamA, ...room.teamB].forEach(player => {
        const socket = userSockets[player.userId];
        if (socket) {
          socket.emit('room_expired', { message: 'Room expired after 5 minutes' });
        }
      });
      
      delete rooms[roomId];
    }
  }
}

// Run cleanup every minute
setInterval(cleanupExpiredRooms, 60000);

io.on("connection", (socket) => {
  console.log(`[connect] Socket ${socket.id} connected`);

  // User joins lobby
  socket.on("join_lobby", async ({ userId, name }) => {
    console.log(`[lobby] ${userId} (${name}) joining lobby`);
    
    userSockets[userId] = socket;
    
    // Remove from any existing team
    const existingTeam = findUserTeam(userId);
    if (existingTeam) {
      const { teamId, team } = existingTeam;
      team.members = team.members.filter(m => m.userId !== userId);
      if (team.members.length === 0) {
        delete teams[teamId];
      }
    }
    
    // Remove ALL instances of this user from lobby (fix duplicates)
    let foundIndex;
    while ((foundIndex = lobby.findIndex(u => u.userId === userId)) !== -1) {
      lobby.splice(foundIndex, 1);
    }
    
    // Add to lobby only once
    const userName = await getUserName(userId);
    lobby.push({ userId, name: userName, socket });
    
    console.log(`[lobby] Current lobby:`, lobby.map(u => u.userId));
    
    // Broadcast lobby update
    io.emit("lobby_update", lobby.map(u => ({ userId: u.userId, name: u.name })));
  });

  // Create team
  socket.on("create_team", async ({ leaderId, memberIds }) => {
    console.log(`[team] ${leaderId} creating team with members:`, memberIds);
    
    const teamId = generateId();
    const allIds = [leaderId, ...memberIds];
    
    // Get user names
    const members = [];
    for (const userId of allIds) {
      const name = await getUserName(userId);
      members.push({ userId, name });
    }
    
    teams[teamId] = {
      leader: leaderId,
      members,
      status: 'forming'
    };
    
    // Remove team members from lobby
    allIds.forEach(userId => {
      const index = lobby.findIndex(u => u.userId === userId);
      if (index !== -1) {
        lobby.splice(index, 1);
      }
    });
    
    // Notify team members
    members.forEach(member => {
      const memberSocket = userSockets[member.userId];
      if (memberSocket) {
        memberSocket.emit('team_created', {
          teamId,
          leader: leaderId,
          members,
          isLeader: member.userId === leaderId
        });
      }
    });
    
    io.emit("lobby_update", lobby.map(u => ({ userId: u.userId, name: u.name })));
  });

  // Start matchmaking
  socket.on("start_matchmaking", ({ teamId }) => {
    const team = teams[teamId];
    if (!team) return;
    
    console.log(`[matchmaking] Team ${teamId} starting matchmaking`);
    team.status = 'queued';
    
    // Find another queued team
    const otherTeams = Object.entries(teams).filter(([id, t]) => 
      id !== teamId && t.status === 'queued' && t.members.length === team.members.length
    );
    
    if (otherTeams.length > 0) {
      const [otherTeamId, otherTeam] = otherTeams[0];
      
      // Create match
      const roomId = generateId();
      const now = Date.now();
      
      rooms[roomId] = {
        teamA: team.members,
        teamB: otherTeam.members,
        status: 'active',
        createdAt: now,
        timer: setTimeout(() => {
          cleanupExpiredRooms();
        }, 5 * 60 * 1000) // 5 minutes
      };
      
      // Update team status
      team.status = 'matched';
      otherTeam.status = 'matched';
      
      console.log(`[match] Created room ${roomId} with teams ${teamId} vs ${otherTeamId}`);
      
      // Notify all players
      team.members.forEach(member => {
        const memberSocket = userSockets[member.userId];
        if (memberSocket) {
          memberSocket.emit('match_found', {
            roomId,
            teamId: 'A',
            teammates: team.members,
            opponents: otherTeam.members
          });
        }
      });
      
      otherTeam.members.forEach(member => {
        const memberSocket = userSockets[member.userId];
        if (memberSocket) {
          memberSocket.emit('match_found', {
            roomId,
            teamId: 'B', 
            teammates: otherTeam.members,
            opponents: team.members
          });
        }
      });
      
    } else {
      // Still waiting
      team.members.forEach(member => {
        const memberSocket = userSockets[member.userId];
        if (memberSocket) {
          memberSocket.emit('waiting_match', { message: 'Looking for opponent team...' });
        }
      });
    }
  });

  // Join room (when user navigates to duel page)
  socket.on("join_room", ({ roomId, userId }) => {
    const room = rooms[roomId];
    if (!room) {
      socket.emit('room_not_found');
      return;
    }
    
    // Find user's team
    const isTeamA = room.teamA.some(p => p.userId === userId);
    const isTeamB = room.teamB.some(p => p.userId === userId);
    
    if (!isTeamA && !isTeamB) {
      socket.emit('not_in_room');
      return;
    }
    
    const teamId = isTeamA ? 'A' : 'B';
    const teammates = isTeamA ? room.teamA : room.teamB;
    const opponents = isTeamA ? room.teamB : room.teamA;
    
    socket.join(`room_${roomId}_${teamId}`);
    
    console.log(`[room] ${userId} joined room ${roomId} as team ${teamId}`);
    
    socket.emit('room_joined', {
      roomId,
      teamId,
      teammates,
      opponents,
      timeRemaining: Math.max(0, 5 * 60 * 1000 - (Date.now() - room.createdAt))
    });
  });

  // Code collaboration
  socket.on("code_update", ({ roomId, teamId, code }) => {
    console.log(`[code] Team ${teamId} in room ${roomId} updated code`);
    socket.to(`room_${roomId}_${teamId}`).emit('code_updated', { code });
  });

  // Disconnect
  socket.on("disconnect", () => {
    console.log(`[disconnect] Socket ${socket.id} disconnected`);
    
    // Remove from userSockets
    for (const [userId, userSocket] of Object.entries(userSockets)) {
      if (userSocket === socket) {
        delete userSockets[userId];
        
        // Remove from lobby
        const lobbyIndex = lobby.findIndex(u => u.userId === userId);
        if (lobbyIndex !== -1) {
          lobby.splice(lobbyIndex, 1);
          io.emit("lobby_update", lobby.map(u => ({ userId: u.userId, name: u.name })));
        }
        
        break;
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Team Duel Server running on port ${PORT}`);
});
