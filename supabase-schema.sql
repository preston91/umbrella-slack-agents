-- Supabase schema for Umbrella Agents
-- Run this in your Supabase SQL Editor (Database > SQL Editor)

-- Events table - tracks all agent interactions
CREATE TABLE IF NOT EXISTS events (
  id BIGSERIAL PRIMARY KEY,
  channel TEXT NOT NULL,
  agent TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tasks table - tracks routed tasks between agents
CREATE TABLE IF NOT EXISTS tasks (
  id BIGSERIAL PRIMARY KEY,
  from_agent TEXT NOT NULL,
  to_agent TEXT NOT NULL,
  task TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_agent ON events(agent);
CREATE INDEX IF NOT EXISTS idx_tasks_to_agent ON tasks(to_agent);

-- Enable Row Level Security (optional, for production)
-- ALTER TABLE events ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
