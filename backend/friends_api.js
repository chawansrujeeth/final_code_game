// friends_api.js
// API endpoints for friend management using Supabase

const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const router = express.Router();

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Send a friend request by profile name
router.post('/send-request', async (req, res) => {
  const { from_user_id, to_profile_name } = req.body;
  // Find user by profile name in profiles table
  const { data: toUser, error: userError } = await supabase
    .from('profiles')
    .select('user_id')
    .eq('name', to_profile_name)
    .single();
  if (userError || !toUser) return res.status(404).json({ error: 'User not found' });
  // Insert friend request
  const { error } = await supabase
    .from('friends')
    .insert({ user_id: from_user_id, friend_id: toUser.user_id, status: 'pending' });
  if (error) return res.status(400).json({ error: error.message });
  res.json({ message: 'Friend request sent' });
});

// Accept a friend request
router.post('/accept-request', async (req, res) => {
  const { request_id } = req.body;
  const { error } = await supabase
    .from('friends')
    .update({ status: 'accepted' })
    .eq('id', request_id);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ message: 'Friend request accepted' });
});

// Reject a friend request
router.post('/reject-request', async (req, res) => {
  const { request_id } = req.body;
  const { error } = await supabase
    .from('friends')
    .update({ status: 'declined' })
    .eq('id', request_id);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ message: 'Friend request rejected' });
});

// List friends for a user
router.get('/list', async (req, res) => {
  const { user_id } = req.query;
  const { data, error } = await supabase
    .from('friends')
    .select('*')
    .or(`user_id.eq.${user_id},friend_id.eq.${user_id}`)
    .eq('status', 'accepted');
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

module.exports = router;
