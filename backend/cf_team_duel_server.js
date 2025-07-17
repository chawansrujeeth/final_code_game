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

// Polyfill fetch for Node <18
const fetch = global.fetch || ((...args) => import('node-fetch').then(({ default: f }) => f(...args)));
app.use(cors({
  origin: [
    "https://final-code-game.vercel.app",
    "http://localhost:3000"
  ],
  credentials: true
}));
app.use(express.json());

const server = http.createServer(app);

// Debug: confirm Judge0 RapidAPI key detection
const hasRapid = !!(process.env.JUDGE0_KEY_1 || process.env.JUDGE0_KEY);
console.log('[INIT] Judge0 RapidAPI key', hasRapid ? 'detected' : 'NOT found');
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
const rooms = {}; // roomId -> { teamA, teamB, status: 'active'|'expired'|'finished', createdAt, timer, problem }

// --- Rating system ---
// Everyone starts at 800 if rating is null / missing in DB
// Winners +30, losers -30
async function updateTeamRatings(winnerMembers = [], loserMembers = []) {
  // Helper to safely fetch current rating and update
  async function adjust(userId, delta) {
    try {
      const { data, error } = await supabase.from('profiles').select('rating').eq('user_id', userId).single();
      if (error) {
        console.error('[rating] fetch error', error);
        return;
      }
      let rating = (data && data.rating != null) ? data.rating : 800;
      rating += delta;
      await supabase.from('profiles').update({ rating }).eq('user_id', userId);
    } catch (e) {
      console.error('[rating] unexpected', e);
    }
  }
  await Promise.all([
    ...winnerMembers.map(m => adjust(m.userId, 30)),
    ...loserMembers.map(m => adjust(m.userId, -30))
  ]);
}

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

// Helper function to broadcast lobby update with team status
function broadcastLobbyUpdate() {
  const lobbyWithTeamStatus = lobby.map(u => {
    const userTeam = findUserTeam(u.userId);
    return {
      userId: u.userId,
      name: u.name,
      inTeam: !!userTeam,
      teamId: userTeam?.teamId || null
    };
  });
  io.emit("lobby_update", lobbyWithTeamStatus);
}

// Helper function to broadcast all online users
function broadcastOnlineUsers() {
  const onlineUsers = Object.entries(userSockets).map(([userId, socket]) => {
    // Find user info from lobby or teams
    let userName = userId; // fallback
    
    // Check if user is in lobby
    const lobbyUser = lobby.find(u => u.userId === userId);
    if (lobbyUser) {
      userName = lobbyUser.name;
    } else {
      // Check if user is in any team
      for (const team of Object.values(teams)) {
        const teamMember = team.members.find(m => m.userId === userId);
        if (teamMember) {
          userName = teamMember.name;
          break;
        }
      }
    }
    
    const userTeam = findUserTeam(userId);
    const isInLobby = lobby.some(u => u.userId === userId);
    
    return {
      userId,
      name: userName,
      inTeam: !!userTeam,
      teamId: userTeam?.teamId || null,
      inLobby: isInLobby,
      status: isInLobby ? 'lobby' : userTeam ? 'in_team' : 'online'
    };
  }).filter(user => user.userId); // Remove any invalid entries
  
  io.emit("online_users_update", onlineUsers);
}

// Return a random Codeforces problem from Supabase (fallback to a hard-coded example on error)
// Return a random Codeforces problem from Supabase (client-side random to avoid SQL randomness issues)
function parseCFUrl(url) {
  const match = url.match(/problem\/(\d+)\/([A-Za-z0-9]+)/) || url.match(/contest\/(\d+)\/problem\/([A-Za-z0-9]+)/);
  if (match) {
    return { contestId: Number(match[1]), index: match[2] };
  }
  return null;
}

async function getRandomProblem() {
  try {
    const { data, error } = await supabase
      .from('cf_problems')
      .select('problem_url, name');

    if (error || !data || data.length === 0) {
      // Fallback hard-coded example
      return { contestId: 231, index: 'A', name: 'Team Programming Contest' };
    }

    const p = data[Math.floor(Math.random() * data.length)];
    const parsed = parseCFUrl(p.problem_url);
    if (parsed) {
      return { ...parsed, name: p.name, link: p.problem_url };
    }
    // if parsing failed, fallback
    return { contestId: 231, index: 'A', name: 'Team Programming Contest', link: 'https://codeforces.com/problemset/problem/231/A' };
  } catch (err) {
    console.error('Error fetching random problem:', err);
    return { contestId: 231, index: 'A', name: 'Team Programming Contest' };
  }
}

// Helper to build a CF problem link from object
function cfProblemLink(problem) {
  return `https://codeforces.com/problemset/problem/${problem.contestId}/${problem.index}`;
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
      
      // If leader left, choose new leader if members remain
      if (team.leader === userId && team.members.length > 0) {
        team.leader = team.members[0].userId;
      }
      
      if (team.members.length === 0) {
        // Team disbanded
        delete teams[teamId];
      } else {
        // Notify remaining team members
        team.members.forEach(member => {
          const memberSocket = userSockets[member.userId];
          if (memberSocket) {
            memberSocket.emit('team_updated', {
              teamId,
              leader: team.leader,
              members: team.members
            });
          }
        });
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

    // Attach identity to socket for later reference in collaborative events
    socket.userId = userId;
    socket.userName = userName;
    
    console.log(`[lobby] Current lobby:`, lobby.map(u => u.userId));
    
    // Broadcast lobby update with team status
    broadcastLobbyUpdate();
    
    // Broadcast online users update
    broadcastOnlineUsers();
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
    
    broadcastLobbyUpdate();
    broadcastOnlineUsers();
  });

  // Leave team
  socket.on("leave_team", async ({ teamId, userId }) => {
    const team = teams[teamId];
    if (!team) return;

    // Remove member
    team.members = team.members.filter(m => m.userId !== userId);

    // If leader left, choose new leader if members remain
    if (team.leader === userId) {
      team.leader = team.members[0] ? team.members[0].userId : null;
    }

    // If no members left => disband team
    if (team.members.length === 0) {
      delete teams[teamId];
      io.emit('team_disbanded', { teamId });
    } else {
      // Otherwise broadcast updated team to remaining members
      team.members.forEach(member => {
        const memberSocket = userSockets[member.userId];
        if (memberSocket) {
          memberSocket.emit('team_updated', {
            teamId,
            leader: team.leader,
            members: team.members
          });
        }
      });
    }

    // Add the leaving user back to lobby
    const name = await getUserName(userId);
    lobby.push({ userId, name });
    broadcastLobbyUpdate();
    broadcastOnlineUsers();
  });

  // Start matchmaking
  socket.on("start_matchmaking", async ({ teamId }) => {
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

      // Pick random problem for this duel
      const problem = await getRandomProblem();
      
      
      rooms[roomId] = {
        teamA: team.members,
        teamB: otherTeam.members,
        status: 'active',
        leaderA: team.leader,
        leaderB: otherTeam.leader,
        problem,
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
            opponents: otherTeam.members,
            leaderId: team.leader,
            problem
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
            opponents: team.members,
            leaderId: otherTeam.leader,
            problem
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
      timeRemaining: Math.max(0, 5 * 60 * 1000 - (Date.now() - room.createdAt)),
      problem: room.problem,
      leaderId: teamId === 'A' ? room.leaderA : room.leaderB
    });
  });

  // Code collaboration (diff-based)
  // Solution submission – verify BOTH Codeforces verdict and local Judge0 sample
  socket.on('submit_solution', async ({ roomId, teamId, cfHandle, sourceCode, languageId }) => {
    const room = rooms[roomId];
    if (!room || room.status !== 'active') return;

    const expectedLeader = teamId === 'A' ? room.leaderA : room.leaderB;
    if (socket.userId !== expectedLeader) {
      socket.emit('submission_error', { message: 'Only team leader may submit' });
      return;
    }

    // ---- 1) Codeforces API check (latest 5 min) ----
    let cfAccepted = false;
    try {
      const resp = await fetch(`https://codeforces.com/api/user.status?handle=${cfHandle}&from=1&count=20`);
      const data = await resp.json();
      if (data.status === 'OK') {
        const fiveMinutesAgo = Math.floor(Date.now() / 1000) - 300;
        cfAccepted = data.result.some(
          (sub) =>
            sub.creationTimeSeconds >= fiveMinutesAgo &&
            sub.verdict === 'OK' &&
            sub.problem.contestId == room.problem.contestId &&
            sub.problem.index == room.problem.index
        );
      }
    } catch (e) {
      console.error('[submit_solution] CF API error', e);
      socket.emit('submission_error', { message: 'Codeforces API error' });
      return;
    }

    // ---- 2) Local Judge0 sample check ----
    let localPassed = false;
    try {
      // Obtain sample from Supabase cf_problems table
      let sample;
      try {
        const { data, error } = await supabase
          .from('cf_problems')
          .select('samples')
          .eq('problem_url', room.problem.link || cfProblemLink(room.problem))
          .single();
        if (error) throw error;
        if (data && Array.isArray(data.samples) && data.samples.length > 0) {
          sample = data.samples[0];
        }
      } catch (dbErr) {
        console.error('[submit_solution] Supabase sample fetch error', dbErr);
      }
      if (!sample || !sample.input || !sample.output) {
        socket.emit('submission_error', { message: 'No sample available for this problem' });
        return;
      }

      // Decide which Judge0 host to use
      const RAPID_KEY = process.env.JUDGE0_KEY_1 || process.env.JUDGE0_KEY;
      const JUDGE0_URL = RAPID_KEY
        ? 'https://judge0-ce.p.rapidapi.com/submissions?base64_encoded=false&wait=true'
        : 'https://api.judge0.com/submissions/?base64_encoded=false&wait=true';
      const headers = RAPID_KEY
        ? {
            'Content-Type': 'application/json',
            'X-RapidAPI-Key': RAPID_KEY,
            'X-RapidAPI-Host': 'judge0-ce.p.rapidapi.com',
          }
        : { 'Content-Type': 'application/json' };

      const submissionRes = await fetch(JUDGE0_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          source_code: sourceCode,
          language_id: languageId,
          stdin: sample.input,
        }),
      });
      const submissionData = await submissionRes.json();
      console.log('[DEBUG] Judge0 response', submissionData);
      // Judge0 status: 3 = Accepted
      if (submissionData.status && submissionData.status.id !== 3) {
        socket.emit('submission_error', { message: `Judge0 status: ${submissionData.status.description || submissionData.status.id}` });
        // Judge0 failed; localPassed remains false - opponent may win

      }
      const got = (submissionData.stdout || '').replace(/\r/g, '').trim();
      const expected = (sample.output || '').replace(/\r/g, '').trim();
      const normalize = (str) => str.replace(/\s+/g, ' ').trim();
      if (normalize(got) !== normalize(expected)) {
        // Fallback: try scraping live sample in case Supabase sample is outdated
        try {
          const { scrapeFirstSample } = require('./cf_random_util');
          const liveSample = await scrapeFirstSample(room.problem.link || cfProblemLink(room.problem));
          if (liveSample && liveSample.input && liveSample.output) {
            const liveRes = await fetch(JUDGE0_URL, {
              method: 'POST',
              headers,
              body: JSON.stringify({
                source_code: sourceCode,
                language_id: languageId,
                stdin: liveSample.input,
              }),
            });
            const liveData = await liveRes.json();
            const gotLive = normalize((liveData.stdout || ''));
            const expectedLive = normalize((liveSample.output || ''));
            if (liveData.status && liveData.status.id === 3 && gotLive === expectedLive) {
              localPassed = true;
            }
          }
        } catch {}
        if (!localPassed) {
          socket.emit('submission_error', { message: `Sample failed. Expected '${expected}', got '${got}'` });
          // keep localPassed false
        }
      } else {
        localPassed = true;
      }
    } catch (e) {
      console.error('[submit_solution] Judge0 error', e);
      socket.emit('submission_error', { message: 'Judge0 error / sample not passed' });
      // keep localPassed false but continue
    }

    // ---- Decide winner ----
    const declareWinner = async (winnerTeam) => {
      room.status = 'finished';
      clearTimeout(room.timer);
      const losersTeam = winnerTeam === 'A' ? 'B' : 'A';
      const winners = winnerTeam === 'A' ? room.teamA : room.teamB;
      const losers = winnerTeam === 'A' ? room.teamB : room.teamA;
      // Record match history
      try {
        const ratingDeltas = Object.fromEntries([
          ...winners.map(m => [m.userId, 30]),
          ...losers.map(m => [m.userId, -30])
        ]);
        await supabase.from('duel_history').insert({
          participants: [...winners.map(m => m.userId), ...losers.map(m => m.userId)],
          team_a_ids: room.teamA.map(m => m.userId),
          team_b_ids: room.teamB.map(m => m.userId),
          winner_team: winnerTeam,
          score_diff: 1,
          rating_deltas: ratingDeltas
        });
      } catch (e) {
        console.error('[history] insert failed', e);
      }
      await updateTeamRatings(winners, losers);
      io.to(`room_${roomId}_A`).emit('duel_finished', { winner: winnerTeam });
      io.to(`room_${roomId}_B`).emit('duel_finished', { winner: winnerTeam });
    };

    if (cfAccepted && localPassed) {
      // current team wins
      await declareWinner(teamId);
    } else {
      // opponent wins
      const other = teamId === 'A' ? 'B' : 'A';
      await declareWinner(other);
    }
  });

  // Voice signalling for WebRTC
  socket.on('voice-signal', ({ to, from, signal, room }) => {
    const target = userSockets[to];
    if (target) {
      target.emit('voice-signal', { from, signal, room });
    }
  });

  socket.on("code_update", ({ roomId, teamId, changes }) => {
    console.log(`[code] Team ${teamId} in room ${roomId} sent ${changes?.length || 0} edits`);
    socket.to(`room_${roomId}_${teamId}`).emit('code_updated', { 
      changes,
      userId: socket.userId,
      userName: socket.userName
    });
  });

  // Friend system handlers
  socket.on('send_friend_request', async ({ fromUserId, toUserId }) => {
    try {
      console.log(`[friend] Friend request from ${fromUserId} to ${toUserId}`);
      
      // Check if request already exists (in either direction)
      const { data: existing } = await supabase
        .from('friends')
        .select('*')
        .or(`and(user_id.eq.${fromUserId},friend_id.eq.${toUserId}),and(user_id.eq.${toUserId},friend_id.eq.${fromUserId})`)
        .maybeSingle();
      
      if (existing) {
        const message = existing.status === 'accepted' ? 'Already friends' : 'Friend request already sent';
        socket.emit('friend_request_error', { message });
        return;
      }
      
      // Create friend request
      const { error } = await supabase
        .from('friends')
        .insert({
          user_id: fromUserId,
          friend_id: toUserId,
          status: 'pending'
        });
      
      if (error) {
        console.error('[friend] Error creating friend request:', error);
        socket.emit('friend_request_error', { message: 'Failed to send friend request' });
        return;
      }
      
      // Get sender info
      const { data: senderProfile } = await supabase
        .from('profiles')
        .select('name')
        .eq('user_id', fromUserId)
        .maybeSingle();
      
      socket.emit('friend_request_sent', { toUserId });
      
      // Notify recipient if online
      const recipientSocket = userSockets[toUserId];
      if (recipientSocket) {
        recipientSocket.emit('friend_request_received', {
          fromUserId,
          fromName: senderProfile?.name || 'Unknown User'
        });
      }
      
    } catch (error) {
      console.error('[friend] Error in send_friend_request:', error);
      socket.emit('friend_request_error', { message: 'Server error' });
    }
  });
  
  socket.on('respond_friend_request', async ({ requestId, response, userId }) => {
    try {
      console.log(`[friend] Friend request response: ${response} for request ${requestId}`);
      
      // Update request status
      const { data: request, error: updateError } = await supabase
        .from('friends')
        .update({ status: response })
        .eq('id', requestId)
        .eq('friend_id', userId)
        .select('user_id, friend_id')
        .maybeSingle();
      
      if (updateError || !request) {
        socket.emit('friend_response_error', { message: 'Failed to update request' });
        return;
      }
      
      if (response === 'accepted') {
        // Notify both users
        socket.emit('friend_request_accepted', { friendUserId: request.user_id });
        
        const senderSocket = userSockets[request.user_id];
        if (senderSocket) {
          senderSocket.emit('friend_request_accepted', { friendUserId: request.friend_id });
        }
      }
      
      socket.emit('friend_response_success', { response });
      
    } catch (error) {
      console.error('[friend] Error in respond_friend_request:', error);
      socket.emit('friend_response_error', { message: 'Server error' });
    }
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
          broadcastLobbyUpdate();
        }
        
        // Always broadcast online users update when someone disconnects
        broadcastOnlineUsers();
        
        break;
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Team Duel Server running on port ${PORT}`);
});
