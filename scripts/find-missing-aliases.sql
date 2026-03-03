-- Find Salesforce account names for unmapped Jira client field values
-- Run in Supabase SQL Editor

-- 1. Broad search for potential matches
SELECT name, status, vertical, products
FROM accounts
WHERE (
  name ILIKE '%cubix%' OR
  name ILIKE '%all purpose%' OR
  name ILIKE '%five star%' OR
  name ILIKE '%atomic%' OR
  name ILIKE '%metro%' OR
  name ILIKE '%storquest%' OR
  name ILIKE '%stor quest%' OR
  name ILIKE '%osprey%' OR
  name ILIKE '%minimall%' OR
  name ILIKE '%mini mall%' OR
  name ILIKE '%columbia%' OR
  name ILIKE '%copper%'
)
ORDER BY status, name;

-- 2. "KO" is likely an abbreviation -- search for common patterns
-- SELECT name FROM accounts WHERE name ILIKE 'K.O.%' OR name ILIKE 'KO %' OR name ILIKE '%KO Storage%' ORDER BY name;

-- 3. StorQuest -- search broadly (maps to multiple?)
-- SELECT name FROM accounts WHERE name ILIKE '%storquest%' OR name ILIKE '%stor quest%' ORDER BY name;
