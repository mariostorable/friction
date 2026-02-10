// Script to inspect Salesforce address fields for Elite-Stor and 10 Federal Storage
// Run with: node scripts/inspect-salesforce-addresses.js

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function inspectAddresses() {
  try {
    // Get first user (you)
    const { data: user } = await supabase.auth.admin.listUsers();
    const userId = user.users[0].id;

    console.log('🔍 Fetching Salesforce integration...');

    // Get Salesforce tokens
    const { data: integration, error: integrationError } = await supabase
      .from('integrations')
      .select('*')
      .eq('user_id', userId)
      .eq('provider', 'salesforce')
      .single();

    if (integrationError || !integration) {
      console.error('❌ Salesforce not connected');
      return;
    }

    const tokens = integration.credentials;
    const accessToken = tokens.access_token;

    console.log('✅ Got Salesforce credentials\n');

    // Function to fetch account by name and get ALL fields
    const fetchAccountDetails = async (accountName) => {
      console.log(`\n📦 Fetching ${accountName}...`);

      // First find the account ID
      const searchQuery = `SELECT Id FROM Account WHERE Name LIKE '%${accountName}%' LIMIT 1`;
      const searchResponse = await fetch(
        `${integration.instance_url}/services/data/v59.0/query?q=${encodeURIComponent(searchQuery)}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const searchData = await searchResponse.json();

      if (!searchData.records || searchData.records.length === 0) {
        console.error(`❌ Account not found: ${accountName}`);
        return null;
      }

      const accountId = searchData.records[0].Id;
      console.log(`   Found ID: ${accountId}`);

      // Fetch ALL fields for this account
      const detailResponse = await fetch(
        `${integration.instance_url}/services/data/v59.0/sobjects/Account/${accountId}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const accountData = await detailResponse.json();
      return accountData;
    };

    // Fetch both accounts
    const eliteStor = await fetchAccountDetails('Elite-Stor');
    const federalStorage = await fetchAccountDetails('10 Federal Storage');

    // Search for address-related fields
    const findAddressFields = (data, accountName, searchStrings) => {
      console.log(`\n\n🔎 SEARCHING ${accountName} for address fields:`);
      console.log('=' .repeat(80));

      const foundFields = {};

      for (const [key, value] of Object.entries(data)) {
        if (value && typeof value === 'string') {
          // Check if this field contains any of the search strings
          const valueLower = value.toLowerCase();
          const matchesSearch = searchStrings.some(search => valueLower.includes(search.toLowerCase()));

          // Also show all fields with "street", "city", "address" in the name
          const isAddressField = key.toLowerCase().includes('street') ||
                                 key.toLowerCase().includes('city') ||
                                 key.toLowerCase().includes('address') ||
                                 key.toLowerCase().includes('shipping') ||
                                 key.toLowerCase().includes('billing') ||
                                 key.toLowerCase().includes('parent');

          if (matchesSearch || isAddressField) {
            foundFields[key] = value;
            console.log(`   ${matchesSearch ? '✅' : '📍'} ${key}: ${value}`);
          }
        }
      }

      return foundFields;
    };

    if (eliteStor) {
      findAddressFields(eliteStor, 'Elite-Stor', ['2751', 'dixie', 'west palm beach']);
    }

    if (federalStorage) {
      findAddressFields(federalStorage, '10 Federal Storage', ['3301', 'atlantic', 'raleigh']);
    }

    console.log('\n\n✅ Inspection complete!');

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

inspectAddresses();
