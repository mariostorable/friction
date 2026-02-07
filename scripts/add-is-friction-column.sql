-- Add is_friction column to friction_cards table
-- This distinguishes real product/UX friction from normal support requests

ALTER TABLE friction_cards
ADD COLUMN IF NOT EXISTS is_friction BOOLEAN DEFAULT true;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_friction_cards_is_friction ON friction_cards(is_friction);

-- Create combined index for common queries
CREATE INDEX IF NOT EXISTS idx_friction_cards_account_friction
ON friction_cards(account_id, is_friction, created_at DESC);

COMMENT ON COLUMN friction_cards.is_friction IS
'True if this is a systemic product/UX friction issue. False for normal support requests like how-to questions, data updates, or onboarding tasks.';
