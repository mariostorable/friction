-- Check friction analysis status

-- Total Salesforce cases
SELECT 'Total Salesforce Cases' as metric, COUNT(*) as count
FROM raw_inputs
WHERE source_type = 'salesforce'

UNION ALL

-- Friction cards created
SELECT 'Friction Cards Created' as metric, COUNT(*) as count
FROM friction_cards
WHERE is_friction = true

UNION ALL

-- Friction themes found
SELECT 'Unique Friction Themes' as metric, COUNT(DISTINCT theme_key) as count
FROM friction_cards
WHERE is_friction = true
  AND theme_key IS NOT NULL

UNION ALL

-- Cases analyzed
SELECT 'Cases Analyzed' as metric, COUNT(DISTINCT raw_input_id) as count
FROM friction_cards;

-- Show sample themes if any exist
SELECT DISTINCT theme_key, COUNT(*) as count
FROM friction_cards
WHERE is_friction = true
  AND theme_key IS NOT NULL
GROUP BY theme_key
ORDER BY count DESC
LIMIT 10;
