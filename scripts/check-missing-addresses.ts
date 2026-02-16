import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function checkAddresses() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  );

  const userId = 'ab953672-7bad-4601-9289-5d766e73fec9';

  console.log('\n=== Checking Street Address Coverage ===\n');

  // Get all accounts in portfolios
  const { data: portfolios } = await supabase
    .from('portfolios')
    .select('account_ids')
    .eq('user_id', userId)
    .in('portfolio_type', ['top_25_edge', 'top_25_marine', 'top_25_sitelink']);

  const allAccountIds = new Set<string>();
  portfolios?.forEach(p => p.account_ids.forEach((id: string) => allAccountIds.add(id)));

  console.log(`Total accounts in portfolios: ${allAccountIds.size}\n`);

  // Get all accounts
  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, name, property_address_street, billing_address_street, property_address_city, billing_address_city')
    .in('id', Array.from(allAccountIds));

  if (!accounts) {
    console.log('No accounts found');
    return;
  }

  // Count address coverage
  let withPropertyStreet = 0;
  let withBillingStreet = 0;
  let withEitherStreet = 0;
  let withNeither = 0;

  const accountsWithoutStreet: any[] = [];

  accounts.forEach(account => {
    const hasProperty = !!account.property_address_street;
    const hasBilling = !!account.billing_address_street;

    if (hasProperty) withPropertyStreet++;
    if (hasBilling) withBillingStreet++;
    if (hasProperty || hasBilling) {
      withEitherStreet++;
    } else {
      withNeither++;
      accountsWithoutStreet.push(account);
    }
  });

  console.log('📊 Street Address Coverage:');
  console.log(`  With property street: ${withPropertyStreet} (${Math.round(withPropertyStreet / accounts.length * 100)}%)`);
  console.log(`  With billing street: ${withBillingStreet} (${Math.round(withBillingStreet / accounts.length * 100)}%)`);
  console.log(`  With either street: ${withEitherStreet} (${Math.round(withEitherStreet / accounts.length * 100)}%)`);
  console.log(`  With neither: ${withNeither} (${Math.round(withNeither / accounts.length * 100)}%)`);

  if (accountsWithoutStreet.length > 0) {
    console.log(`\n❌ Accounts without street address (${accountsWithoutStreet.length}):`);
    accountsWithoutStreet.slice(0, 15).forEach(account => {
      console.log(`  - ${account.name}`);
      console.log(`    Property city: ${account.property_address_city || 'None'}`);
      console.log(`    Billing city: ${account.billing_address_city || 'None'}`);
    });

    if (accountsWithoutStreet.length > 15) {
      console.log(`  ... and ${accountsWithoutStreet.length - 15} more`);
    }
  }

  console.log('\n💡 Solution:');
  console.log('  These accounts likely don\'t have ShippingStreet or BillingStreet in Salesforce.');
  console.log('  Run Salesforce sync to update with latest data, or check Salesforce records.');
}

checkAddresses().catch(console.error);
