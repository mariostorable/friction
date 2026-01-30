-- ================================================================
-- Automatically fix portfolios by adding all missing accounts
-- This will make the cron job start processing them
-- ================================================================

-- This script identifies which user each account belongs to and adds
-- them to the appropriate portfolio based on their products

-- STEP 1: Add Marine accounts to top_25_marine portfolios
DO $$
DECLARE
  marine_account RECORD;
  user_portfolio RECORD;
BEGIN
  -- For each marine account not in a portfolio
  FOR marine_account IN
    SELECT a.id, a.user_id, a.name
    FROM accounts a
    WHERE (
      a.name ILIKE '%marine%'
      OR a.name ILIKE '%boat%'
      OR a.name ILIKE '%yacht%'
      OR a.name ILIKE '%recreational realty%'
    )
    AND a.status NOT IN ('cancelled', 'churned')
    AND a.id NOT IN (
      SELECT unnest(account_ids)
      FROM portfolios
      WHERE portfolio_type IN ('top_25_edge', 'top_25_sitelink', 'top_25_marine')
    )
  LOOP
    -- Find or create the user's marine portfolio
    SELECT * INTO user_portfolio
    FROM portfolios
    WHERE user_id = marine_account.user_id
      AND portfolio_type = 'top_25_marine';

    IF FOUND THEN
      -- Add account to existing portfolio
      UPDATE portfolios
      SET account_ids = account_ids || ARRAY[marine_account.id]
      WHERE id = user_portfolio.id;

      RAISE NOTICE 'Added % to top_25_marine portfolio', marine_account.name;
    ELSE
      -- Create new marine portfolio for this user
      INSERT INTO portfolios (user_id, portfolio_type, account_ids, name)
      VALUES (marine_account.user_id, 'top_25_marine', ARRAY[marine_account.id], 'Top 25 Marine');

      RAISE NOTICE 'Created top_25_marine portfolio and added %', marine_account.name;
    END IF;
  END LOOP;
END $$;


-- STEP 2: Add Edge/SiteLink storage accounts to portfolios
DO $$
DECLARE
  storage_account RECORD;
  user_portfolio RECORD;
  target_portfolio_type TEXT;
BEGIN
  -- For each storage account not in a portfolio
  FOR storage_account IN
    SELECT a.id, a.user_id, a.name, a.products
    FROM accounts a
    WHERE a.status NOT IN ('cancelled', 'churned')
    AND a.id NOT IN (
      SELECT unnest(account_ids)
      FROM portfolios
      WHERE portfolio_type IN ('top_25_edge', 'top_25_sitelink', 'top_25_marine')
    )
    AND a.name NOT ILIKE '%marine%'
    AND a.name NOT ILIKE '%boat%'
    AND a.name NOT ILIKE '%yacht%'
    AND a.name NOT ILIKE '%recreational realty%'
  LOOP
    -- Determine which portfolio type based on products
    IF storage_account.products ILIKE '%sitelink%' AND storage_account.products NOT ILIKE '%storEDGE%' THEN
      target_portfolio_type := 'top_25_sitelink';
    ELSE
      -- Default to Edge (includes null products and Edge users)
      target_portfolio_type := 'top_25_edge';
    END IF;

    -- Find the user's portfolio of this type
    SELECT * INTO user_portfolio
    FROM portfolios
    WHERE user_id = storage_account.user_id
      AND portfolio_type = target_portfolio_type;

    IF FOUND THEN
      -- Add account to existing portfolio
      UPDATE portfolios
      SET account_ids = account_ids || ARRAY[storage_account.id]
      WHERE id = user_portfolio.id;

      RAISE NOTICE 'Added % to % portfolio', storage_account.name, target_portfolio_type;
    ELSE
      -- Create new portfolio for this user
      INSERT INTO portfolios (user_id, portfolio_type, account_ids, name)
      VALUES (
        storage_account.user_id,
        target_portfolio_type,
        ARRAY[storage_account.id],
        CASE target_portfolio_type
          WHEN 'top_25_edge' THEN 'Top 25 Edge'
          WHEN 'top_25_sitelink' THEN 'Top 25 SiteLink'
          ELSE 'Portfolio'
        END
      );

      RAISE NOTICE 'Created % portfolio and added %', target_portfolio_type, storage_account.name;
    END IF;
  END LOOP;
END $$;


-- STEP 3: Verify all accounts are now in portfolios
SELECT
  CASE
    WHEN a.id = ANY(
      SELECT unnest(account_ids) FROM portfolios WHERE portfolio_type IN ('top_25_edge', 'top_25_sitelink', 'top_25_marine')
    ) THEN '✓ In Portfolio'
    ELSE '✗ NOT in portfolio'
  END as status,
  COUNT(*) as account_count
FROM accounts a
WHERE a.status NOT IN ('cancelled', 'churned')
GROUP BY 1
ORDER BY 1;

-- Expected result: All accounts should show "✓ In Portfolio"


-- STEP 4: Show portfolio summary
SELECT
  portfolio_type,
  user_id,
  array_length(account_ids, 1) as num_accounts
FROM portfolios
WHERE portfolio_type IN ('top_25_edge', 'top_25_sitelink', 'top_25_marine')
ORDER BY portfolio_type, user_id;
