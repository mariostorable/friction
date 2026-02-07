-- Migration: Add 'vitally_note' to allowed source_type values for raw_inputs table
-- This fixes 400 errors when syncing Vitally notes
-- Run this in Supabase Dashboard → SQL Editor

-- Step 1: Check what type of constraint exists on source_type
SELECT
  'Current constraint type: ' ||
  CASE
    WHEN EXISTS (SELECT 1 FROM pg_type WHERE typname = 'source_type_enum') THEN 'ENUM'
    WHEN EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'raw_inputs'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%source_type%'
    ) THEN 'CHECK CONSTRAINT'
    ELSE 'NONE or TEXT'
  END AS constraint_type;

-- Step 2: Add vitally_note to enum type if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'source_type_enum') THEN
    -- Only add if it doesn't already exist
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum
      WHERE enumlabel = 'vitally_note'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'source_type_enum')
    ) THEN
      ALTER TYPE source_type_enum ADD VALUE 'vitally_note';
      RAISE NOTICE 'Added vitally_note to source_type_enum';
    ELSE
      RAISE NOTICE 'vitally_note already exists in source_type_enum';
    END IF;
  END IF;
END $$;

-- Step 3: Update CHECK constraint if it exists
DO $$
DECLARE
  constraint_name text;
  constraint_def text;
BEGIN
  -- Find CHECK constraint on source_type
  SELECT conname, pg_get_constraintdef(oid)
  INTO constraint_name, constraint_def
  FROM pg_constraint
  WHERE conrelid = 'raw_inputs'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%source_type%';

  IF constraint_name IS NOT NULL THEN
    -- Check if vitally_note is already in the constraint
    IF constraint_def NOT LIKE '%vitally_note%' THEN
      RAISE NOTICE 'Dropping existing constraint: %', constraint_name;
      EXECUTE format('ALTER TABLE raw_inputs DROP CONSTRAINT %I', constraint_name);

      RAISE NOTICE 'Creating new constraint with vitally_note';
      ALTER TABLE raw_inputs ADD CONSTRAINT check_source_type
        CHECK (source_type IN ('salesforce_case', 'salesforce_note', 'manual', 'zendesk', 'gong', 'slack', 'vitally_note'));
    ELSE
      RAISE NOTICE 'vitally_note already exists in CHECK constraint';
    END IF;
  END IF;
END $$;

-- Step 4: Verify the change worked
SELECT
  'Migration complete. Testing insert...' AS status;

-- You can test by running:
-- INSERT INTO raw_inputs (user_id, source_type, source_id, text_content, metadata, processed)
-- VALUES (
--   (SELECT id FROM auth.users LIMIT 1),
--   'vitally_note',
--   'test-' || NOW()::text,
--   'Test vitally note',
--   '{}'::jsonb,
--   true
-- )
-- RETURNING id;
--
-- Then delete the test record:
-- DELETE FROM raw_inputs WHERE source_id LIKE 'test-%';
