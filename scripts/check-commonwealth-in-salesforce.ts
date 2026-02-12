/**
 * Check what data Salesforce has for Commonwealth Storage
 */
import { createClient } from '@supabase/supabase-js';
import { getDecryptedToken } from '../lib/encryption';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function checkCommonwealthInSalesforce() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Get integration
  const { data: integrations } = await supabase
    .from('integrations')
    .select('*')
    .eq('integration_type', 'salesforce')
    .eq('status', 'active')
    .order('connected_at', { ascending: false })
    .limit(1);

  const integration = integrations?.[0];

  if (!integration) {
    console.error('No Salesforce integration found');
    process.exit(1);
  }

  // Get tokens
  const tokens = await getDecryptedToken(supabase, integration.id);

  if (!tokens?.access_token) {
    console.error('No tokens found');
    process.exit(1);
  }

  console.log('Checking Commonwealth Storage in Salesforce...\n');

  // Query for Commonwealth directly
  const query = `SELECT Id, Name, MRR_Core_Products__c, ShippingCity, BillingCity, ShippingStreet, BillingStreet, ShippingState, BillingState FROM Account WHERE Name LIKE '%Commonwealth Storage%'`;
  const queryUrl = `${integration.instance_url}/services/data/v59.0/query?q=${encodeURIComponent(query)}`;

  const response = await fetch(queryUrl, {
    headers: {
      'Authorization': `Bearer ${tokens.access_token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    console.error('Error:', response.status, response.statusText);
    const text = await response.text();
    console.error(text);
    process.exit(1);
  }

  const data = await response.json();

  if (data.records && data.records.length > 0) {
    console.log(`Found ${data.records.length} Commonwealth account(s) in Salesforce:\n`);

    data.records.forEach((account: any) => {
      console.log(`Account: ${account.Name}`);
      console.log(`  ID: ${account.Id}`);
      console.log(`  MRR_Core_Products__c: ${account.MRR_Core_Products__c || 'NULL'}`);
      console.log(`  ShippingCity: ${account.ShippingCity || 'NULL'}`);
      console.log(`  BillingCity: ${account.BillingCity || 'NULL'}`);
      console.log(`  ShippingStreet: ${account.ShippingStreet || 'NULL'}`);
      console.log(`  BillingStreet: ${account.BillingStreet || 'NULL'}`);
      console.log(`  ShippingState: ${account.ShippingState || 'NULL'}`);
      console.log(`  BillingState: ${account.BillingState || 'NULL'}`);
      console.log('');
    });

    // Check if it would match our query
    console.log('Would Commonwealth match our sync query?');
    data.records.forEach((account: any) => {
      const matchesQuery = account.ShippingCity || account.BillingCity;
      console.log(`  ${account.Name}: ${matchesQuery ? '✓ YES' : '✗ NO (missing both ShippingCity and BillingCity)'}`);
    });
  } else {
    console.log('No Commonwealth accounts found in Salesforce');
  }
}

checkCommonwealthInSalesforce().catch(console.error);
