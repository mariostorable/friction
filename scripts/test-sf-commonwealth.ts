import { createClient } from '@supabase/supabase-js';
import { getDecryptedToken } from '../lib/encryption';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function testQuery() {
  // Get integration (most recent)
  const { data: integrations } = await supabase
    .from('integrations')
    .select('*')
    .eq('integration_type', 'salesforce')
    .eq('status', 'active')
    .order('connected_at', { ascending: false })
    .limit(1);

  const integration = integrations?.[0];

  if (!integration) {
    console.log('No Salesforce integration');
    return;
  }

  // Get decrypted token
  const tokens = await getDecryptedToken(supabase, integration.id);

  if (!tokens?.access_token) {
    console.log('No access token');
    return;
  }

  const url = integration.instance_url;

  // First, search for Commonwealth directly
  console.log('1. Searching for Commonwealth by name...\n');
  const searchQuery = "SELECT Id, Name, MRR_MVR__c, ShippingCity, BillingCity FROM Account WHERE Name LIKE '%Commonwealth%'";
  const searchUrl = `${url}/services/data/v59.0/query?q=${encodeURIComponent(searchQuery)}`;

  const searchRes = await fetch(searchUrl, {
    headers: { Authorization: `Bearer ${tokens.access_token}` }
  });

  const searchData = await searchRes.json();
  console.log('Found accounts:', searchData.records?.length || 0);

  if (searchData.records?.length > 0) {
    searchData.records.forEach((acc: any) => {
      console.log(`\n  ${acc.Name}`);
      console.log(`    ID: ${acc.Id}`);
      console.log(`    MRR: ${acc.MRR_MVR__c || 'NULL'}`);
      console.log(`    ARR: $${acc.MRR_MVR__c ? (acc.MRR_MVR__c * 12).toLocaleString() : '0'}`);
      console.log(`    ShippingCity: ${acc.ShippingCity || 'NULL'}`);
      console.log(`    BillingCity: ${acc.BillingCity || 'NULL'}`);
    });
  }

  // Now test the actual sync query
  console.log('\n\n2. Testing actual sync query (first 50 results)...\n');
  const syncQuery = "SELECT Id, Name, MRR_MVR__c, ShippingCity, BillingCity FROM Account WHERE (ShippingCity != null OR BillingCity != null) ORDER BY MRR_MVR__c DESC NULLS LAST LIMIT 50";
  const syncUrl = `${url}/services/data/v59.0/query?q=${encodeURIComponent(syncQuery)}`;

  const syncRes = await fetch(syncUrl, {
    headers: { Authorization: `Bearer ${tokens.access_token}` }
  });

  const syncData = await syncRes.json();
  console.log('Sync query returned:', syncData.records?.length || 0, 'accounts');

  const commonwealth = syncData.records?.find((a: any) => a.Name?.includes('Commonwealth'));

  if (commonwealth) {
    console.log('\n✓ Commonwealth IS in sync query results');
  } else {
    console.log('\n✗ Commonwealth NOT in sync query results (checking all 2000...)');

    // Check the full 2000
    const fullQuery = "SELECT Id, Name, MRR_MVR__c FROM Account WHERE (ShippingCity != null OR BillingCity != null) ORDER BY MRR_MVR__c DESC NULLS LAST LIMIT 2000";
    const fullUrl = `${url}/services/data/v59.0/query?q=${encodeURIComponent(fullQuery)}`;

    const fullRes = await fetch(fullUrl, {
      headers: { Authorization: `Bearer ${tokens.access_token}` }
    });

    const fullData = await fullRes.json();
    const foundInFull = fullData.records?.find((a: any) => a.Name?.includes('Commonwealth'));

    if (foundInFull) {
      console.log('✓ Commonwealth found in full 2000 results');
      console.log(`  Position: ${fullData.records?.findIndex((a: any) => a.Name?.includes('Commonwealth')) + 1} / ${fullData.records?.length}`);
    } else {
      console.log('✗ Commonwealth NOT in full 2000 results');
      console.log('   This means Commonwealth either:');
      console.log('   - Has NULL for both ShippingCity AND BillingCity in Salesforce');
      console.log('   - Is beyond position 2000 when sorted by MRR');
    }
  }
}

testQuery().catch(console.error);
