// backend/supabaseClient.js
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('Supabase environment variables are missing. Please set SUPABASE_URL and SUPABASE_ANON_KEY (or SUPABASE_SERVICE_ROLE_KEY).');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

module.exports = { supabase };
