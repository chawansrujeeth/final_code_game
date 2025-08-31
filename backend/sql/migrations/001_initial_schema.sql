-- Database Schema Migration
-- Initial schema setup for Code Game

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(255) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    cf_handle VARCHAR(255),
    rating INTEGER DEFAULT 1500,
    role VARCHAR(50) DEFAULT 'user',
    avatar_url TEXT,
    bio TEXT,
    problems_solved INTEGER DEFAULT 0,
    contests_participated INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_login TIMESTAMP WITH TIME ZONE,
    CONSTRAINT valid_role CHECK (role IN ('user', 'admin', 'moderator'))
);

-- Create index on username and email for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_cf_handle ON users(cf_handle);

-- Friends table
CREATE TABLE IF NOT EXISTS friends (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    friend_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    blocker_id UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_friendship UNIQUE (user_id, friend_id),
    CONSTRAINT valid_status CHECK (status IN ('pending', 'accepted', 'blocked')),
    CONSTRAINT not_self_friend CHECK (user_id != friend_id)
);

-- Create indexes for friend lookups
CREATE INDEX IF NOT EXISTS idx_friends_user_id ON friends(user_id);
CREATE INDEX IF NOT EXISTS idx_friends_friend_id ON friends(friend_id);
CREATE INDEX IF NOT EXISTS idx_friends_status ON friends(status);

-- CF Problems table (if not exists)
CREATE TABLE IF NOT EXISTS cf_problems (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    problem_url TEXT NOT NULL UNIQUE,
    difficulty INTEGER,
    tags JSONB,
    samples JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on difficulty for problem selection
CREATE INDEX IF NOT EXISTS idx_cf_problems_difficulty ON cf_problems(difficulty);

-- CF Duels table
CREATE TABLE IF NOT EXISTS cf_duels (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id VARCHAR(255) NOT NULL UNIQUE,
    player1_id UUID NOT NULL REFERENCES users(id),
    player2_id UUID NOT NULL REFERENCES users(id),
    problem_url TEXT NOT NULL REFERENCES cf_problems(problem_url),
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    winner_id UUID REFERENCES users(id),
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE,
    end_reason VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT valid_status CHECK (status IN ('active', 'completed', 'cancelled'))
);

-- Create indexes for duel lookups
CREATE INDEX IF NOT EXISTS idx_cf_duels_players ON cf_duels(player1_id, player2_id);
CREATE INDEX IF NOT EXISTS idx_cf_duels_status ON cf_duels(status);

-- Teams table
CREATE TABLE IF NOT EXISTS teams (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    team_id VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    leader_id UUID NOT NULL REFERENCES users(id),
    max_size INTEGER NOT NULL DEFAULT 3,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    status VARCHAR(50) NOT NULL DEFAULT 'forming',
    CONSTRAINT valid_status CHECK (status IN ('forming', 'ready', 'in_queue', 'in_match'))
);

-- Team Members table
CREATE TABLE IF NOT EXISTS team_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),
    role VARCHAR(50) NOT NULL DEFAULT 'member',
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_team_member UNIQUE (team_id, user_id),
    CONSTRAINT valid_role CHECK (role IN ('leader', 'member'))
);

-- Team Matches table
CREATE TABLE IF NOT EXISTS team_matches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    match_id VARCHAR(255) NOT NULL UNIQUE,
    team1_id UUID NOT NULL REFERENCES teams(id),
    team2_id UUID NOT NULL REFERENCES teams(id),
    problems JSONB NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    winner_team_id UUID REFERENCES teams(id),
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE,
    end_reason VARCHAR(50),
    final_scores JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT valid_status CHECK (status IN ('active', 'completed', 'cancelled'))
);

-- Create indexes for team match lookups
CREATE INDEX IF NOT EXISTS idx_team_matches_teams ON team_matches(team1_id, team2_id);
CREATE INDEX IF NOT EXISTS idx_team_matches_status ON team_matches(status);

-- Match Solutions table
CREATE TABLE IF NOT EXISTS match_solutions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    match_id UUID NOT NULL,
    user_id UUID NOT NULL REFERENCES users(id),
    problem_index INTEGER NOT NULL,
    solution_text TEXT NOT NULL,
    language VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL,
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT valid_status CHECK (status IN ('pending', 'passed', 'failed'))
);

-- Create indexes for solution lookups
CREATE INDEX IF NOT EXISTS idx_match_solutions_match ON match_solutions(match_id);
CREATE INDEX IF NOT EXISTS idx_match_solutions_user ON match_solutions(user_id);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_friends_updated_at
    BEFORE UPDATE ON friends
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
