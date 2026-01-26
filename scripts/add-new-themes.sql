-- Add new friction themes to reduce "other" classifications
-- Run this in Supabase SQL editor

INSERT INTO themes (theme_key, label, description, severity_weight, is_active) VALUES
  ('data_quality', 'Data Quality Issues', 'Incorrect, missing, or inconsistent data in the system', 0.8, true),
  ('reporting_issues', 'Reporting & Analytics', 'Problems with reports, exports, dashboards, or analytics', 0.7, true),
  ('access_permissions', 'Access & Permissions', 'User access issues, role permissions, login problems', 0.9, true),
  ('configuration_problems', 'Configuration Issues', 'Settings not working properly, setup problems', 0.7, true),
  ('notification_issues', 'Notification Problems', 'Email alerts, in-app notifications not working', 0.6, true),
  ('workflow_inefficiency', 'Workflow Inefficiencies', 'Processes that are too complex or time-consuming', 0.7, true),
  ('mobile_issues', 'Mobile Problems', 'Mobile app or mobile web functionality issues', 0.7, true),
  ('documentation_gaps', 'Documentation Gaps', 'Help docs missing, outdated, or unclear', 0.5, true)
ON CONFLICT (theme_key) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  severity_weight = EXCLUDED.severity_weight,
  is_active = EXCLUDED.is_active;

-- Verify the themes
SELECT theme_key, label, severity_weight, is_active
FROM themes
WHERE is_active = true
ORDER BY label;
