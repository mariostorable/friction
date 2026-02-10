/**
 * Check address data for a specific account
 * Usage: npx tsx scripts/check-account-address.ts "Account Name"
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

async function checkAccount(accountName: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing required environment variables');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  // Query account
  const { data: accounts, error } = await supabase
    .from('accounts')
    .select('*')
    .ilike('name', `%${accountName}%`)
    .limit(5);

  if (error) {
    console.error('Query error:', error);
    process.exit(1);
  }

  if (!accounts || accounts.length === 0) {
    console.log(`No accounts found matching "${accountName}"`);
    process.exit(0);
  }

  console.log(`\nFound ${accounts.length} account(s):\n`);

  accounts.forEach((account, i) => {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`Account ${i + 1}: ${account.name}`);
    console.log(`${'='.repeat(80)}`);
    console.log('\nBasic Info:');
    console.log(`  ID: ${account.id}`);
    console.log(`  Salesforce ID: ${account.salesforce_id}`);
    console.log(`  ARR: $${account.arr ? (account.arr / 1000).toFixed(0) : 0}K`);
    console.log(`  Vertical: ${account.vertical}`);
    console.log(`  Products: ${account.products || 'None'}`);

    console.log('\nProperty Address (Primary):');
    console.log(`  Street: ${account.property_address_street || '(not set)'}`);
    console.log(`  City: ${account.property_address_city || '(not set)'}`);
    console.log(`  State: ${account.property_address_state || '(not set)'}`);
    console.log(`  Postal Code: ${account.property_address_postal_code || '(not set)'}`);
    console.log(`  Country: ${account.property_address_country || '(not set)'}`);

    console.log('\nBilling Address (Fallback):');
    console.log(`  Street: ${account.billing_address_street || '(not set)'}`);
    console.log(`  City: ${account.billing_address_city || '(not set)'}`);
    console.log(`  State: ${account.billing_address_state || '(not set)'}`);
    console.log(`  Postal Code: ${account.billing_address_postal_code || '(not set)'}`);
    console.log(`  Country: ${account.billing_address_country || '(not set)'}`);

    console.log('\nGeocoding:');
    console.log(`  Latitude: ${account.latitude || '(not set)'}`);
    console.log(`  Longitude: ${account.longitude || '(not set)'}`);
    console.log(`  Source: ${account.geocode_source || '(not set)'}`);
    console.log(`  Quality: ${account.geocode_quality || '(not set)'}`);
    console.log(`  Geocoded At: ${account.geocoded_at || '(not set)'}`);
  });
}

// Get account name from command line
const accountName = process.argv[2];

if (!accountName) {
  console.error('Usage: npx tsx scripts/check-account-address.ts "Account Name"');
  console.error('Example: npx tsx scripts/check-account-address.ts "10 Federal Storage"');
  process.exit(1);
}

checkAccount(accountName).catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
