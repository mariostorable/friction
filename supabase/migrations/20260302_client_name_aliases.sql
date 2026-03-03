-- Client name aliases: maps Jira customfield_12184 short names to Salesforce account names
-- Used by Jira sync (Strategy 2 - client_field) to resolve ambiguous short names.
-- Source: Looker source of truth + Salesforce account data.

CREATE TABLE IF NOT EXISTS client_name_aliases (
  id            SERIAL PRIMARY KEY,
  jira_short_name  TEXT NOT NULL,       -- value appearing in customfield_12184, e.g. "10 Federal"
  sf_account_name  TEXT,               -- Salesforce account.name to match, NULL means skip/flag
  notes            TEXT,               -- human-readable note (e.g. "ambiguous - needs case to resolve")
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_client_aliases_short_name ON client_name_aliases(jira_short_name);

-- Seed with known mappings from Looker source of truth
INSERT INTO client_name_aliases (jira_short_name, sf_account_name, notes) VALUES
  ('10 Federal',              '10 Federal Storage - CORP.',                         NULL),
  ('A-American',              NULL,                                                  'No direct SF match - skip'),
  ('All Aboard Storage',      'Clark Properties (All Aboard Storage) - CORP. OFFICE', NULL),
  ('Attic Management Group',  'Attic Management Group - CORP',                       NULL),
  ('Columbia',                NULL,                                                  'Ambiguous - manual review'),
  ('Copper',                  NULL,                                                  'Ambiguous - manual review'),
  ('Elite-Stor (SROA)',       'Elite-Stor Storage - CORP',                           NULL),
  ('Go Store It',             'Go Store It Management LLC - CORP',                   NULL),
  ('Lock It Up',              'SHS Development Company dba The Lock Up Self Storage - CORP.', NULL),
  ('Mayflower Properties',    'Mayflower Properties - Home Office',                  NULL),
  ('MiniMall',                NULL,                                                  'Maps to multiple - needs case to disambiguate'),
  ('MyPlace',                 'MyPlace Property Services LLC - CORP',                NULL),
  ('National Storage Management', 'National Storage Management - CORP',             NULL),
  ('New Crescendo',           'New Crescendo LLC - CORP',                            NULL),
  ('Osprey',                  NULL,                                                  'Ambiguous - manual review'),
  ('Otter Storage Management','Otter Storage Management - CORP.',                    NULL),
  ('Prime',                   'Prime Group Holdings, LLC - CORP',                    NULL),
  ('Public Storage Canada',   NULL,                                                  'Not in active accounts - skip'),
  ('RecNation',               'Recreational Realty - CORP',                          NULL),
  ('Right Move Storage',      'Right Move Storage - CORP',                           NULL),
  ('SAM',                     'Storage Asset Management - CORP',                     NULL),
  ('SecureSpace',             'SecureSpace Management LLC - CORP',                   NULL),
  ('Spartan',                 'Spartan Investment Group - CORP.',                    NULL),
  ('StorEase',                'StoreEase - CORP',                                    NULL),
  ('StorQuest',               NULL,                                                  'Maps to multiple - needs case to disambiguate'),
  ('Storage King',            'Andover Properties - Storage King USA - CORP.',       NULL),
  ('StorageMart',             'SMARTCO Properties, L.P - StorageMart - CORP.',       NULL),
  ('The Lock Up',             'SHS Development Company dba The Lock Up Self Storage - CORP.', NULL),
  ('The Storage Mall',        'The Storage Mall - CORP.',                            NULL),
  ('TnT Management',          'TnT Management - CORP',                               NULL),
  ('West Coast',              'West Coast Self-Storage - CORP.',                     NULL),
  ('White Label',             'White Label Storage Management - CORP',               NULL)
ON CONFLICT (jira_short_name) DO NOTHING;

-- Index for fast lookup by sf_account_name
CREATE INDEX IF NOT EXISTS idx_client_aliases_sf_name ON client_name_aliases(sf_account_name)
  WHERE sf_account_name IS NOT NULL;
