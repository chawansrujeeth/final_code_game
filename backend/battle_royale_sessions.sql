-- Battle Royale Game Sessions Table
-- This stores persistent game sessions in Supabase instead of memory

CREATE TABLE IF NOT EXISTS battle_royale_sessions (
  session_id VARCHAR(50) PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_active BOOLEAN DEFAULT true,
  game_state JSONB DEFAULT '{}',
  players JSONB DEFAULT '[]',
  used_questions JSONB DEFAULT '[]',
  current_turn VARCHAR(20),
  winner VARCHAR(20),
  game_over BOOLEAN DEFAULT false
);

-- Index for active sessions
CREATE INDEX IF NOT EXISTS idx_battle_royale_sessions_active 
ON battle_royale_sessions(is_active, updated_at);

-- Index for session lookup
CREATE INDEX IF NOT EXISTS idx_battle_royale_sessions_id 
ON battle_royale_sessions(session_id);

-- Enable Row Level Security
ALTER TABLE battle_royale_sessions ENABLE ROW LEVEL SECURITY;

-- Policy to allow all operations (adjust based on your auth needs)
CREATE POLICY "Allow all operations on battle_royale_sessions" 
ON battle_royale_sessions FOR ALL 
USING (true);

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_battle_royale_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER update_battle_royale_sessions_updated_at
  BEFORE UPDATE ON battle_royale_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_battle_royale_sessions_updated_at();

-- Sample data structure for reference:
-- {
--   "session_id": "session_123",
--   "players": [
--     {
--       "playerId": "PLAYER_A",
--       "playerName": "Alice",
--       "socketId": "socket_123",
--       "currentNode": "PLAYER_A",
--       "currentZone": "spawn",
--       "health": 100,
--       "questionsAnswered": 0,
--       "isAlive": true,
--       "lastSeen": "2024-01-01T00:00:00Z"
--     }
--   ],
--   "used_questions": [1, 2, 3, 4],
--   "game_state": {
--     "isGameActive": true,
--     "playersAlive": 4,
--     "currentRound": 1
--   }
-- }
