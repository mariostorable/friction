/**
 * Check Commonwealth Storage MRR/ARR in Salesforce
 * Run with: npx tsx scripts/check-commonwealth-mrr.ts
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
    console.log('Checking Commonwealth Storage in database...\n');

    // Find Commonwealth Storage in database
    const { data: dbAccount, error: dbError } = await supabase
      .from('accounts')
      .select('*')
      .ilike('name', '%commonwealth%')
      .single();

    if (dbError || !dbAccount) {
      console.log('Commonwealth Storage not found in database');
      return;
    }

    console.log('Database Record:');
    console.log(`  Name: ${dbAccount.name}`);
    console.log(`  Salesforce ID: ${dbAccount.salesforce_id}`);
    console.log(`  ARR: $${dbAccount.arr?.toLocaleString() || '0'}`);
    console.log(`  Status: ${dbAccount.status}`);
    console.log(`  Last Synced: ${dbAccount.last_synced_at}`);

    // Now check Salesforce directly
    console.log('\nFetching from Salesforce API...\n');

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

    // Query Salesforce for this account
    const query = `SELECT Id, Name, MRR_MVR__c FROM Account WHERE Id = '${dbAccount.salesforce_id}'`;
    const queryUrl = `${instanceUrl}/services/data/v59.0/query?q=${encodeURIComponent(query)}`;

    const sfResponse = await fetch(queryUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!sfResponse.ok) {
      console.log('Salesforce API error:', await sfResponse.text());
      return;
    }

    const sfData = await sfResponse.json();

    if (sfData.records && sfData.records.length > 0) {
      const sfAccount = sfData.records[0];
      console.log('Salesforce Record:');
      console.log(`  Name: ${sfAccount.Name}`);
      console.log(`  MRR_MVR__c: $${sfAccount.MRR_MVR__c || '0'}`);
      console.log(`  Calculated ARR: $${sfAccount.MRR_MVR__c ? (sfAccount.MRR_MVR__c * 12).toLocaleString() : '0'}`);

      if (sfAccount.MRR_MVR__c) {
        console.log('\n✓ Salesforce has MRR data!');
        console.log(`  → Database needs update: ${dbAccount.arr || 0} → ${sfAccount.MRR_MVR__c * 12}`);
        console.log(`  → Run: Sync Salesforce from Settings page`);
      } else {
        console.log('\n⚠️  MRR_MVR__c field is NULL in Salesforce');
        console.log('  → Check if MRR data exists under a different field name');
        console.log('  → UI might be showing "MRR (Core Products)" but API field could be different');
      }
    } else {
      console.log('Account not found in Salesforce');
    }

    // Also check if there are other MRR-related fields
    console.log('\nChecking for other MRR fields in Salesforce...');
    const fieldQuery = `SELECT FIELDS(ALL) FROM Account WHERE Id = '${dbAccount.salesforce_id}' LIMIT 1`;
    const fieldQueryUrl = `${instanceUrl}/services/data/v59.0/query?q=${encodeURIComponent(fieldQuery)}`;

    const fieldResponse = await fetch(fieldQueryUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (fieldResponse.ok) {
      const fieldData = await fieldResponse.json();
      if (fieldData.records && fieldData.records.length > 0) {
        const allFields = fieldData.records[0];
        const mrrFields = Object.keys(allFields).filter(k =>
          k.toLowerCase().includes('mrr') ||
          k.toLowerCase().includes('recurring') ||
          k.toLowerCase().includes('revenue')
        );

        if (mrrFields.length > 0) {
          console.log('\nFound MRR/Revenue related fields:');
          mrrFields.forEach(field => {
            console.log(`  ${field}: ${allFields[field]}`);
          });
        }
      }
    }

  } catch (err) {
    console.error('Error:', err);
  }
}

checkCommonwealth();
