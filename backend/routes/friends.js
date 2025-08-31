// backend/routes/friends.js
// Friends system routes

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { ApiError, asyncHandler } = require('../middleware/error');

/**
 * @route   GET /api/friends
 * @desc    Get user's friends list
 * @access  Private
 */
router.get('/', authenticate(), asyncHandler(async (req, res) => {
  const db = req.app.get('db');
  
  const { data: friends } = await db.query(
    `SELECT 
      u.id, u.username, u.cf_handle, u.avatar_url, u.rating,
      f.status, f.created_at as friend_since,
      CASE WHEN u.last_login > NOW() - INTERVAL '5 minutes' THEN true ELSE false END as is_online
     FROM friends f
     JOIN users u ON (
       CASE 
         WHEN f.user_id = $1 THEN f.friend_id = u.id
         WHEN f.friend_id = $1 THEN f.user_id = u.id
       END
     )
     WHERE (f.user_id = $1 OR f.friend_id = $1) AND f.status = 'accepted'
     ORDER BY u.username`,
    [req.userId]
  );
  
  res.json({
    success: true,
    friends: friends || []
  });
}));

/**
 * @route   GET /api/friends/requests
 * @desc    Get pending friend requests
 * @access  Private
 */
router.get('/requests', authenticate(), asyncHandler(async (req, res) => {
  const db = req.app.get('db');
  
  // Get incoming requests
  const { data: incoming } = await db.query(
    `SELECT 
      f.id as request_id,
      u.id, u.username, u.cf_handle, u.avatar_url, u.rating,
      f.created_at as requested_at
     FROM friends f
     JOIN users u ON f.user_id = u.id
     WHERE f.friend_id = $1 AND f.status = 'pending'
     ORDER BY f.created_at DESC`,
    [req.userId]
  );
  
  // Get outgoing requests
  const { data: outgoing } = await db.query(
    `SELECT 
      f.id as request_id,
      u.id, u.username, u.cf_handle, u.avatar_url, u.rating,
      f.created_at as requested_at
     FROM friends f
     JOIN users u ON f.friend_id = u.id
     WHERE f.user_id = $1 AND f.status = 'pending'
     ORDER BY f.created_at DESC`,
    [req.userId]
  );
  
  res.json({
    success: true,
    requests: {
      incoming: incoming || [],
      outgoing: outgoing || []
    }
  });
}));

/**
 * @route   POST /api/friends/request/:userId
 * @desc    Send friend request
 * @access  Private
 */
router.post('/request/:userId', authenticate(), asyncHandler(async (req, res) => {
  const { userId: friendId } = req.params;
  const db = req.app.get('db');
  
  if (req.userId === friendId) {
    throw new ApiError(400, 'Cannot send friend request to yourself', 'INVALID_REQUEST');
  }
  
  // Check if friendship already exists
  const { data: existing } = await db.query(
    `SELECT id, status FROM friends 
     WHERE (user_id = $1 AND friend_id = $2) 
        OR (user_id = $2 AND friend_id = $1)`,
    [req.userId, friendId]
  );
  
  if (existing && existing.length > 0) {
    const friendship = existing[0];
    if (friendship.status === 'accepted') {
      throw new ApiError(400, 'Already friends', 'ALREADY_FRIENDS');
    } else if (friendship.status === 'pending') {
      throw new ApiError(400, 'Friend request already pending', 'REQUEST_PENDING');
    } else if (friendship.status === 'blocked') {
      throw new ApiError(400, 'Cannot send friend request', 'BLOCKED');
    }
  }
  
  // Create friend request
  const { data: request, error } = await db.query(
    `INSERT INTO friends (user_id, friend_id, status, created_at) 
     VALUES ($1, $2, 'pending', NOW()) 
     RETURNING id, user_id, friend_id, status, created_at`,
    [req.userId, friendId]
  );
  
  if (error) {
    throw new ApiError(500, 'Failed to send friend request', 'DB_ERROR', error);
  }
  
  // Send notification (if notification service exists)
  // await notificationService.sendFriendRequest(friendId, req.userId);
  
  res.status(201).json({
    success: true,
    message: 'Friend request sent',
    request: request[0]
  });
}));

/**
 * @route   PUT /api/friends/accept/:requestId
 * @desc    Accept friend request
 * @access  Private
 */
router.put('/accept/:requestId', authenticate(), asyncHandler(async (req, res) => {
  const { requestId } = req.params;
  const db = req.app.get('db');
  
  // Verify request exists and user is the recipient
  const { data: requests } = await db.query(
    `SELECT * FROM friends 
     WHERE id = $1 AND friend_id = $2 AND status = 'pending'`,
    [requestId, req.userId]
  );
  
  if (!requests || requests.length === 0) {
    throw new ApiError(404, 'Friend request not found', 'REQUEST_NOT_FOUND');
  }
  
  // Accept request
  const { data: updated, error } = await db.query(
    `UPDATE friends 
     SET status = 'accepted', updated_at = NOW() 
     WHERE id = $1 
     RETURNING id, user_id, friend_id, status`,
    [requestId]
  );
  
  if (error) {
    throw new ApiError(500, 'Failed to accept friend request', 'DB_ERROR', error);
  }
  
  // Send notification
  // await notificationService.sendFriendRequestAccepted(requests[0].user_id, req.userId);
  
  res.json({
    success: true,
    message: 'Friend request accepted',
    friendship: updated[0]
  });
}));

/**
 * @route   DELETE /api/friends/reject/:requestId
 * @desc    Reject friend request
 * @access  Private
 */
router.delete('/reject/:requestId', authenticate(), asyncHandler(async (req, res) => {
  const { requestId } = req.params;
  const db = req.app.get('db');
  
  // Verify request exists and user is the recipient
  const { data: requests } = await db.query(
    `SELECT * FROM friends 
     WHERE id = $1 AND friend_id = $2 AND status = 'pending'`,
    [requestId, req.userId]
  );
  
  if (!requests || requests.length === 0) {
    throw new ApiError(404, 'Friend request not found', 'REQUEST_NOT_FOUND');
  }
  
  // Delete request
  await db.query('DELETE FROM friends WHERE id = $1', [requestId]);
  
  res.json({
    success: true,
    message: 'Friend request rejected'
  });
}));

/**
 * @route   DELETE /api/friends/:friendId
 * @desc    Remove friend
 * @access  Private
 */
router.delete('/:friendId', authenticate(), asyncHandler(async (req, res) => {
  const { friendId } = req.params;
  const db = req.app.get('db');
  
  // Delete friendship
  const { data: deleted } = await db.query(
    `DELETE FROM friends 
     WHERE ((user_id = $1 AND friend_id = $2) 
         OR (user_id = $2 AND friend_id = $1))
       AND status = 'accepted'
     RETURNING id`,
    [req.userId, friendId]
  );
  
  if (!deleted || deleted.length === 0) {
    throw new ApiError(404, 'Friendship not found', 'NOT_FRIENDS');
  }
  
  res.json({
    success: true,
    message: 'Friend removed'
  });
}));

/**
 * @route   POST /api/friends/block/:userId
 * @desc    Block a user
 * @access  Private
 */
router.post('/block/:userId', authenticate(), asyncHandler(async (req, res) => {
  const { userId: blockedId } = req.params;
  const db = req.app.get('db');
  
  if (req.userId === blockedId) {
    throw new ApiError(400, 'Cannot block yourself', 'INVALID_REQUEST');
  }
  
  // Check existing relationship
  const { data: existing } = await db.query(
    `SELECT id FROM friends 
     WHERE (user_id = $1 AND friend_id = $2) 
        OR (user_id = $2 AND friend_id = $1)`,
    [req.userId, blockedId]
  );
  
  if (existing && existing.length > 0) {
    // Update existing relationship to blocked
    await db.query(
      `UPDATE friends 
       SET status = 'blocked', blocker_id = $1, updated_at = NOW() 
       WHERE id = $2`,
      [req.userId, existing[0].id]
    );
  } else {
    // Create new blocked relationship
    await db.query(
      `INSERT INTO friends (user_id, friend_id, status, blocker_id, created_at) 
       VALUES ($1, $2, 'blocked', $1, NOW())`,
      [req.userId, blockedId]
    );
  }
  
  res.json({
    success: true,
    message: 'User blocked'
  });
}));

/**
 * @route   DELETE /api/friends/unblock/:userId
 * @desc    Unblock a user
 * @access  Private
 */
router.delete('/unblock/:userId', authenticate(), asyncHandler(async (req, res) => {
  const { userId: blockedId } = req.params;
  const db = req.app.get('db');
  
  const { data: deleted } = await db.query(
    `DELETE FROM friends 
     WHERE ((user_id = $1 AND friend_id = $2) 
         OR (user_id = $2 AND friend_id = $1))
       AND status = 'blocked' AND blocker_id = $1
     RETURNING id`,
    [req.userId, blockedId]
  );
  
  if (!deleted || deleted.length === 0) {
    throw new ApiError(404, 'Block not found', 'NOT_BLOCKED');
  }
  
  res.json({
    success: true,
    message: 'User unblocked'
  });
}));

/**
 * @route   GET /api/friends/online
 * @desc    Get online friends
 * @access  Private
 */
router.get('/online', authenticate(), asyncHandler(async (req, res) => {
  const db = req.app.get('db');
  
  const { data: onlineFriends } = await db.query(
    `SELECT 
      u.id, u.username, u.cf_handle, u.avatar_url, u.rating,
      u.last_login,
      CASE 
        WHEN gs.session_id IS NOT NULL THEN 'in_game'
        ELSE 'online'
      END as status
     FROM friends f
     JOIN users u ON (
       CASE 
         WHEN f.user_id = $1 THEN f.friend_id = u.id
         WHEN f.friend_id = $1 THEN f.user_id = u.id
       END
     )
     LEFT JOIN game_sessions gs ON u.id = gs.user_id AND gs.status = 'active'
     WHERE (f.user_id = $1 OR f.friend_id = $1) 
       AND f.status = 'accepted'
       AND u.last_login > NOW() - INTERVAL '5 minutes'
     ORDER BY u.username`,
    [req.userId]
  );
  
  res.json({
    success: true,
    onlineFriends: onlineFriends || []
  });
}));

module.exports = router;
