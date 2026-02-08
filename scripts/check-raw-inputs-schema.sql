-- Check raw_inputs table structure
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'raw_inputs'
ORDER BY ordinal_position;
