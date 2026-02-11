/**
 * Test Salesforce query to see what error we're getting
 */
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function testSalesforceQuery() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // Get user
  const { data: profiles } = await supabase.from('profiles').select('id').limit(1).single();

  // Get integration
  const { data: integration } = await supabase
    .from('integrations')
    .select('*')
    .eq('user_id', profiles!.id)
    .eq('integration_type', 'salesforce')
    .eq('status', 'active')
    .order('connected_at', { ascending: false })
    .limit(1)
    .single();

  if (!integration) {
    console.error('No Salesforce integration found');
    process.exit(1);
  }

  console.log('Integration found:', integration.id);
  console.log('Instance URL:', integration.instance_url);

  // Get tokens
  const { data: tokens } = await supabase
    .from('oauth_tokens')
    .select('access_token')
    .eq('integration_id', integration.id)
    .single();

  if (!tokens) {
    console.error('No tokens found');
    process.exit(1);
  }

  console.log('Tokens found\n');

  // Test the query
  const query = `${integration.instance_url}/services/data/v59.0/query?q=SELECT+Id,Name,MRR_MVR__c,Industry,Type,Owner.Name,CreatedDate,Current_FMS__c,Online_Listing_Service__c,Current_Website_Provider__c,Current_Payment_Provider__c,Insurance_Company__c,Gate_System__c,LevelOfService__c,Managed_Account__c,VitallyClient_Success_Tier__c,Locations__c,Corp_Code__c,SE_Company_UUID__c,SpareFoot_Client_Key__c,Insurance_ZCRM_ID__c,ShippingStreet,ShippingCity,ShippingState,ShippingPostalCode,ShippingCountry,BillingStreet,BillingCity,BillingState,BillingPostalCode,BillingCountry,Property_Street__c,Property_City__c,Property_State__c,Property_Zip__c,smartystreets__Shipping_Latitude__c,smartystreets__Shipping_Longitude__c,smartystreets__Billing_Latitude__c,smartystreets__Billing_Longitude__c,smartystreets__Shipping_Address_Status__c,(SELECT+Id+FROM+Assets)+FROM+Account+WHERE+MRR_MVR__c>0+ORDER+BY+MRR_MVR__c+DESC+LIMIT+5`;

  console.log('Testing query (limited to 5 records)...\n');

  try {
    const response = await fetch(query, {
      headers: {
        'Authorization': `Bearer ${tokens.access_token}`,
        'Content-Type': 'application/json',
      },
    });

    console.log('Response status:', response.status);

    const data = await response.json();

    if (!response.ok) {
      console.error('\n❌ Salesforce API Error:');
      console.error(JSON.stringify(data, null, 2));
      process.exit(1);
    }

    console.log('\n✓ Query successful!');
    console.log(`Returned ${data.records?.length || 0} records`);

    if (data.records && data.records.length > 0) {
      console.log('\nFirst record fields:');
      console.log(Object.keys(data.records[0]).sort().join(', '));

      console.log('\nFirst record address fields:');
      const firstRecord = data.records[0];
      console.log('  Property_Street__c:', firstRecord.Property_Street__c);
      console.log('  Property_City__c:', firstRecord.Property_City__c);
      console.log('  Property_State__c:', firstRecord.Property_State__c);
      console.log('  Property_Zip__c:', firstRecord.Property_Zip__c);
      console.log('  ShippingStreet:', firstRecord.ShippingStreet);
      console.log('  ShippingCity:', firstRecord.ShippingCity);
      console.log('  smartystreets__Shipping_Latitude__c:', firstRecord.smartystreets__Shipping_Latitude__c);
    }
  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

testSalesforceQuery().catch(console.error);
