-- Create account_jira_links table to link Jira tickets directly to accounts
CREATE TABLE IF NOT EXISTS account_jira_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  jira_issue_id UUID NOT NULL REFERENCES jira_issues(id) ON DELETE CASCADE,
  match_type TEXT NOT NULL, -- 'account_name', 'manual'
  match_confidence DECIMAL(3,2) NOT NULL DEFAULT 0.5, -- 0.0 to 1.0
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(account_id, jira_issue_id)
);

-- Add RLS policies
ALTER TABLE account_jira_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own account-jira links"
  ON account_jira_links FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own account-jira links"
  ON account_jira_links FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own account-jira links"
  ON account_jira_links FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own account-jira links"
  ON account_jira_links FOR DELETE
  USING (auth.uid() = user_id);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_account_jira_links_account_id ON account_jira_links(account_id);
CREATE INDEX IF NOT EXISTS idx_account_jira_links_jira_issue_id ON account_jira_links(jira_issue_id);
CREATE INDEX IF NOT EXISTS idx_account_jira_links_user_id ON account_jira_links(user_id);
