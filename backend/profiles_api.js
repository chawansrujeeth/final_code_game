// backend/profiles_api.js
// Express router exposing profile CRUD endpoints.
// Uses Zod for validation and Supabase for persistence.

const express = require('express');
const { supabase } = require('./supabaseClient');
const { ProfileSchema } = require('./shared/profileSchema');

const router = express.Router();

// Helper to get current user id – in real prod you would verify JWT.
// For now we accept `x-user-id` header (sent by frontend after supabase.auth.getUser()).
function getUserId(req) {
  return req.headers['x-user-id'] || null;
}

// GET /api/profile/me – current user profile (private)
router.get('/me', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Missing x-user-id header' });
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  return res.json(data);
});

// GET /api/profile/:id – public profile limited fields
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  const { data, error } = await supabase
    .from('profiles')
    .select('user_id,name,codeforces_handle,cf_verified')
    .eq('user_id', id)
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Not found' });
  return res.json(data);
});

// PUT /api/profile – upsert current user profile
router.put('/', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'Missing x-user-id header' });

  // Validate body (allow partial updates)
  const parse = ProfileSchema.partial().safeParse({ ...req.body, user_id: userId });
  if (!parse.success) {
    return res.status(400).json({ error: parse.error.errors.map(e => e.message).join(', ') });
  }
  const payload = parse.data;

  // Ensure user_id matches header
  payload.user_id = userId;

  const { data, error } = await supabase
    .from('profiles')
    .upsert(payload, { onConflict: 'user_id', ignoreDuplicates: false, defaultToNull: false })
    .select('*')
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  return res.json(data);
});

module.exports = router;
