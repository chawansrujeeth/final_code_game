// backend/sockets/TeamDuelHandler.js
// Team-based Duel Socket Handler with collaborative features

const { v4: uuidv4 } = require('uuid');
const axios = require('axios');

class TeamDuelHandler {
  constructor(io, db, logger) {
    this.io = io;
    this.db = db;
    this.logger = logger;
    this.teams = new Map(); // teamId -> teamData
    this.matchmaking = new Map(); // teamId -> { teamData, joinedAt }
    this.activeMatches = new Map(); // matchId -> matchData
    this.userTeams = new Map(); // userId -> teamId
    this.userMatches = new Map(); // userId -> matchId
    this.pollingIntervals = new Map(); // matchId -> intervalId
  }

  /**
   * Initialize Team Duel socket handlers
   */
  initialize() {
    this.logger.info('Initializing Team Duel Handler');
  }

  /**
   * Handle socket connection
   */
  handleConnection(socket) {
    // Team management
    socket.on('team_duel:create_team', (data) => this.handleCreateTeam(socket, data));
    socket.on('team_duel:join_team', (data) => this.handleJoinTeam(socket, data));
    socket.on('team_duel:leave_team', () => this.handleLeaveTeam(socket));
    socket.on('team_duel:invite_member', (data) => this.handleInviteMember(socket, data));
    
    // Matchmaking
    socket.on('team_duel:join_queue', () => this.handleJoinQueue(socket));
    socket.on('team_duel:leave_queue', () => this.handleLeaveQueue(socket));
    
    // During match
    socket.on('team_duel:code_update', (data) => this.handleCodeUpdate(socket, data));
    socket.on('team_duel:message', (data) => this.handleTeamMessage(socket, data));
    socket.on('team_duel:assign_problem', (data) => this.handleAssignProblem(socket, data));
    socket.on('team_duel:submit_solution', (data) => this.handleSubmitSolution(socket, data));
    
    // Disconnection
    socket.on('disconnect', () => this.handleDisconnect(socket));
  }

  /**
   * Handle team creation
   */
  async handleCreateTeam(socket, { userId, teamName, maxSize = 3 }) {
    try {
      // Check if user is already in a team
      if (this.userTeams.has(userId)) {
        socket.emit('team_duel:error', {
          message: 'You are already in a team'
        });
        return;
      }

      const teamId = `team_${uuidv4()}`;
      const teamData = {
        teamId,
        name: teamName,
        leaderId: userId,
        members: [{
          userId,
          socket,
          username: socket.user?.username || 'Player',
          cfHandle: socket.user?.cfHandle,
          role: 'leader',
          status: 'ready'
        }],
        maxSize,
        createdAt: Date.now(),
        status: 'forming' // forming, ready, in_queue, in_match
      };

      this.teams.set(teamId, teamData);
      this.userTeams.set(userId, teamId);
      socket.userId = userId;
      socket.teamId = teamId;

      // Join team room
      socket.join(`team_${teamId}`);

      socket.emit('team_duel:team_created', {
        teamId,
        teamName,
        members: teamData.members.map(m => ({
          userId: m.userId,
          username: m.username,
          role: m.role,
          status: m.status
        }))
      });

      this.logger.info(`Team created: ${teamId} by user ${userId}`);
    } catch (error) {
      this.logger.error('Error creating team:', error);
      socket.emit('team_duel:error', {
        message: 'Failed to create team'
      });
    }
  }

  /**
   * Handle joining a team
   */
  async handleJoinTeam(socket, { userId, teamId, inviteCode }) {
    try {
      const team = this.teams.get(teamId);
      
      if (!team) {
        socket.emit('team_duel:error', {
          message: 'Team not found'
        });
        return;
      }

      if (team.members.length >= team.maxSize) {
        socket.emit('team_duel:error', {
          message: 'Team is full'
        });
        return;
      }

      if (this.userTeams.has(userId)) {
        socket.emit('team_duel:error', {
          message: 'You are already in a team'
        });
        return;
      }

      // Add member to team
      const newMember = {
        userId,
        socket,
        username: socket.user?.username || 'Player',
        cfHandle: socket.user?.cfHandle,
        role: 'member',
        status: 'ready'
      };

      team.members.push(newMember);
      this.userTeams.set(userId, teamId);
      socket.userId = userId;
      socket.teamId = teamId;

      // Join team room
      socket.join(`team_${teamId}`);

      // Notify all team members
      this.io.to(`team_${teamId}`).emit('team_duel:member_joined', {
        member: {
          userId: newMember.userId,
          username: newMember.username,
          role: newMember.role,
          status: newMember.status
        },
        teamSize: team.members.length
      });

      // Update team status if full
      if (team.members.length === team.maxSize) {
        team.status = 'ready';
        this.io.to(`team_${teamId}`).emit('team_duel:team_ready', {
          message: 'Team is full and ready for matchmaking'
        });
      }

      this.logger.info(`User ${userId} joined team ${teamId}`);
    } catch (error) {
      this.logger.error('Error joining team:', error);
      socket.emit('team_duel:error', {
        message: 'Failed to join team'
      });
    }
  }

  /**
   * Handle leaving a team
   */
  handleLeaveTeam(socket) {
    const userId = socket.userId;
    const teamId = this.userTeams.get(userId);
    
    if (!teamId) {
      socket.emit('team_duel:error', {
        message: 'You are not in a team'
      });
      return;
    }

    const team = this.teams.get(teamId);
    if (!team) return;

    // Remove member from team
    team.members = team.members.filter(m => m.userId !== userId);
    this.userTeams.delete(userId);
    
    // Leave team room
    socket.leave(`team_${teamId}`);

    // Handle team dissolution or leader change
    if (team.members.length === 0) {
      // Dissolve team
      this.teams.delete(teamId);
      this.logger.info(`Team ${teamId} dissolved`);
    } else {
      // Assign new leader if needed
      if (team.leaderId === userId) {
        team.leaderId = team.members[0].userId;
        team.members[0].role = 'leader';
      }

      // Notify remaining members
      this.io.to(`team_${teamId}`).emit('team_duel:member_left', {
        userId,
        newLeaderId: team.leaderId,
        teamSize: team.members.length
      });
    }

    socket.emit('team_duel:left_team', {
      message: 'You have left the team'
    });

    this.logger.info(`User ${userId} left team ${teamId}`);
  }

  /**
   * Handle joining matchmaking queue
   */
  async handleJoinQueue(socket) {
    const teamId = socket.teamId;
    const team = this.teams.get(teamId);

    if (!team) {
      socket.emit('team_duel:error', {
        message: 'You are not in a team'
      });
      return;
    }

    if (socket.userId !== team.leaderId) {
      socket.emit('team_duel:error', {
        message: 'Only team leader can start matchmaking'
      });
      return;
    }

    if (team.members.length < 2) {
      socket.emit('team_duel:error', {
        message: 'Need at least 2 members to start matchmaking'
      });
      return;
    }

    if (this.matchmaking.has(teamId)) {
      socket.emit('team_duel:error', {
        message: 'Team is already in queue'
      });
      return;
    }

    // Add to matchmaking
    this.matchmaking.set(teamId, {
      teamData: team,
      joinedAt: Date.now()
    });
    team.status = 'in_queue';

    // Notify team members
    this.io.to(`team_${teamId}`).emit('team_duel:queue_joined', {
      message: 'Team joined matchmaking queue',
      queueSize: this.matchmaking.size
    });

    // Try to find a match
    this.findTeamMatch(teamId);

    this.logger.info(`Team ${teamId} joined matchmaking queue`);
  }

  /**
   * Find a match for a team
   */
  async findTeamMatch(teamId) {
    const seekingTeam = this.matchmaking.get(teamId);
    if (!seekingTeam) return;

    for (const [otherTeamId, otherTeamData] of this.matchmaking) {
      if (otherTeamId === teamId) continue;

      // Match teams with similar size (within 1 member difference)
      const sizeDiff = Math.abs(
        seekingTeam.teamData.members.length - 
        otherTeamData.teamData.members.length
      );

      if (sizeDiff <= 1) {
        // Found a match!
        this.matchmaking.delete(teamId);
        this.matchmaking.delete(otherTeamId);
        
        await this.createTeamMatch(
          seekingTeam.teamData,
          otherTeamData.teamData
        );
        return;
      }
    }

    // No match found, keep waiting
    this.io.to(`team_${teamId}`).emit('team_duel:queue_update', {
      message: 'Searching for opponents...',
      queueSize: this.matchmaking.size
    });
  }

  /**
   * Create a team match
   */
  async createTeamMatch(team1, team2) {
    try {
      const matchId = `team_match_${uuidv4()}`;
      
      // Get problems for the match (one per team member on average)
      const totalPlayers = team1.members.length + team2.members.length;
      const numProblems = Math.ceil(totalPlayers / 2);
      const problems = await this.getMultipleProblems(numProblems);

      const matchData = {
        matchId,
        teams: [team1, team2],
        problems,
        problemAssignments: new Map(), // userId -> problemIndex
        solutions: new Map(), // userId -> { code, language, status }
        startTime: Date.now(),
        status: 'active',
        scores: {
          [team1.teamId]: 0,
          [team2.teamId]: 0
        },
        winner: null
      };

      // Store match data
      this.activeMatches.set(matchId, matchData);
      
      // Update team statuses
      team1.status = 'in_match';
      team2.status = 'in_match';

      // Map users to match
      [...team1.members, ...team2.members].forEach(member => {
        this.userMatches.set(member.userId, matchId);
      });

      // Join match room
      const matchRoom = `match_${matchId}`;
      [...team1.members, ...team2.members].forEach(member => {
        member.socket.join(matchRoom);
      });

      // Send match start event
      const matchInfo = {
        matchId,
        problems: problems.map(p => ({
          url: p.problem_url,
          samples: p.samples,
          difficulty: p.difficulty,
          tags: p.tags
        })),
        teams: [
          {
            teamId: team1.teamId,
            name: team1.name,
            members: team1.members.map(m => ({
              userId: m.userId,
              username: m.username,
              cfHandle: m.cfHandle
            }))
          },
          {
            teamId: team2.teamId,
            name: team2.name,
            members: team2.members.map(m => ({
              userId: m.userId,
              username: m.username,
              cfHandle: m.cfHandle
            }))
          }
        ],
        startTime: matchData.startTime
      };

      this.io.to(matchRoom).emit('team_duel:match_start', matchInfo);

      // Start polling for submissions
      this.startTeamPolling(matchId);

      // Save to database
      await this.saveTeamMatchToDatabase(matchData);

      this.logger.info(`Team match created: ${matchId}`);
    } catch (error) {
      this.logger.error('Error creating team match:', error);
      
      // Notify teams of error
      [...team1.members, ...team2.members].forEach(member => {
        member.socket.emit('team_duel:error', {
          message: 'Failed to create match'
        });
      });

      // Return teams to queue
      team1.status = 'ready';
      team2.status = 'ready';
    }
  }

  /**
   * Get multiple problems for a match
   */
  async getMultipleProblems(count) {
    const { data, error } = await this.db.query(
      `SELECT problem_url, samples, difficulty, tags
       FROM cf_problems 
       WHERE difficulty >= 800 AND difficulty <= 1600
       ORDER BY RANDOM()
       LIMIT $1`,
      [count]
    );

    if (error || !data || data.length === 0) {
      throw new Error('Failed to fetch problems');
    }

    return data;
  }

  /**
   * Handle code updates
   */
  handleCodeUpdate(socket, { matchId, code, language, problemIndex }) {
    const match = this.activeMatches.get(matchId);
    if (!match) return;

    const userId = socket.userId;
    const teamId = socket.teamId;
    
    // Find user's team
    const userTeam = match.teams.find(t => t.teamId === teamId);
    if (!userTeam) return;

    // Broadcast to team members only
    userTeam.members.forEach(member => {
      if (member.userId !== userId) {
        member.socket.emit('team_duel:teammate_code', {
          userId,
          username: socket.user?.username,
          code,
          language,
          problemIndex
        });
      }
    });

    // Store current solution
    match.solutions.set(userId, {
      code,
      language,
      problemIndex,
      timestamp: Date.now()
    });
  }

  /**
   * Handle team messages (chat)
   */
  handleTeamMessage(socket, { matchId, message }) {
    const match = this.activeMatches.get(matchId);
    if (!match) return;

    const userId = socket.userId;
    const teamId = socket.teamId;
    
    // Find user's team
    const userTeam = match.teams.find(t => t.teamId === teamId);
    if (!userTeam) return;

    // Broadcast to team members
    userTeam.members.forEach(member => {
      member.socket.emit('team_duel:team_message', {
        userId,
        username: socket.user?.username,
        message,
        timestamp: Date.now()
      });
    });
  }

  /**
   * Handle problem assignment
   */
  handleAssignProblem(socket, { matchId, userId, problemIndex }) {
    const match = this.activeMatches.get(matchId);
    if (!match) return;

    const teamId = socket.teamId;
    
    // Only team leader can assign problems
    const team = match.teams.find(t => t.teamId === teamId);
    if (!team || socket.userId !== team.leaderId) {
      socket.emit('team_duel:error', {
        message: 'Only team leader can assign problems'
      });
      return;
    }

    // Assign problem to user
    match.problemAssignments.set(userId, problemIndex);

    // Notify team
    team.members.forEach(member => {
      member.socket.emit('team_duel:problem_assigned', {
        userId,
        problemIndex,
        assignedBy: socket.userId
      });
    });

    this.logger.info(`Problem ${problemIndex} assigned to user ${userId} in match ${matchId}`);
  }

  /**
   * Handle solution submission
   */
  async handleSubmitSolution(socket, { matchId, problemIndex, passed }) {
    const match = this.activeMatches.get(matchId);
    if (!match) return;

    const userId = socket.userId;
    const teamId = socket.teamId;

    if (passed) {
      // Update team score
      match.scores[teamId] += 100; // Base score

      // Notify all players
      this.io.to(`match_${matchId}`).emit('team_duel:problem_solved', {
        teamId,
        userId,
        problemIndex,
        scores: match.scores
      });

      // Check for match end
      const maxScore = Math.max(...Object.values(match.scores));
      const requiredScore = match.problems.length * 100 * 0.6; // 60% of problems

      if (maxScore >= requiredScore) {
        const winnerTeamId = Object.keys(match.scores).find(
          tid => match.scores[tid] === maxScore
        );
        await this.endTeamMatch(matchId, winnerTeamId);
      }
    }
  }

  /**
   * Start polling for team submissions
   */
  startTeamPolling(matchId) {
    const interval = setInterval(async () => {
      try {
        await this.checkTeamSubmissions(matchId);
      } catch (error) {
        this.logger.error(`Error polling for team match ${matchId}:`, error);
      }
    }, 10000); // Poll every 10 seconds

    this.pollingIntervals.set(matchId, interval);

    // End match after 45 minutes
    setTimeout(() => {
      this.endTeamMatch(matchId, null, 'timeout');
    }, 45 * 60 * 1000);
  }

  /**
   * Check team submissions on Codeforces
   */
  async checkTeamSubmissions(matchId) {
    const match = this.activeMatches.get(matchId);
    if (!match || match.status !== 'active') {
      this.stopTeamPolling(matchId);
      return;
    }

    // Check submissions for all team members
    for (const team of match.teams) {
      for (const member of team.members) {
        if (!member.cfHandle) continue;

        try {
          const response = await axios.get(
            `https://codeforces.com/api/user.status?handle=${member.cfHandle}&from=1&count=10`
          );

          const submissions = response.data.result || [];
          
          // Check if any submission matches our problems
          for (const submission of submissions) {
            if (submission.verdict === 'OK' && 
                submission.creationTimeSeconds * 1000 >= match.startTime) {
              // Problem solved! Update score
              // (Implementation depends on problem matching logic)
            }
          }
        } catch (error) {
          // Ignore API errors
        }
      }
    }
  }

  /**
   * Stop polling for a match
   */
  stopTeamPolling(matchId) {
    const interval = this.pollingIntervals.get(matchId);
    if (interval) {
      clearInterval(interval);
      this.pollingIntervals.delete(matchId);
    }
  }

  /**
   * End a team match
   */
  async endTeamMatch(matchId, winnerTeamId, reason = 'completed') {
    const match = this.activeMatches.get(matchId);
    if (!match || match.status !== 'active') return;

    match.status = 'completed';
    match.winner = winnerTeamId;
    match.endTime = Date.now();

    // Stop polling
    this.stopTeamPolling(matchId);

    // Calculate final results
    const results = {
      matchId,
      winner: winnerTeamId,
      reason,
      duration: match.endTime - match.startTime,
      scores: match.scores,
      teams: match.teams.map(t => ({
        teamId: t.teamId,
        name: t.name,
        score: match.scores[t.teamId],
        members: t.members.map(m => ({
          userId: m.userId,
          username: m.username,
          problemsSolved: 0 // Calculate from solutions
        }))
      }))
    };

    // Notify all players
    this.io.to(`match_${matchId}`).emit('team_duel:match_end', results);

    // Update database
    await this.updateTeamMatchInDatabase(match);

    // Clean up
    [...match.teams[0].members, ...match.teams[1].members].forEach(member => {
      this.userMatches.delete(member.userId);
      member.socket.leave(`match_${matchId}`);
    });

    // Reset team statuses
    match.teams.forEach(team => {
      team.status = 'ready';
    });

    this.activeMatches.delete(matchId);

    this.logger.info(`Team match ended: ${matchId}, winner: ${winnerTeamId}`);
  }

  /**
   * Handle leaving queue
   */
  handleLeaveQueue(socket) {
    const teamId = socket.teamId;
    
    if (!this.matchmaking.has(teamId)) {
      socket.emit('team_duel:error', {
        message: 'Team is not in queue'
      });
      return;
    }

    const team = this.teams.get(teamId);
    if (!team) return;

    if (socket.userId !== team.leaderId) {
      socket.emit('team_duel:error', {
        message: 'Only team leader can leave queue'
      });
      return;
    }

    this.matchmaking.delete(teamId);
    team.status = 'ready';

    this.io.to(`team_${teamId}`).emit('team_duel:left_queue', {
      message: 'Team left matchmaking queue'
    });

    this.logger.info(`Team ${teamId} left matchmaking queue`);
  }

  /**
   * Handle disconnection
   */
  handleDisconnect(socket) {
    const userId = socket.userId;
    if (!userId) return;

    // Handle team removal
    const teamId = this.userTeams.get(userId);
    if (teamId) {
      this.handleLeaveTeam(socket);
    }

    // Handle active match
    const matchId = this.userMatches.get(userId);
    if (matchId) {
      const match = this.activeMatches.get(matchId);
      if (match) {
        // Notify team members
        const team = match.teams.find(t => 
          t.members.some(m => m.userId === userId)
        );
        if (team) {
          team.members.forEach(member => {
            if (member.userId !== userId) {
              member.socket.emit('team_duel:teammate_disconnected', {
                userId,
                username: socket.user?.username
              });
            }
          });
        }
      }
    }

    this.logger.info(`User ${userId} disconnected from team duel`);
  }

  /**
   * Save team match to database
   */
  async saveTeamMatchToDatabase(matchData) {
    try {
      await this.db.query(
        `INSERT INTO team_matches (
          match_id, team1_id, team2_id, problems, 
          status, start_time, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [
          matchData.matchId,
          matchData.teams[0].teamId,
          matchData.teams[1].teamId,
          JSON.stringify(matchData.problems),
          'active',
          new Date(matchData.startTime)
        ]
      );
    } catch (error) {
      this.logger.error('Error saving team match to database:', error);
    }
  }

  /**
   * Update team match in database
   */
  async updateTeamMatchInDatabase(matchData) {
    try {
      await this.db.query(
        `UPDATE team_matches 
         SET status = $1, winner_team_id = $2, end_time = $3, 
             final_scores = $4
         WHERE match_id = $5`,
        [
          'completed',
          matchData.winner,
          new Date(matchData.endTime),
          JSON.stringify(matchData.scores),
          matchData.matchId
        ]
      );
    } catch (error) {
      this.logger.error('Error updating team match in database:', error);
    }
  }
}

module.exports = TeamDuelHandler;
