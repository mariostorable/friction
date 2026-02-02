-- Add extended Jira fields for better roadmap tracking

-- Update theme_jira_links match_type to support 'component' matching
-- Note: If match_type is a text column, this is not needed
-- If it's an enum, you may need to alter the type definition

-- Add new columns to jira_issues table
ALTER TABLE jira_issues
  ADD COLUMN IF NOT EXISTS issue_type TEXT,
  ADD COLUMN IF NOT EXISTS resolution TEXT,
  ADD COLUMN IF NOT EXISTS components TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS fix_versions TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS parent_key TEXT,
  ADD COLUMN IF NOT EXISTS reporter_name TEXT,
  ADD COLUMN IF NOT EXISTS reporter_email TEXT;

-- Create indexes for filtering by these new fields
CREATE INDEX IF NOT EXISTS idx_jira_issues_issue_type ON jira_issues(issue_type);
CREATE INDEX IF NOT EXISTS idx_jira_issues_resolution ON jira_issues(resolution);
CREATE INDEX IF NOT EXISTS idx_jira_issues_components ON jira_issues USING GIN(components);
CREATE INDEX IF NOT EXISTS idx_jira_issues_fix_versions ON jira_issues USING GIN(fix_versions);
CREATE INDEX IF NOT EXISTS idx_jira_issues_parent_key ON jira_issues(parent_key);

-- Migrate existing issue_type from metadata to top-level column
UPDATE jira_issues
SET issue_type = (metadata->>'issue_type')
WHERE issue_type IS NULL AND metadata->>'issue_type' IS NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN jira_issues.issue_type IS 'Type of issue: Bug, Story, Task, Epic, etc.';
COMMENT ON COLUMN jira_issues.resolution IS 'Resolution reason: Fixed, Won''t Fix, Duplicate, Cannot Reproduce, etc.';
COMMENT ON COLUMN jira_issues.components IS 'Jira components - often maps to product areas/modules';
COMMENT ON COLUMN jira_issues.fix_versions IS 'Target release versions for this issue';
COMMENT ON COLUMN jira_issues.parent_key IS 'Parent issue key (for subtasks) or Epic link';
COMMENT ON COLUMN jira_issues.reporter_name IS 'Name of person who reported the issue';
COMMENT ON COLUMN jira_issues.reporter_email IS 'Email of person who reported the issue';
