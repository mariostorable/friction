/**
 * Discover what fields exist in Salesforce Account object
 */
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function discoverFields() {
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

  console.log('Querying Salesforce to discover Account fields...\n');

  // Use Salesforce Describe API to get all Account fields
  const describeUrl = `${integration.instance_url}/services/data/v59.0/sobjects/Account/describe`;

  try {
    const response = await fetch(describeUrl, {
      headers: {
        'Authorization': `Bearer ${tokens.access_token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.error('Error:', response.status, response.statusText);
      process.exit(1);
    }

    const data = await response.json();

    console.log(`Found ${data.fields.length} total fields in Account object\n`);

    // Filter for address-related fields
    const addressFields = data.fields.filter((f: any) =>
      f.name.toLowerCase().includes('address') ||
      f.name.toLowerCase().includes('street') ||
      f.name.toLowerCase().includes('city') ||
      f.name.toLowerCase().includes('state') ||
      f.name.toLowerCase().includes('zip') ||
      f.name.toLowerCase().includes('postal') ||
      f.name.toLowerCase().includes('property') ||
      f.name.toLowerCase().includes('shipping') ||
      f.name.toLowerCase().includes('billing')
    );

    console.log('Address-related fields:\n');
    addressFields.forEach((f: any) => {
      console.log(`  ${f.name} (${f.type})`);
      if (f.label !== f.name) {
        console.log(`    Label: ${f.label}`);
      }
    });

    // Check for SmartyStreets fields
    console.log('\n\nSmartyStreets fields:\n');
    const smartyFields = data.fields.filter((f: any) =>
      f.name.toLowerCase().includes('smarty')
    );
    smartyFields.forEach((f: any) => {
      console.log(`  ${f.name} (${f.type}) - ${f.label}`);
    });

    // Check specifically for the Property_ fields
    console.log('\n\nProperty custom fields:\n');
    const propertyFields = data.fields.filter((f: any) =>
      f.name.startsWith('Property_')
    );
    if (propertyFields.length === 0) {
      console.log('  ❌ No Property_ custom fields found');
    } else {
      propertyFields.forEach((f: any) => {
        console.log(`  ✓ ${f.name} (${f.type}) - ${f.label}`);
      });
    }

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

discoverFields().catch(console.error);
