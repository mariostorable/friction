#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const { data: accounts, error } = await supabase
  .from('accounts')
  .select('id, salesforce_id, name, property_address_street, property_address_city, billing_address_street, billing_address_city, updated_at')
  .or('name.ilike.%10 Federal%,name.ilike.%Elite%')
  .order('name');

if (error) {
  console.error('Error:', error);
  process.exit(1);
}

console.log('\n🔍 Found', accounts.length, 'matching accounts:\n');
accounts.forEach(acc => {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Name:', acc.name);
  console.log('Salesforce ID:', acc.salesforce_id);
  console.log('Property Address:', acc.property_address_street, acc.property_address_city);
  console.log('Billing Address:', acc.billing_address_street, acc.billing_address_city);
  console.log('Last Updated:', acc.updated_at);
  console.log('');
});

console.log('✅ Done!');
