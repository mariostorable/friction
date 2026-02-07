/**
 * Test Salesforce Connection Script
 *
 * Tests Salesforce API connectivity and diagnoses sync issues
 */

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { getDecryptedToken } from '../lib/encryption';

config({ path: '.env.local' });
config({ path: '.env' });

async function main() {
  console.log('🔍 Testing Salesforce Connection\n');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing environment variables');
    process.exit(1);
  }

  // Prompt for user ID
  const userId = process.argv[2];
  if (!userId) {
    console.error('❌ Please provide a user ID');
    console.log('\nUsage: npx tsx scripts/test-salesforce-connection.ts <user-id>');
    console.log('\nExample: npx tsx scripts/test-salesforce-connection.ts ab953672-...\n');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Get integration
  console.log(`Testing for user: ${userId}\n`);

  const { data: integration, error: intError } = await supabase
    .from('integrations')
    .select('*')
    .eq('user_id', userId)
    .eq('integration_type', 'salesforce')
    .maybeSingle();

  if (intError) {
    console.error('❌ Failed to fetch integration:', intError.message);
    process.exit(1);
  }

  if (!integration) {
    console.error('❌ No Salesforce integration found for this user');
    console.log('   User needs to connect Salesforce first');
    process.exit(1);
  }

  console.log('✅ Integration found');
  console.log(`   Instance URL: ${integration.instance_url}`);
  console.log(`   Status: ${integration.status}`);
  console.log(`   Connected: ${integration.connected_at}`);
  console.log(`   Last Synced: ${integration.last_synced_at || 'Never'}\n`);

  // Get tokens
  let tokens;
  try {
    tokens = await getDecryptedToken(supabase, integration.id);
  } catch (error) {
    console.error('❌ Failed to decrypt tokens:', error instanceof Error ? error.message : error);
    console.log('   Action: User needs to reconnect Salesforce\n');
    process.exit(1);
  }

  if (!tokens) {
    console.error('❌ No tokens found');
    console.log('   Action: User needs to reconnect Salesforce\n');
    process.exit(1);
  }

  console.log('✅ Tokens decrypted successfully\n');

  // Test 1: Verify credentials
  console.log('Test 1: Verifying credentials...');
  try {
    const identityResponse = await fetch(`${integration.instance_url}/services/oauth2/userinfo`, {
      headers: {
        'Authorization': `Bearer ${tokens.access_token}`,
      },
    });

    if (!identityResponse.ok) {
      const errorText = await identityResponse.text();
      console.error(`❌ Token verification failed (${identityResponse.status})`);
      console.error('   Error:', errorText);
      console.log('   Action: Token may be expired, user needs to reconnect\n');
      process.exit(1);
    }

    const userInfo = await identityResponse.json();
    console.log('✅ Credentials valid');
    console.log(`   User: ${userInfo.name}`);
    console.log(`   Email: ${userInfo.email}`);
    console.log(`   Org ID: ${userInfo.organization_id}\n`);
  } catch (error) {
    console.error('❌ Connection failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  }

  // Test 2: Simple query
  console.log('Test 2: Testing simple SOQL query...');
  try {
    const simpleQuery = 'SELECT Id, Name FROM Account LIMIT 5';
    const simpleResponse = await fetch(
      `${integration.instance_url}/services/data/v59.0/query?q=${encodeURIComponent(simpleQuery)}`,
      {
        headers: {
          'Authorization': `Bearer ${tokens.access_token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!simpleResponse.ok) {
      const errorText = await simpleResponse.text();
      console.error(`❌ Simple query failed (${simpleResponse.status})`);
      console.error('   Error:', errorText);
      process.exit(1);
    }

    const simpleData = await simpleResponse.json();
    console.log(`✅ Simple query successful`);
    console.log(`   Found ${simpleData.totalSize} total accounts`);
    console.log(`   Returned ${simpleData.records?.length || 0} records\n`);
  } catch (error) {
    console.error('❌ Query failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  }

  // Test 3: Full sync query
  console.log('Test 3: Testing full sync query (standard fields only)...');
  try {
    const fullQuery = 'SELECT Id,Name,AnnualRevenue,Industry,Type,Owner.Name,CreatedDate,(SELECT Id FROM Assets) FROM Account WHERE ParentId=null ORDER BY AnnualRevenue DESC NULLS LAST LIMIT 5';

    const fullResponse = await fetch(
      `${integration.instance_url}/services/data/v59.0/query?q=${encodeURIComponent(fullQuery)}`,
      {
        headers: {
          'Authorization': `Bearer ${tokens.access_token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!fullResponse.ok) {
      const errorText = await fullResponse.text();
      let errorJson;
      try {
        errorJson = JSON.parse(errorText);
      } catch {
        errorJson = { message: errorText };
      }

      console.error(`❌ Full query failed (${fullResponse.status})`);
      console.error('   Error:', JSON.stringify(errorJson, null, 2));

      if (Array.isArray(errorJson) && errorJson[0]?.errorCode === 'INVALID_FIELD') {
        console.log('\n💡 Missing field in your Salesforce org:');
        console.log(`   Field: ${errorJson[0].fields?.[0] || 'Unknown'}`);
        console.log('   This custom field is required but not in your org');
        console.log('\n   Options:');
        console.log('   1. Add the custom field to your Salesforce org');
        console.log('   2. Remove this field from the sync query\n');
      }

      process.exit(1);
    }

    const fullData = await fullResponse.json();
    console.log(`✅ Full query successful`);
    console.log(`   Found ${fullData.totalSize} accounts with MRR > 0`);

    if (fullData.records && fullData.records.length > 0) {
      console.log('\n📊 Sample accounts:');
      fullData.records.slice(0, 3).forEach((acc: any, i: number) => {
        console.log(`   ${i + 1}. ${acc.Name}`);
        console.log(`      Annual Revenue: $${acc.AnnualRevenue?.toLocaleString() || 0}`);
        console.log(`      Type: ${acc.Type || 'N/A'}`);
      });
    }

    console.log('\n✅ All tests passed! Salesforce sync should work.\n');
  } catch (error) {
    console.error('❌ Query failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main().catch(console.error);
