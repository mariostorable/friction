import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function applyMigration() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  );

  console.log('\n=== Applying Street Address Migration ===\n');

  // Read the migration file
  const sql = fs.readFileSync('supabase/migrations/20260216_add_street_addresses_to_visit_planner.sql', 'utf8');

  console.log('SQL to execute:');
  console.log(sql);
  console.log('\n---\n');

  try {
    // Execute the SQL using raw query
    // Split by semicolons and execute each statement separately
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    for (const statement of statements) {
      if (statement.toLowerCase().includes('drop function')) {
        console.log('Dropping existing function...');
      } else if (statement.toLowerCase().includes('create function')) {
        console.log('Creating updated function...');
      } else if (statement.toLowerCase().includes('comment on')) {
        console.log('Adding comment...');
      }

      // Use the Supabase REST API to execute raw SQL
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/exec`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY || '',
            'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({ sql: statement + ';' }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`\n❌ Failed to execute statement:`, errorText);

        // Try alternative approach using direct query
        console.log('\nTrying alternative approach with supabase.rpc...');

        const { error } = await supabase.rpc('exec', { sql: statement + ';' });
        if (error) {
          console.error('Alternative approach also failed:', error);
          throw new Error('Migration failed');
        }
      }
    }

    console.log('✅ Migration applied successfully!');
    console.log('\nThe find_nearby_accounts function now includes:');
    console.log('  - property_address_street');
    console.log('  - property_address_postal_code');
    console.log('  - billing_address_street');
    console.log('  - billing_address_postal_code');
    console.log('  - facility_count');

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    console.log('\n⚠️  You may need to apply this migration manually in Supabase SQL Editor:');
    console.log('1. Go to https://supabase.com/dashboard/project/<your-project>/sql');
    console.log('2. Paste the SQL from supabase/migrations/20260216_add_street_addresses_to_visit_planner.sql');
    console.log('3. Click "Run"');
  }
}

applyMigration().catch(console.error);
