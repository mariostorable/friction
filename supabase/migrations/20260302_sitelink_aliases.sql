-- Add SiteLink account short names to client_name_aliases
-- These names appear in SL/SLT/PAY ticket summaries and descriptions.
-- Used by Strategy 3 (account_name scan) in Jira sync for tickets
-- that don't have customfield_12184 (EDGE-specific field) populated.

INSERT INTO client_name_aliases (jira_short_name, sf_account_name, notes) VALUES
  -- SiteLink-primary accounts (appear in SL/SLT ticket text)
  ('SecureSpace',           'SecureSpace Management LLC - CORP',           NULL),
  ('Storage Asset',         'Storage Asset Management - CORP',             NULL),
  ('Elite-Stor',            'Elite-Stor Storage - CORP',                   NULL),
  ('Prime Group',           'Prime Group Holdings, LLC - CORP',            NULL),
  ('RecNation',             'Recreational Realty - CORP',                  NULL),
  ('TnT',                   'TnT Management - CORP',                       NULL),
  ('New Crescendo',         'New Crescendo LLC - CORP',                    NULL),
  ('Right Move',            'Right Move Storage - CORP',                   NULL),
  ('William Warren',        'William Warren Group - CORP.',                NULL),
  ('SiteLink',              NULL,                                           'Generic SiteLink product mention — skip'),
  -- Cross-product accounts that also appear in SL tickets
  ('West Coast Self-Storage','West Coast Self-Storage - CORP.',            NULL),
  ('Andover',               'Andover Properties - Storage King USA - CORP.', NULL),
  ('Clark Properties',      'Clark Properties (All Aboard Storage) - CORP. OFFICE', NULL),
  ('Spartan Investment',    'Spartan Investment Group - CORP.',            NULL)
ON CONFLICT (jira_short_name) DO NOTHING;
