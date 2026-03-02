-- Purge account_jira_links created by invalid matching strategies.
--
-- BACKGROUND:
--   - account_name: scanned ticket title/description for account name text → false positives
--     (e.g. Westport Properties linked to tickets that merely mentioned them in description templates)
--   - theme_association: linked tickets to accounts because they shared a friction theme →
--     e.g. any account with "support_response_time" friction got WEB-4784 (186 accounts linked)
--
-- SAFE TO RUN: Only deletes rows where match_type IN ('account_name', 'theme_association').
-- salesforce_case and client_field rows are untouched.
--
-- Run in Supabase SQL Editor, then re-sync Jira to rebuild correct links.

-- Preview what will be deleted first:
SELECT match_type, COUNT(*) as count
FROM account_jira_links
GROUP BY match_type
ORDER BY count DESC;

-- Delete the bad rows:
DELETE FROM account_jira_links
WHERE match_type IN ('account_name', 'theme_association', 'theme_and_name');

-- Verify cleanup:
SELECT match_type, COUNT(*) as count
FROM account_jira_links
GROUP BY match_type
ORDER BY count DESC;
