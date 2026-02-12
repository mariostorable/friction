/**
 * Discover all MRR-related fields in Salesforce Account object
 * Run with: npx tsx scripts/discover-mrr-fields.ts
 */
import { createClient } from '@supabase/supabase-js';
import { getDecryptedToken } from '../lib/encryption';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function discoverMRRFields() {
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

  console.log('Discovering MRR fields in Salesforce Account object...\n');

  // Use Salesforce Describe API
  const describeUrl = `${integration.instance_url}/services/data/v59.0/sobjects/Account/describe`;

  const response = await fetch(describeUrl, {
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

  // Filter for MRR/revenue fields
  const mrrFields = data.fields.filter((f: any) =>
    f.name.toLowerCase().includes('mrr') ||
    f.name.toLowerCase().includes('revenue') ||
    f.name.toLowerCase().includes('recurring') ||
    f.label.toLowerCase().includes('mrr') ||
    f.label.toLowerCase().includes('revenue')
  );

  console.log(`Found ${mrrFields.length} MRR/Revenue related fields:\n`);

  mrrFields.forEach((f: any) => {
    console.log(`Field Name: ${f.name}`);
    console.log(`  Label: ${f.label}`);
    console.log(`  Type: ${f.type}`);
    console.log(`  Custom: ${f.custom}`);
    console.log('');
  });

  // Now query Commonwealth to see actual values
  console.log('\n' + '='.repeat(80));
  console.log('Commonwealth Storage - Field Values:');
  console.log('='.repeat(80) + '\n');

  const fieldNames = mrrFields.map((f: any) => f.name).join(',');
  const query = `SELECT Id, Name, ${fieldNames} FROM Account WHERE Name LIKE '%Commonwealth%' LIMIT 1`;
  const queryUrl = `${integration.instance_url}/services/data/v59.0/query?q=${encodeURIComponent(query)}`;

  const queryResponse = await fetch(queryUrl, {
    headers: {
      'Authorization': `Bearer ${tokens.access_token}`,
      'Content-Type': 'application/json',
    },
  });

  if (queryResponse.ok) {
    const queryData = await queryResponse.json();
    if (queryData.records && queryData.records.length > 0) {
      const account = queryData.records[0];
      console.log(`Account: ${account.Name}\n`);

      mrrFields.forEach((f: any) => {
        const value = account[f.name];
        if (value !== null && value !== undefined) {
          console.log(`${f.name} (${f.label}): ${value}`);
        }
      });
    } else {
      console.log('Commonwealth not found');
    }
  } else {
    console.log('Query failed:', await queryResponse.text());
  }
}

discoverMRRFields().catch(console.error);
