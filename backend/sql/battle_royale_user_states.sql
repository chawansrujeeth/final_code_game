-- Battle Royale User States Table
-- Stores individual player state for battle royale games

CREATE TABLE IF NOT EXISTS battle_royale_user_states (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(255) NOT NULL,
    player_id VARCHAR(255) NOT NULL,
    player_name VARCHAR(255) NOT NULL,
    current_node VARCHAR(50),
    current_ring VARCHAR(20),
    health INTEGER DEFAULT 100,
    max_health INTEGER DEFAULT 100,
    questions_answered INTEGER DEFAULT 0,
    correct_answers INTEGER DEFAULT 0,
    wrong_answers INTEGER DEFAULT 0,
    is_alive BOOLEAN DEFAULT true,
    is_winner BOOLEAN DEFAULT false,
    is_connected BOOLEAN DEFAULT true,
    socket_id VARCHAR(255),
    last_activity TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    visited_nodes JSONB DEFAULT '[]',
    completed_edges JSONB DEFAULT '[]',
    used_questions JSONB DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Composite unique constraint for session + player
    UNIQUE(session_id, player_id)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_battle_royale_user_states_session_id ON battle_royale_user_states(session_id);
CREATE INDEX IF NOT EXISTS idx_battle_royale_user_states_player_id ON battle_royale_user_states(player_id);
CREATE INDEX IF NOT EXISTS idx_battle_royale_user_states_socket_id ON battle_royale_user_states(socket_id);
CREATE INDEX IF NOT EXISTS idx_battle_royale_user_states_last_activity ON battle_royale_user_states(last_activity);
CREATE INDEX IF NOT EXISTS idx_battle_royale_user_states_is_alive ON battle_royale_user_states(is_alive);
CREATE INDEX IF NOT EXISTS idx_battle_royale_user_states_is_connected ON battle_royale_user_states(is_connected);

-- Function to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_battle_royale_user_states_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to call the function before each update
CREATE TRIGGER trigger_update_battle_royale_user_states_updated_at
    BEFORE UPDATE ON battle_royale_user_states
    FOR EACH ROW
    EXECUTE FUNCTION update_battle_royale_user_states_updated_at();

-- Enable Row Level Security
ALTER TABLE battle_royale_user_states ENABLE ROW LEVEL SECURITY;

-- Policy to allow all operations for service role
CREATE POLICY "Allow all operations for service role" ON battle_royale_user_states
    FOR ALL USING (true);

-- Policy for authenticated users to see their own data
CREATE POLICY "Users can view their own user states" ON battle_royale_user_states
    FOR SELECT USING (true);

-- Policy for authenticated users to insert their own data
CREATE POLICY "Users can insert their own user states" ON battle_royale_user_states
    FOR INSERT WITH CHECK (true);

-- Policy for authenticated users to update their own data
CREATE POLICY "Users can update their own user states" ON battle_royale_user_states
    FOR UPDATE USING (true);

-- Cleanup function to remove old user states (older than 24 hours)
CREATE OR REPLACE FUNCTION cleanup_old_battle_royale_user_states()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM battle_royale_user_states 
    WHERE last_activity < NOW() - INTERVAL '24 hours'
    AND is_connected = false;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Comments for documentation
COMMENT ON TABLE battle_royale_user_states IS 'Stores individual player state for battle royale games including position, health, and progress';
COMMENT ON COLUMN battle_royale_user_states.session_id IS 'Battle royale session identifier';
COMMENT ON COLUMN battle_royale_user_states.player_id IS 'Unique player identifier within the session';
COMMENT ON COLUMN battle_royale_user_states.current_node IS 'Current node position on the map (e.g., SPAWN_1, R3_1, TARGET)';
COMMENT ON COLUMN battle_royale_user_states.current_ring IS 'Current ring level (SPAWN, R3, R2, R1, TARGET)';
COMMENT ON COLUMN battle_royale_user_states.health IS 'Current player health (0-100)';
COMMENT ON COLUMN battle_royale_user_states.visited_nodes IS 'Array of all nodes the player has visited';
COMMENT ON COLUMN battle_royale_user_states.completed_edges IS 'Array of all edges the player has successfully traversed';
COMMENT ON COLUMN battle_royale_user_states.used_questions IS 'Array of question IDs the player has already answered';
