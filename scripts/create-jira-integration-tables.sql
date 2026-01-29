-- ================================================================
-- Create Jira Integration Tables
-- Run this in Supabase SQL Editor
-- ================================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ================================================================
-- Table: jira_issues
-- Purpose: Store synced Jira tickets
-- ================================================================

CREATE TABLE IF NOT EXISTS jira_issues (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  integration_id UUID NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,

  -- Jira metadata
  jira_id TEXT NOT NULL,
  jira_key TEXT NOT NULL,
  summary TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL,
  priority TEXT,
  assignee_name TEXT,
  assignee_email TEXT,
  sprint_name TEXT,
  labels TEXT[],

  -- Dates
  created_date TIMESTAMPTZ NOT NULL,
  updated_date TIMESTAMPTZ NOT NULL,
  resolution_date TIMESTAMPTZ,

  -- Rich metadata
  issue_url TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',

  -- Timestamps
  last_synced_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, jira_key)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_jira_issues_user_id ON jira_issues(user_id);
CREATE INDEX IF NOT EXISTS idx_jira_issues_integration_id ON jira_issues(integration_id);
CREATE INDEX IF NOT EXISTS idx_jira_issues_status ON jira_issues(status);
CREATE INDEX IF NOT EXISTS idx_jira_issues_labels ON jira_issues USING GIN(labels);
CREATE INDEX IF NOT EXISTS idx_jira_issues_jira_key ON jira_issues(jira_key);

-- RLS policies
ALTER TABLE jira_issues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own jira issues"
  ON jira_issues FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own jira issues"
  ON jira_issues FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own jira issues"
  ON jira_issues FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own jira issues"
  ON jira_issues FOR DELETE
  USING (auth.uid() = user_id);

-- ================================================================
-- Table: theme_jira_links
-- Purpose: Junction table linking Jira issues to friction themes
-- ================================================================

CREATE TABLE IF NOT EXISTS theme_jira_links (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  jira_issue_id UUID NOT NULL REFERENCES jira_issues(id) ON DELETE CASCADE,
  theme_key TEXT NOT NULL,

  -- Link metadata
  match_type TEXT NOT NULL CHECK (match_type IN ('label', 'keyword', 'manual')),
  match_confidence DECIMAL(3,2) DEFAULT 0.5 CHECK (match_confidence >= 0.0 AND match_confidence <= 1.0),

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(jira_issue_id, theme_key)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_theme_jira_links_theme_key ON theme_jira_links(theme_key);
CREATE INDEX IF NOT EXISTS idx_theme_jira_links_jira_issue_id ON theme_jira_links(jira_issue_id);
CREATE INDEX IF NOT EXISTS idx_theme_jira_links_user_id ON theme_jira_links(user_id);

-- RLS
ALTER TABLE theme_jira_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own theme jira links"
  ON theme_jira_links FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own theme jira links"
  ON theme_jira_links FOR ALL
  USING (auth.uid() = user_id);

-- ================================================================
-- Verification Queries
-- ================================================================

-- Verify tables were created
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('jira_issues', 'theme_jira_links');

-- Verify indexes
SELECT indexname, tablename
FROM pg_indexes
WHERE tablename IN ('jira_issues', 'theme_jira_links');

-- Verify RLS is enabled
SELECT tablename, rowsecurity
FROM pg_tables
WHERE tablename IN ('jira_issues', 'theme_jira_links');
