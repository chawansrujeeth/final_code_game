// backend/routes/profile.js
// User profile routes

const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const { authenticate, validateRequest } = require('../middleware/auth');
const { ApiError, asyncHandler } = require('../middleware/error');

/**
 * @route   GET /api/profile/:userId
 * @desc    Get user profile by ID
 * @access  Public
 */
router.get('/:userId', asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const db = req.app.get('db');
  
  const { data: users, error } = await db.query(
    `SELECT id, username, cf_handle, avatar_url, bio, rating, 
            problems_solved, contests_participated, created_at,
            CASE WHEN last_login > NOW() - INTERVAL '5 minutes' THEN true ELSE false END as is_online
     FROM users WHERE id = $1`,
    [userId]
  );
  
  if (error || !users || users.length === 0) {
    throw new ApiError(404, 'User not found', 'USER_NOT_FOUND');
  }
  
  // Get user statistics
  const { data: stats } = await db.query(
    `SELECT 
      COUNT(DISTINCT session_id) as total_games,
      SUM(CASE WHEN placement = 1 THEN 1 ELSE 0 END) as wins,
      AVG(placement) as avg_placement,
      MAX(rating_change) as best_rating_gain
     FROM game_results WHERE user_id = $1`,
    [userId]
  );
  
  res.json({
    success: true,
    profile: {
      ...users[0],
      statistics: stats ? stats[0] : null
    }
  });
}));

/**
 * @route   PUT /api/profile
 * @desc    Update current user's profile
 * @access  Private
 */
router.put('/', 
  authenticate(),
  [
    body('username').optional().isLength({ min: 3 }).trim().escape(),
    body('bio').optional().isLength({ max: 500 }).trim(),
    body('cf_handle').optional().isString().trim(),
    body('avatar_url').optional().isURL()
  ],
  validateRequest,
  asyncHandler(async (req, res) => {
    const { username, bio, cf_handle, avatar_url } = req.body;
    const db = req.app.get('db');
    
    // Build update query dynamically
    const updates = [];
    const values = [];
    let paramCount = 1;
    
    if (username !== undefined) {
      updates.push(`username = $${paramCount++}`);
      values.push(username);
    }
    if (bio !== undefined) {
      updates.push(`bio = $${paramCount++}`);
      values.push(bio);
    }
    if (cf_handle !== undefined) {
      updates.push(`cf_handle = $${paramCount++}`);
      values.push(cf_handle);
    }
    if (avatar_url !== undefined) {
      updates.push(`avatar_url = $${paramCount++}`);
      values.push(avatar_url);
    }
    
    if (updates.length === 0) {
      throw new ApiError(400, 'No fields to update', 'NO_UPDATES');
    }
    
    values.push(req.userId);
    
    const { data: updatedUser, error } = await db.query(
      `UPDATE users SET ${updates.join(', ')}, updated_at = NOW() 
       WHERE id = $${paramCount}
       RETURNING id, username, email, cf_handle, bio, avatar_url, rating`,
      values
    );
    
    if (error) {
      throw new ApiError(500, 'Failed to update profile', 'UPDATE_ERROR', error);
    }
    
    res.json({
      success: true,
      profile: updatedUser[0]
    });
  })
);

/**
 * @route   GET /api/profile/:userId/stats
 * @desc    Get detailed user statistics
 * @access  Public
 */
router.get('/:userId/stats', asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const db = req.app.get('db');
  
  // Get game statistics
  const { data: gameStats } = await db.query(
    `SELECT 
      COUNT(*) as total_games,
      COUNT(CASE WHEN placement = 1 THEN 1 END) as wins,
      COUNT(CASE WHEN placement <= 3 THEN 1 END) as top3_finishes,
      AVG(placement)::numeric(4,2) as avg_placement,
      SUM(problems_solved) as total_problems_solved,
      AVG(problems_solved)::numeric(4,2) as avg_problems_per_game,
      MAX(rating_change) as best_rating_gain,
      MIN(rating_change) as worst_rating_loss
     FROM game_results WHERE user_id = $1`,
    [userId]
  );
  
  // Get recent games
  const { data: recentGames } = await db.query(
    `SELECT 
      gr.session_id, gr.placement, gr.problems_solved, 
      gr.rating_change, gr.created_at,
      bs.game_mode, bs.player_count
     FROM game_results gr
     JOIN battle_royale_sessions bs ON gr.session_id = bs.session_id
     WHERE gr.user_id = $1
     ORDER BY gr.created_at DESC
     LIMIT 10`,
    [userId]
  );
  
  // Get problem solving stats by difficulty
  const { data: problemStats } = await db.query(
    `SELECT 
      difficulty,
      COUNT(*) as problems_solved,
      AVG(solve_time)::numeric(6,2) as avg_solve_time
     FROM user_problem_solutions
     WHERE user_id = $1
     GROUP BY difficulty`,
    [userId]
  );
  
  res.json({
    success: true,
    statistics: {
      overall: gameStats ? gameStats[0] : null,
      recentGames: recentGames || [],
      problemsByDifficulty: problemStats || []
    }
  });
}));

/**
 * @route   GET /api/profile/:userId/achievements
 * @desc    Get user achievements
 * @access  Public
 */
router.get('/:userId/achievements', asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const db = req.app.get('db');
  
  const { data: achievements } = await db.query(
    `SELECT 
      a.id, a.name, a.description, a.icon, a.rarity,
      ua.unlocked_at
     FROM user_achievements ua
     JOIN achievements a ON ua.achievement_id = a.id
     WHERE ua.user_id = $1
     ORDER BY ua.unlocked_at DESC`,
    [userId]
  );
  
  res.json({
    success: true,
    achievements: achievements || []
  });
}));

/**
 * @route   GET /api/profile/search
 * @desc    Search for users
 * @access  Public
 */
router.get('/search', asyncHandler(async (req, res) => {
  const { q, limit = 10 } = req.query;
  
  if (!q || q.length < 2) {
    throw new ApiError(400, 'Search query must be at least 2 characters', 'INVALID_QUERY');
  }
  
  const db = req.app.get('db');
  
  const { data: users } = await db.query(
    `SELECT id, username, cf_handle, avatar_url, rating
     FROM users 
     WHERE username ILIKE $1 OR cf_handle ILIKE $1
     ORDER BY rating DESC
     LIMIT $2`,
    [`%${q}%`, parseInt(limit)]
  );
  
  res.json({
    success: true,
    users: users || []
  });
}));

/**
 * @route   GET /api/profile/leaderboard
 * @desc    Get global leaderboard
 * @access  Public
 */
router.get('/leaderboard', asyncHandler(async (req, res) => {
  const { limit = 50, offset = 0, timeframe = 'all' } = req.query;
  const db = req.app.get('db');
  
  let timeCondition = '';
  if (timeframe === 'week') {
    timeCondition = "AND gr.created_at > NOW() - INTERVAL '7 days'";
  } else if (timeframe === 'month') {
    timeCondition = "AND gr.created_at > NOW() - INTERVAL '30 days'";
  }
  
  const { data: leaderboard } = await db.query(
    `SELECT 
      u.id, u.username, u.cf_handle, u.avatar_url, u.rating,
      COUNT(DISTINCT gr.session_id) as games_played,
      COUNT(CASE WHEN gr.placement = 1 THEN 1 END) as wins,
      AVG(gr.placement)::numeric(4,2) as avg_placement
     FROM users u
     LEFT JOIN game_results gr ON u.id = gr.user_id ${timeCondition}
     GROUP BY u.id
     ORDER BY u.rating DESC
     LIMIT $1 OFFSET $2`,
    [parseInt(limit), parseInt(offset)]
  );
  
  res.json({
    success: true,
    leaderboard: leaderboard || []
  });
}));

module.exports = router;
