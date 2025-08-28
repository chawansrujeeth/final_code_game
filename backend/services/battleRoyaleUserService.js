const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Map structure for the battle royale game
const MAP_STRUCTURE = {
  // Spawn nodes
  SPAWN_1: { ring: 'SPAWN', connections: ['R3_1'] },
  SPAWN_2: { ring: 'SPAWN', connections: ['R3_2'] },
  SPAWN_3: { ring: 'SPAWN', connections: ['R3_3'] },
  SPAWN_4: { ring: 'SPAWN', connections: ['R3_4'] },
  SPAWN_5: { ring: 'SPAWN', connections: ['R3_5'] },
  SPAWN_6: { ring: 'SPAWN', connections: ['R3_6'] },
  SPAWN_7: { ring: 'SPAWN', connections: ['R3_7'] },
  SPAWN_8: { ring: 'SPAWN', connections: ['R3_8'] },
  
  // Ring 3 (Outer) - Easy questions
  R3_1: { ring: 'R3', connections: ['R3_2', 'R3_8', 'R2_1', 'R2_8'] },
  R3_2: { ring: 'R3', connections: ['R3_1', 'R3_3', 'R2_1', 'R2_2'] },
  R3_3: { ring: 'R3', connections: ['R3_2', 'R3_4', 'R2_2', 'R2_3'] },
  R3_4: { ring: 'R3', connections: ['R3_3', 'R3_5', 'R2_3', 'R2_4'] },
  R3_5: { ring: 'R3', connections: ['R3_4', 'R3_6', 'R2_4', 'R2_5'] },
  R3_6: { ring: 'R3', connections: ['R3_5', 'R3_7', 'R2_5', 'R2_6'] },
  R3_7: { ring: 'R3', connections: ['R3_6', 'R3_8', 'R2_6', 'R2_7'] },
  R3_8: { ring: 'R3', connections: ['R3_7', 'R3_1', 'R2_7', 'R2_8'] },
  
  // Ring 2 (Middle) - Medium questions
  R2_1: { ring: 'R2', connections: ['R2_2', 'R2_8', 'R1_1', 'R1_6'] },
  R2_2: { ring: 'R2', connections: ['R2_1', 'R2_3', 'R1_1', 'R1_2'] },
  R2_3: { ring: 'R2', connections: ['R2_2', 'R2_4', 'R1_2', 'R1_3'] },
  R2_4: { ring: 'R2', connections: ['R2_3', 'R2_5', 'R1_3', 'R1_4'] },
  R2_5: { ring: 'R2', connections: ['R2_4', 'R2_6', 'R1_4', 'R1_5'] },
  R2_6: { ring: 'R2', connections: ['R2_5', 'R2_7', 'R1_5', 'R1_6'] },
  R2_7: { ring: 'R2', connections: ['R2_6', 'R2_8', 'R1_6', 'R1_1'] },
  R2_8: { ring: 'R2', connections: ['R2_7', 'R2_1', 'R1_1', 'R1_6'] },
  
  // Ring 1 (Inner) - Hard questions
  R1_1: { ring: 'R1', connections: ['R1_2', 'R1_6', 'TARGET'] },
  R1_2: { ring: 'R1', connections: ['R1_1', 'R1_3', 'TARGET'] },
  R1_3: { ring: 'R1', connections: ['R1_2', 'R1_4', 'TARGET'] },
  R1_4: { ring: 'R1', connections: ['R1_3', 'R1_5', 'TARGET'] },
  R1_5: { ring: 'R1', connections: ['R1_4', 'R1_6', 'TARGET'] },
  R1_6: { ring: 'R1', connections: ['R1_5', 'R1_1', 'TARGET'] },
  
  // Target (Center) - Victory point
  TARGET: { ring: 'TARGET', connections: [] }
};

// Edge difficulty mapping
const EDGE_DIFFICULTY = {
  // Spawn to Ring 3 - No questions (free movement)
  'SPAWN_R3': 'none',
  
  // Ring 3 movements - Easy questions
  'R3_R3': 'easy',    // Circular within Ring 3
  'R3_R2': 'easy',    // Ring 3 to Ring 2
  
  // Ring 2 movements - Medium questions
  'R2_R2': 'medium',  // Circular within Ring 2
  'R2_R1': 'medium',  // Ring 2 to Ring 1
  
  // Ring 1 movements - Hard questions
  'R1_R1': 'hard',    // Circular within Ring 1
  'R1_TARGET': 'hard' // Ring 1 to Target
};

class BattleRoyaleUser {
  constructor(sessionId, playerId, playerName, spawnNode = null) {
    this.sessionId = sessionId;
    this.playerId = playerId;
    this.playerName = playerName;
    this.currentNode = spawnNode;
    this.currentRing = spawnNode ? MAP_STRUCTURE[spawnNode]?.ring : 'SPAWN';
    this.health = 100;
    this.maxHealth = 100;
    this.questionsAnswered = 0;
    this.correctAnswers = 0;
    this.wrongAnswers = 0;
    this.isAlive = true;
    this.isWinner = false;
    this.lastActivity = new Date();
    this.socketId = null;
    this.isConnected = true;
    
    // Game progress tracking
    this.visitedNodes = new Set();
    this.completedEdges = new Set();
    this.usedQuestions = new Set();
    
    // Add spawn node to visited if provided
    if (spawnNode) {
      this.visitedNodes.add(spawnNode);
    }
  }

  // Health management
  updateHealth(amount, reason = '') {
    const oldHealth = this.health;
    this.health = Math.max(0, Math.min(this.maxHealth, this.health + amount));
    this.lastActivity = new Date();
    
    if (this.health <= 0) {
      this.isAlive = false;
    }
    
    console.log(`🏥 Player ${this.playerId} health: ${oldHealth} → ${this.health} (${reason})`);
    return {
      oldHealth,
      newHealth: this.health,
      isAlive: this.isAlive,
      reason
    };
  }

  // Node and position management
  moveToNode(targetNode) {
    if (!MAP_STRUCTURE[targetNode]) {
      throw new Error(`Invalid target node: ${targetNode}`);
    }

    const oldNode = this.currentNode;
    const oldRing = this.currentRing;
    
    this.currentNode = targetNode;
    this.currentRing = MAP_STRUCTURE[targetNode].ring;
    this.visitedNodes.add(targetNode);
    this.lastActivity = new Date();
    
    // Check for victory condition
    if (targetNode === 'TARGET') {
      this.isWinner = true;
    }
    
    console.log(`🚀 Player ${this.playerId} moved: ${oldNode} → ${targetNode} (${oldRing} → ${this.currentRing})`);
    return {
      oldNode,
      newNode: targetNode,
      oldRing,
      newRing: this.currentRing,
      isWinner: this.isWinner
    };
  }

  // Get accessible edges from current position
  getAccessibleEdges() {
    if (!this.currentNode || !MAP_STRUCTURE[this.currentNode]) {
      return [];
    }

    const currentNodeData = MAP_STRUCTURE[this.currentNode];
    const accessibleEdges = [];

    for (const targetNode of currentNodeData.connections) {
      const edgeId = `${this.currentNode}_${targetNode}`;
      const reverseEdgeId = `${targetNode}_${this.currentNode}`;
      
      // Skip if edge already completed
      if (this.completedEdges.has(edgeId) || this.completedEdges.has(reverseEdgeId)) {
        continue;
      }

      const difficulty = this.getEdgeDifficulty(this.currentNode, targetNode);
      
      accessibleEdges.push({
        edgeId,
        fromNode: this.currentNode,
        toNode: targetNode,
        fromRing: this.currentRing,
        toRing: MAP_STRUCTURE[targetNode].ring,
        difficulty,
        requiresQuestion: difficulty !== 'none'
      });
    }

    return accessibleEdges;
  }

  // Get edge difficulty based on rings
  getEdgeDifficulty(fromNode, toNode) {
    const fromRing = MAP_STRUCTURE[fromNode]?.ring;
    const toRing = MAP_STRUCTURE[toNode]?.ring;
    
    if (fromRing === 'SPAWN') {
      return 'none'; // Free movement from spawn
    }
    
    if (fromRing === toRing) {
      // Circular movement within same ring
      return EDGE_DIFFICULTY[`${fromRing}_${fromRing}`] || 'easy';
    }
    
    // Movement between rings
    const edgeKey = `${fromRing}_${toRing}`;
    return EDGE_DIFFICULTY[edgeKey] || 'medium';
  }

  // Mark edge as completed
  completeEdge(fromNode, toNode) {
    const edgeId = `${fromNode}_${toNode}`;
    this.completedEdges.add(edgeId);
    this.lastActivity = new Date();
    
    console.log(`✅ Player ${this.playerId} completed edge: ${edgeId}`);
  }

  // Question tracking
  addUsedQuestion(questionId) {
    this.usedQuestions.add(questionId);
  }

  hasUsedQuestion(questionId) {
    return this.usedQuestions.has(questionId);
  }

  // Answer tracking
  recordAnswer(isCorrect, questionId = null) {
    this.questionsAnswered++;
    this.lastActivity = new Date();
    
    if (isCorrect) {
      this.correctAnswers++;
    } else {
      this.wrongAnswers++;
      // Lose health for wrong answer
      this.updateHealth(-10, 'Wrong answer');
    }
    
    if (questionId) {
      this.addUsedQuestion(questionId);
    }
    
    console.log(`📝 Player ${this.playerId} answered: ${isCorrect ? 'CORRECT' : 'WRONG'} (Total: ${this.questionsAnswered})`);
    return {
      isCorrect,
      questionsAnswered: this.questionsAnswered,
      correctAnswers: this.correctAnswers,
      wrongAnswers: this.wrongAnswers,
      health: this.health,
      isAlive: this.isAlive
    };
  }

  // Connection management
  setSocketId(socketId) {
    this.socketId = socketId;
    this.isConnected = true;
    this.lastActivity = new Date();
  }

  disconnect() {
    this.isConnected = false;
    this.lastActivity = new Date();
  }

  reconnect(socketId) {
    this.socketId = socketId;
    this.isConnected = true;
    this.lastActivity = new Date();
  }

  // Get player state summary
  getState() {
    return {
      sessionId: this.sessionId,
      playerId: this.playerId,
      playerName: this.playerName,
      currentNode: this.currentNode,
      currentRing: this.currentRing,
      health: this.health,
      maxHealth: this.maxHealth,
      questionsAnswered: this.questionsAnswered,
      correctAnswers: this.correctAnswers,
      wrongAnswers: this.wrongAnswers,
      isAlive: this.isAlive,
      isWinner: this.isWinner,
      isConnected: this.isConnected,
      socketId: this.socketId,
      lastActivity: this.lastActivity,
      visitedNodes: Array.from(this.visitedNodes),
      completedEdges: Array.from(this.completedEdges),
      accessibleEdges: this.getAccessibleEdges()
    };
  }

  // Serialize for database storage
  serialize() {
    return {
      session_id: this.sessionId,
      player_id: this.playerId,
      player_name: this.playerName,
      current_node: this.currentNode,
      current_ring: this.currentRing,
      health: this.health,
      max_health: this.maxHealth,
      questions_answered: this.questionsAnswered,
      correct_answers: this.correctAnswers,
      wrong_answers: this.wrongAnswers,
      is_alive: this.isAlive,
      is_winner: this.isWinner,
      is_connected: this.isConnected,
      socket_id: this.socketId,
      last_activity: this.lastActivity.toISOString(),
      visited_nodes: Array.from(this.visitedNodes),
      completed_edges: Array.from(this.completedEdges),
      used_questions: Array.from(this.usedQuestions)
    };
  }

  // Deserialize from database
  static deserialize(data) {
    const user = new BattleRoyaleUser(
      data.session_id,
      data.player_id,
      data.player_name,
      data.current_node
    );
    
    user.currentRing = data.current_ring;
    user.health = data.health;
    user.maxHealth = data.max_health || 100;
    user.questionsAnswered = data.questions_answered || 0;
    user.correctAnswers = data.correct_answers || 0;
    user.wrongAnswers = data.wrong_answers || 0;
    user.isAlive = data.is_alive !== false;
    user.isWinner = data.is_winner || false;
    user.isConnected = data.is_connected !== false;
    user.socketId = data.socket_id;
    user.lastActivity = new Date(data.last_activity);
    
    // Restore sets
    user.visitedNodes = new Set(data.visited_nodes || []);
    user.completedEdges = new Set(data.completed_edges || []);
    user.usedQuestions = new Set(data.used_questions || []);
    
    return user;
  }
}

class BattleRoyaleUserManager {
  constructor() {
    this.users = new Map(); // sessionId -> Map(playerId -> BattleRoyaleUser)
    this.socketToUser = new Map(); // socketId -> {sessionId, playerId}
  }

  // Create or get user
  createUser(sessionId, playerId, playerName, spawnNode = null) {
    if (!this.users.has(sessionId)) {
      this.users.set(sessionId, new Map());
    }
    
    const sessionUsers = this.users.get(sessionId);
    
    if (sessionUsers.has(playerId)) {
      const existingUser = sessionUsers.get(playerId);
      console.log(`👤 User ${playerId} already exists in session ${sessionId}`);
      return existingUser;
    }
    
    const user = new BattleRoyaleUser(sessionId, playerId, playerName, spawnNode);
    sessionUsers.set(playerId, user);
    
    console.log(`✨ Created new user: ${playerId} in session ${sessionId} at ${spawnNode}`);
    return user;
  }

  // Get user by session and player ID
  getUser(sessionId, playerId) {
    return this.users.get(sessionId)?.get(playerId);
  }

  // Get user by socket ID
  getUserBySocket(socketId) {
    const userInfo = this.socketToUser.get(socketId);
    if (!userInfo) return null;
    
    return this.getUser(userInfo.sessionId, userInfo.playerId);
  }

  // Get all users in a session
  getSessionUsers(sessionId) {
    const sessionUsers = this.users.get(sessionId);
    return sessionUsers ? Array.from(sessionUsers.values()) : [];
  }

  // Set user socket
  setUserSocket(sessionId, playerId, socketId) {
    const user = this.getUser(sessionId, playerId);
    if (user) {
      user.setSocketId(socketId);
      this.socketToUser.set(socketId, { sessionId, playerId });
    }
  }

  // Remove user socket
  removeUserSocket(socketId) {
    const userInfo = this.socketToUser.get(socketId);
    if (userInfo) {
      const user = this.getUser(userInfo.sessionId, userInfo.playerId);
      if (user) {
        user.disconnect();
      }
      this.socketToUser.delete(socketId);
    }
  }

  // Remove user completely
  removeUser(sessionId, playerId) {
    const sessionUsers = this.users.get(sessionId);
    if (sessionUsers) {
      const user = sessionUsers.get(playerId);
      if (user && user.socketId) {
        this.socketToUser.delete(user.socketId);
      }
      sessionUsers.delete(playerId);
      
      // Clean up empty sessions
      if (sessionUsers.size === 0) {
        this.users.delete(sessionId);
      }
    }
  }

  // Get session statistics
  getSessionStats(sessionId) {
    const users = this.getSessionUsers(sessionId);
    return {
      totalUsers: users.length,
      aliveUsers: users.filter(u => u.isAlive).length,
      connectedUsers: users.filter(u => u.isConnected).length,
      winners: users.filter(u => u.isWinner),
      averageHealth: users.length > 0 ? users.reduce((sum, u) => sum + u.health, 0) / users.length : 0,
      totalQuestions: users.reduce((sum, u) => sum + u.questionsAnswered, 0)
    };
  }

  // Save user state to database
  async saveUserState(sessionId, playerId) {
    const user = this.getUser(sessionId, playerId);
    if (!user) return false;

    try {
      const serializedUser = user.serialize();
      
      const { error } = await supabase
        .from('battle_royale_user_states')
        .upsert(serializedUser, {
          onConflict: 'session_id,player_id'
        });

      if (error) {
        console.error('❌ Failed to save user state:', error);
        return false;
      }

      console.log(`💾 Saved user state: ${playerId} in session ${sessionId}`);
      return true;
    } catch (error) {
      console.error('❌ Error saving user state:', error);
      return false;
    }
  }

  // Load user state from database
  async loadUserState(sessionId, playerId) {
    try {
      const { data, error } = await supabase
        .from('battle_royale_user_states')
        .select('*')
        .eq('session_id', sessionId)
        .eq('player_id', playerId)
        .single();

      if (error || !data) {
        console.log(`📂 No saved state found for user ${playerId} in session ${sessionId}`);
        return null;
      }

      const user = BattleRoyaleUser.deserialize(data);
      
      // Add to manager
      if (!this.users.has(sessionId)) {
        this.users.set(sessionId, new Map());
      }
      this.users.get(sessionId).set(playerId, user);

      console.log(`📂 Loaded user state: ${playerId} in session ${sessionId}`);
      return user;
    } catch (error) {
      console.error('❌ Error loading user state:', error);
      return null;
    }
  }

  // Save all users in a session
  async saveSessionUsers(sessionId) {
    const users = this.getSessionUsers(sessionId);
    const savePromises = users.map(user => 
      this.saveUserState(sessionId, user.playerId)
    );
    
    const results = await Promise.all(savePromises);
    const successCount = results.filter(Boolean).length;
    
    console.log(`💾 Saved ${successCount}/${users.length} users in session ${sessionId}`);
    return successCount === users.length;
  }

  // Clean up inactive users
  cleanupInactiveUsers(maxInactiveMinutes = 30) {
    const cutoffTime = new Date(Date.now() - maxInactiveMinutes * 60 * 1000);
    let cleanedCount = 0;

    for (const [sessionId, sessionUsers] of this.users.entries()) {
      const usersToRemove = [];
      
      for (const [playerId, user] of sessionUsers.entries()) {
        if (!user.isConnected && user.lastActivity < cutoffTime) {
          usersToRemove.push(playerId);
        }
      }
      
      for (const playerId of usersToRemove) {
        this.removeUser(sessionId, playerId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`🧹 Cleaned up ${cleanedCount} inactive users`);
    }
    
    return cleanedCount;
  }
}

// Export singleton instance
const userManager = new BattleRoyaleUserManager();

module.exports = {
  BattleRoyaleUser,
  BattleRoyaleUserManager,
  userManager,
  MAP_STRUCTURE,
  EDGE_DIFFICULTY
};
