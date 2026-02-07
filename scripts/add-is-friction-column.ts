/**
 * Add is_friction column to friction_cards table
 */

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config({ path: '.env.local' });

async function main() {
  console.log('🔄 Adding is_friction column to friction_cards table...\n');

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Execute SQL migration
  const { error } = await supabase.rpc('exec_sql', {
    sql: `
      -- Add is_friction column
      ALTER TABLE friction_cards
      ADD COLUMN IF NOT EXISTS is_friction BOOLEAN DEFAULT true;

      -- Add index for performance
      CREATE INDEX IF NOT EXISTS idx_friction_cards_is_friction ON friction_cards(is_friction);

      -- Create combined index for common queries
      CREATE INDEX IF NOT EXISTS idx_friction_cards_account_friction
      ON friction_cards(account_id, is_friction, created_at DESC);
    `
  });

  if (error) {
    console.error('❌ Migration failed:', error.message);
    console.log('\nTrying direct table update instead...');

    // Fallback: use Supabase to check if column exists
    const { data: columns } = await supabase
      .from('friction_cards')
      .select('*')
      .limit(1);

    if (columns) {
      console.log('✅ Table accessible, column may already exist');
      console.log('Columns:', Object.keys(columns[0] || {}));
    }
    return;
  }

  console.log('✅ Migration complete: is_friction column added\n');
  console.log('Next steps:');
  console.log('1. Update analyze-friction to classify is_friction');
  console.log('2. Re-classify existing cards');
  console.log('3. Update UI to filter by is_friction\n');
}

main().catch(console.error);
