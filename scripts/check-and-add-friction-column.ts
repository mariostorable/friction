/**
 * Check if is_friction column exists and provide migration instructions
 */

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config({ path: '.env.local' });

async function main() {
  console.log('🔍 Checking is_friction column status...\n');

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Try to query with is_friction column
  const { data, error } = await supabase
    .from('friction_cards')
    .select('id, is_friction')
    .limit(1);

  if (error) {
    console.log('❌ is_friction column does NOT exist yet\n');
    console.log('📋 Run this SQL in Supabase SQL Editor:\n');
    console.log('=' .repeat(80));
    console.log(`
-- Add is_friction column to friction_cards table
ALTER TABLE friction_cards
ADD COLUMN IF NOT EXISTS is_friction BOOLEAN DEFAULT true;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_friction_cards_is_friction
ON friction_cards(is_friction);

-- Create combined index for common queries
CREATE INDEX IF NOT EXISTS idx_friction_cards_account_friction
ON friction_cards(account_id, is_friction, created_at DESC);

COMMENT ON COLUMN friction_cards.is_friction IS
'True if this is a systemic product/UX friction issue. False for normal support requests.';
    `);
    console.log('=' .repeat(80));
    console.log('\n💡 Go to: https://supabase.com/dashboard → SQL Editor → New Query');
    console.log('   Paste the SQL above and click Run\n');
  } else {
    console.log('✅ is_friction column already exists\n');
    console.log('Sample data:');
    if (data && data.length > 0) {
      console.log(`  ID: ${data[0].id}`);
      console.log(`  is_friction: ${data[0].is_friction}`);
    }
    console.log('\nReady to proceed with re-classification!\n');
  }
}

main().catch(console.error);
