/**
 * Check Commonwealth Storage directly in Salesforce
 * Run with: npx tsx scripts/check-commonwealth-salesforce.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkCommonwealth() {
  try {
    // Get Salesforce token
    const { data: integration } = await supabase
      .from('integrations')
      .select('*')
      .eq('integration_type', 'salesforce')
      .eq('status', 'active')
      .single();

    if (!integration) {
      console.log('No active Salesforce integration found');
      return;
    }

    const accessToken = integration.metadata?.access_token;
    const instanceUrl = integration.instance_url;

    if (!accessToken || !instanceUrl) {
      console.log('Missing Salesforce credentials');
      return;
    }

    console.log('Checking Commonwealth Storage in Salesforce...\n');

    // Search for Commonwealth Storage
    const searchQuery = `SELECT Id, Name, MRR_MVR__c, ShippingCity, ShippingState, BillingCity, BillingState FROM Account WHERE Name LIKE '%Commonwealth%' LIMIT 5`;
    const queryUrl = `${instanceUrl}/services/data/v59.0/query?q=${encodeURIComponent(searchQuery)}`;

    const response = await fetch(queryUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.log('Salesforce API error:', await response.text());
      return;
    }

    const data = await response.json();

    if (data.records && data.records.length > 0) {
      console.log(`Found ${data.records.length} Commonwealth accounts:\n`);

      data.records.forEach((account: any, idx: number) => {
        console.log(`${idx + 1}. ${account.Name}`);
        console.log(`   ID: ${account.Id}`);
        console.log(`   MRR_MVR__c: ${account.MRR_MVR__c || 'NULL'}`);
        console.log(`   Calculated ARR: $${account.MRR_MVR__c ? (account.MRR_MVR__c * 12).toLocaleString() : '0'}`);
        console.log(`   ShippingCity: ${account.ShippingCity || 'NULL'}`);
        console.log(`   ShippingState: ${account.ShippingState || 'NULL'}`);
        console.log(`   BillingCity: ${account.BillingCity || 'NULL'}`);
        console.log(`   BillingState: ${account.BillingState || 'NULL'}`);

        const hasCity = account.ShippingCity || account.BillingCity;
        if (hasCity) {
          console.log(`   ✓ Has city - SHOULD be included in sync`);
        } else {
          console.log(`   ✗ No city - will NOT be included in sync`);
        }
        console.log('');
      });
    } else {
      console.log('No Commonwealth accounts found in Salesforce');
    }

  } catch (err) {
    console.error('Error:', err);
  }
}

checkCommonwealth();
