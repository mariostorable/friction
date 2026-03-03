-- Add / update SiteLink account short names in client_name_aliases.
-- These are the exact strings that appear in SL/SLT/PAY ticket summaries
-- and are used by Strategy 3 (account_name scan) in Jira sync.
-- Uses DO UPDATE so existing rows get corrected sf_account_name if needed.

INSERT INTO client_name_aliases (jira_short_name, sf_account_name, notes) VALUES
  -- Longer, unambiguous forms that appear verbatim in SiteLink ticket text
  ('Storage Asset Management',  'Storage Asset Management - CORP',              'SL ticket text form'),
  ('SecureSpace Management',    'SecureSpace Management LLC - CORP',             'SL ticket text form'),
  ('Elite-Stor',                'Elite-Stor Storage - CORP',                     'SL ticket text form'),
  ('Prime Group Holdings',      'Prime Group Holdings, LLC - CORP',              'SL ticket text form'),
  ('Recreational Realty',       'Recreational Realty - CORP',                    'SL ticket text form'),
  ('TnT Management',            'TnT Management - CORP',                         'SL ticket text form - already exists, update notes'),
  ('Right Move Storage',        'Right Move Storage - CORP',                     'SL ticket text form'),
  ('William Warren',            'William Warren Group - CORP.',                  'SL/StorQuest ticket text form'),
  ('StorQuest',                 'William Warren Group - CORP.',                  'SL brand name'),
  ('SiteLink',                  NULL,                                             'Generic SiteLink product mention — skip'),
  -- Additional cross-product forms
  ('West Coast Self-Storage',   'West Coast Self-Storage - CORP.',               'Full name form'),
  ('Andover Properties',        'Andover Properties - Storage King USA - CORP.', 'Full name form'),
  ('Clark Properties',          'Clark Properties (All Aboard Storage) - CORP. OFFICE', 'Full name form'),
  ('Spartan Investment',        'Spartan Investment Group - CORP.',               'Full name form'),
  ('Storage King USA',          'Andover Properties - Storage King USA - CORP.', 'Brand name form')
ON CONFLICT (jira_short_name) DO UPDATE
  SET sf_account_name = EXCLUDED.sf_account_name,
      notes = EXCLUDED.notes;
