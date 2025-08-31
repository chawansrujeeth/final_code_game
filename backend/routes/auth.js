// backend/routes/auth.js
// Authentication routes

const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const router = express.Router();
const { generateToken, authenticate, validateRequest } = require('../middleware/auth');
const { ApiError, asyncHandler } = require('../middleware/error');

// Validation rules
const registerValidation = [
  body('username').isLength({ min: 3 }).trim().escape(),
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
  body('cf_handle').optional().isString().trim()
];

const loginValidation = [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty()
];

/**
 * @route   POST /api/auth/register
 * @desc    Register a new user
 * @access  Public
 */
router.post('/register', registerValidation, validateRequest, asyncHandler(async (req, res) => {
  const { username, email, password, cf_handle } = req.body;
  
  // Get database service from app
  const db = req.app.get('db');
  
  // Check if user exists
  const existingUser = await db.query(
    'SELECT id FROM users WHERE email = $1 OR username = $2',
    [email, username]
  );
  
  if (existingUser.data && existingUser.data.length > 0) {
    throw new ApiError(400, 'User already exists', 'USER_EXISTS');
  }
  
  // Hash password
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);
  
  // Create user
  const { data: newUser, error } = await db.query(
    `INSERT INTO users (username, email, password_hash, cf_handle, created_at) 
     VALUES ($1, $2, $3, $4, NOW()) 
     RETURNING id, username, email, cf_handle, role`,
    [username, email, hashedPassword, cf_handle]
  );
  
  if (error) {
    throw new ApiError(500, 'Failed to create user', 'DB_ERROR', error);
  }
  
  // Generate token
  const token = generateToken(newUser[0]);
  
  res.status(201).json({
    success: true,
    token,
    user: {
      id: newUser[0].id,
      username: newUser[0].username,
      email: newUser[0].email,
      cf_handle: newUser[0].cf_handle,
      role: newUser[0].role || 'user'
    }
  });
}));

/**
 * @route   POST /api/auth/login
 * @desc    Login user
 * @access  Public
 */
router.post('/login', loginValidation, validateRequest, asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  
  const db = req.app.get('db');
  
  // Get user with password
  const { data: users, error } = await db.query(
    'SELECT id, username, email, password_hash, cf_handle, role FROM users WHERE email = $1',
    [email]
  );
  
  if (error || !users || users.length === 0) {
    throw new ApiError(401, 'Invalid credentials', 'INVALID_CREDENTIALS');
  }
  
  const user = users[0];
  
  // Check password
  const isValidPassword = await bcrypt.compare(password, user.password_hash);
  
  if (!isValidPassword) {
    throw new ApiError(401, 'Invalid credentials', 'INVALID_CREDENTIALS');
  }
  
  // Generate token
  const token = generateToken(user);
  
  // Update last login
  await db.query(
    'UPDATE users SET last_login = NOW() WHERE id = $1',
    [user.id]
  );
  
  res.json({
    success: true,
    token,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      cf_handle: user.cf_handle,
      role: user.role || 'user'
    }
  });
}));

/**
 * @route   GET /api/auth/me
 * @desc    Get current user
 * @access  Private
 */
router.get('/me', authenticate(), asyncHandler(async (req, res) => {
  const db = req.app.get('db');
  
  const { data: users, error } = await db.query(
    `SELECT id, username, email, cf_handle, role, created_at, last_login,
            rating, problems_solved, avatar_url
     FROM users WHERE id = $1`,
    [req.userId]
  );
  
  if (error || !users || users.length === 0) {
    throw new ApiError(404, 'User not found', 'USER_NOT_FOUND');
  }
  
  res.json({
    success: true,
    user: users[0]
  });
}));

/**
 * @route   POST /api/auth/logout
 * @desc    Logout user (client-side token removal)
 * @access  Private
 */
router.post('/logout', authenticate(), asyncHandler(async (req, res) => {
  // In a stateless JWT system, logout is handled client-side
  // Optionally, you can implement token blacklisting here
  
  res.json({
    success: true,
    message: 'Logged out successfully'
  });
}));

/**
 * @route   POST /api/auth/refresh
 * @desc    Refresh access token
 * @access  Public
 */
router.post('/refresh', asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;
  
  if (!refreshToken) {
    throw new ApiError(400, 'Refresh token required', 'NO_REFRESH_TOKEN');
  }
  
  // Implement refresh token logic
  // This is a placeholder - you should store refresh tokens in database
  
  res.json({
    success: true,
    message: 'Token refresh not implemented yet'
  });
}));

/**
 * @route   PUT /api/auth/password
 * @desc    Change password
 * @access  Private
 */
router.put('/password', 
  authenticate(),
  [
    body('currentPassword').notEmpty(),
    body('newPassword').isLength({ min: 6 })
  ],
  validateRequest,
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    const db = req.app.get('db');
    
    // Get current password hash
    const { data: users } = await db.query(
      'SELECT password_hash FROM users WHERE id = $1',
      [req.userId]
    );
    
    if (!users || users.length === 0) {
      throw new ApiError(404, 'User not found', 'USER_NOT_FOUND');
    }
    
    // Verify current password
    const isValid = await bcrypt.compare(currentPassword, users[0].password_hash);
    if (!isValid) {
      throw new ApiError(401, 'Current password is incorrect', 'INVALID_PASSWORD');
    }
    
    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);
    
    // Update password
    await db.query(
      'UPDATE users SET password_hash = $1 WHERE id = $2',
      [hashedPassword, req.userId]
    );
    
    res.json({
      success: true,
      message: 'Password updated successfully'
    });
  })
);

module.exports = router;
