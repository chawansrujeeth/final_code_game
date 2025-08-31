// backend/services/DatabaseService.js
// Centralized database service for all Supabase operations

const { createClient } = require('@supabase/supabase-js');

class DatabaseService {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    
    // Initialize Supabase client
    this.supabase = createClient(
      config.database.supabase.url,
      config.database.supabase.anonKey
    );

    // Initialize admin client if service key is available
    if (config.database.supabase.serviceKey) {
      this.supabaseAdmin = createClient(
        config.database.supabase.url,
        config.database.supabase.serviceKey
      );
    }
  }

  // ============= User Operations =============

  /**
   * Get user by ID
   */
  async getUserById(userId) {
    try {
      const { data, error } = await this.supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      this.logger.error('Error fetching user:', error);
      throw new Error('Failed to fetch user');
    }
  }

  /**
   * Get user by username
   */
  async getUserByUsername(username) {
    try {
      const { data, error } = await this.supabase
        .from('users')
        .select('*')
        .eq('username', username)
        .single();

      if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows returned
      return data;
    } catch (error) {
      this.logger.error('Error fetching user by username:', error);
      throw new Error('Failed to fetch user');
    }
  }

  /**
   * Create new user
   */
  async createUser(userData) {
    try {
      const { data, error } = await this.supabase
        .from('users')
        .insert(userData)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      this.logger.error('Error creating user:', error);
      throw new Error('Failed to create user');
    }
  }

  /**
   * Update user
   */
  async updateUser(userId, updates) {
    try {
      const { data, error } = await this.supabase
        .from('users')
        .update(updates)
        .eq('id', userId)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      this.logger.error('Error updating user:', error);
      throw new Error('Failed to update user');
    }
  }

  // ============= Profile Operations =============

  /**
   * Get user profile with stats
   */
  async getUserProfile(userId) {
    try {
      const { data, error } = await this.supabase
        .from('profiles')
        .select(`
          *,
          users!inner(username, email, created_at)
        `)
        .eq('user_id', userId)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return data;
    } catch (error) {
      this.logger.error('Error fetching profile:', error);
      throw new Error('Failed to fetch profile');
    }
  }

  /**
   * Update user profile
   */
  async updateProfile(userId, profileData) {
    try {
      const { data, error } = await this.supabase
        .from('profiles')
        .upsert({
          user_id: userId,
          ...profileData,
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      this.logger.error('Error updating profile:', error);
      throw new Error('Failed to update profile');
    }
  }

  // ============= Game Session Operations =============

  /**
   * Create game session
   */
  async createGameSession(sessionData) {
    try {
      const { data, error } = await this.supabase
        .from('game_sessions')
        .insert({
          ...sessionData,
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      this.logger.error('Error creating game session:', error);
      throw new Error('Failed to create game session');
    }
  }

  /**
   * Update game session
   */
  async updateGameSession(sessionId, updates) {
    try {
      const { data, error } = await this.supabase
        .from('game_sessions')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', sessionId)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      this.logger.error('Error updating game session:', error);
      throw new Error('Failed to update game session');
    }
  }

  /**
   * Get active game sessions
   */
  async getActiveSessions(gameType = null) {
    try {
      let query = this.supabase
        .from('game_sessions')
        .select('*')
        .in('status', ['waiting', 'starting', 'in-progress'])
        .order('created_at', { ascending: false });

      if (gameType) {
        query = query.eq('game_type', gameType);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    } catch (error) {
      this.logger.error('Error fetching active sessions:', error);
      throw new Error('Failed to fetch active sessions');
    }
  }

  // ============= Battle Royale Questions =============

  /**
   * Get questions by difficulty
   */
  async getQuestionsByDifficulty(difficulty, limit = 50) {
    try {
      const { data, error } = await this.supabase
        .from('battle_royale_questions')
        .select('*')
        .eq('difficulty', difficulty)
        .limit(limit);

      if (error) throw error;
      return data || [];
    } catch (error) {
      this.logger.error('Error fetching questions:', error);
      throw new Error('Failed to fetch questions');
    }
  }

  /**
   * Get random questions
   */
  async getRandomQuestions(count = 10, difficulty = null) {
    try {
      let query = this.supabase
        .from('battle_royale_questions')
        .select('*');

      if (difficulty) {
        query = query.eq('difficulty', difficulty);
      }

      // Fetch all matching questions
      const { data: allQuestions, error } = await query;
      if (error) throw error;

      // Randomly select questions
      const shuffled = allQuestions.sort(() => 0.5 - Math.random());
      return shuffled.slice(0, count);
    } catch (error) {
      this.logger.error('Error fetching random questions:', error);
      throw new Error('Failed to fetch random questions');
    }
  }

  /**
   * Get question by ID
   */
  async getQuestionById(questionId) {
    try {
      const { data, error } = await this.supabase
        .from('battle_royale_questions')
        .select('*')
        .eq('id', questionId)
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      this.logger.error('Error fetching question:', error);
      throw new Error('Failed to fetch question');
    }
  }

  // ============= Game Results =============

  /**
   * Save game result
   */
  async saveGameResult(resultData) {
    try {
      const { data, error } = await this.supabase
        .from('game_results')
        .insert({
          ...resultData,
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      this.logger.error('Error saving game result:', error);
      throw new Error('Failed to save game result');
    }
  }

  /**
   * Get user game history
   */
  async getUserGameHistory(userId, limit = 20) {
    try {
      const { data, error } = await this.supabase
        .from('game_results')
        .select(`
          *,
          game_sessions!inner(game_type, settings)
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data || [];
    } catch (error) {
      this.logger.error('Error fetching game history:', error);
      throw new Error('Failed to fetch game history');
    }
  }

  // ============= Leaderboard Operations =============

  /**
   * Get global leaderboard
   */
  async getGlobalLeaderboard(gameType = null, limit = 100) {
    try {
      let query = this.supabase
        .from('leaderboard')
        .select(`
          *,
          users!inner(username, avatar_url)
        `)
        .order('rating', { ascending: false })
        .limit(limit);

      if (gameType) {
        query = query.eq('game_type', gameType);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    } catch (error) {
      this.logger.error('Error fetching leaderboard:', error);
      throw new Error('Failed to fetch leaderboard');
    }
  }

  /**
   * Update user rating
   */
  async updateUserRating(userId, gameType, ratingChange) {
    try {
      // Get current rating
      const { data: current, error: fetchError } = await this.supabase
        .from('leaderboard')
        .select('*')
        .eq('user_id', userId)
        .eq('game_type', gameType)
        .single();

      if (fetchError && fetchError.code !== 'PGRST116') throw fetchError;

      const newRating = (current?.rating || 1200) + ratingChange;
      const wins = (current?.wins || 0) + (ratingChange > 0 ? 1 : 0);
      const losses = (current?.losses || 0) + (ratingChange < 0 ? 1 : 0);
      const games_played = (current?.games_played || 0) + 1;

      const { data, error } = await this.supabase
        .from('leaderboard')
        .upsert({
          user_id: userId,
          game_type: gameType,
          rating: newRating,
          wins,
          losses,
          games_played,
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      this.logger.error('Error updating rating:', error);
      throw new Error('Failed to update rating');
    }
  }

  // ============= Friends Operations =============

  /**
   * Get user friends
   */
  async getUserFriends(userId) {
    try {
      const { data, error } = await this.supabase
        .from('friendships')
        .select(`
          *,
          friend:friend_id(id, username, avatar_url)
        `)
        .eq('user_id', userId)
        .eq('status', 'accepted');

      if (error) throw error;
      return data || [];
    } catch (error) {
      this.logger.error('Error fetching friends:', error);
      throw new Error('Failed to fetch friends');
    }
  }

  /**
   * Send friend request
   */
  async sendFriendRequest(userId, friendId) {
    try {
      const { data, error } = await this.supabase
        .from('friendships')
        .insert([
          {
            user_id: userId,
            friend_id: friendId,
            status: 'pending',
            requested_at: new Date().toISOString()
          },
          {
            user_id: friendId,
            friend_id: userId,
            status: 'pending',
            is_requester: false,
            requested_at: new Date().toISOString()
          }
        ])
        .select();

      if (error) throw error;
      return data;
    } catch (error) {
      this.logger.error('Error sending friend request:', error);
      throw new Error('Failed to send friend request');
    }
  }

  // ============= Transaction Helpers =============

  /**
   * Execute a database transaction
   * Note: Supabase doesn't support traditional transactions, 
   * but we can use RPC functions for complex operations
   */
  async executeTransaction(operations) {
    const results = [];
    const rollback = [];

    try {
      for (const operation of operations) {
        const result = await operation();
        results.push(result);
        
        // Store rollback function if provided
        if (operation.rollback) {
          rollback.push(operation.rollback);
        }
      }
      return results;
    } catch (error) {
      // Attempt to rollback completed operations
      for (const rollbackFn of rollback.reverse()) {
        try {
          await rollbackFn();
        } catch (rollbackError) {
          this.logger.error('Rollback failed:', rollbackError);
        }
      }
      throw error;
    }
  }

  // ============= Health Check =============

  /**
   * Check database connection
   */
  async healthCheck() {
    try {
      const { data, error } = await this.supabase
        .from('users')
        .select('count')
        .limit(1);

      if (error) throw error;
      return { healthy: true, message: 'Database connection successful' };
    } catch (error) {
      this.logger.error('Database health check failed:', error);
      return { healthy: false, message: error.message };
    }
  }

  /**
   * Get database statistics
   */
  async getStats() {
    try {
      const [users, sessions, questions] = await Promise.all([
        this.supabase.from('users').select('count'),
        this.supabase.from('game_sessions').select('count'),
        this.supabase.from('battle_royale_questions').select('count')
      ]);

      return {
        users: users.data?.[0]?.count || 0,
        sessions: sessions.data?.[0]?.count || 0,
        questions: questions.data?.[0]?.count || 0
      };
    } catch (error) {
      this.logger.error('Error fetching database stats:', error);
      return { users: 0, sessions: 0, questions: 0 };
    }
  }
}

module.exports = DatabaseService;
