-- Migration: Add products field and fix vertical field to represent business unit
-- Date: 2026-01-28
-- Purpose: Separate product information from business unit (vertical)

-- Step 1: Add products column to store product list
ALTER TABLE accounts
ADD COLUMN IF NOT EXISTS products TEXT;

-- Step 2: Migrate existing vertical data to products
-- (Current vertical contains product strings like "Software (EDGE), Marketplace (SpareFoot)")
UPDATE accounts
SET products = vertical
WHERE vertical IS NOT NULL
  AND (vertical LIKE '%Software%' OR vertical LIKE '%Marketplace%' OR vertical LIKE '%Insurance%');

-- Step 3: Set vertical to null for now (will be populated from Industry on next Salesforce sync)
-- Keep storage/marine/rv values if they exist
UPDATE accounts
SET vertical = CASE
  WHEN vertical IN ('storage', 'marine', 'rv') THEN vertical
  ELSE NULL
END;

-- Step 4: Verify migration
SELECT
  COUNT(*) as total_accounts,
  COUNT(CASE WHEN products IS NOT NULL THEN 1 END) as with_products,
  COUNT(CASE WHEN vertical IS NOT NULL THEN 1 END) as with_vertical,
  COUNT(CASE WHEN vertical = 'storage' THEN 1 END) as storage_accounts,
  COUNT(CASE WHEN vertical = 'marine' THEN 1 END) as marine_accounts,
  COUNT(CASE WHEN vertical = 'rv' THEN 1 END) as rv_accounts
FROM accounts;

-- Step 5: Show sample data to verify
SELECT
  name,
  vertical as business_unit,
  products,
  (metadata->>'industry')::text as industry
FROM accounts
LIMIT 10;
