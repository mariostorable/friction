// Script to inspect Salesforce address fields
// Run with: node scripts/inspect-salesforce-addresses-simple.js

require('dotenv').config({ path: '.env.local' });

async function inspectAddresses() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    console.log('🔍 Fetching Salesforce integration...');

    // Get Salesforce integration directly
    const response = await fetch(`${supabaseUrl}/rest/v1/integrations?provider=eq.salesforce&select=*`, {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
      },
    });

    const integrations = await response.json();

    if (!integrations || integrations.length === 0) {
      console.error('❌ No Salesforce integration found');
      return;
    }

    const integration = integrations[0];
    const tokens = integration.credentials;
    const accessToken = tokens.access_token;

    console.log('✅ Got Salesforce credentials');
    console.log(`   Instance: ${integration.instance_url}\n`);

    // Function to fetch account by name and get ALL fields
    const fetchAccountDetails = async (accountName) => {
      console.log(`\n📦 Fetching ${accountName}...`);

      // First find the account ID
      const searchQuery = `SELECT Id,Name FROM Account WHERE Name LIKE '%${accountName}%' LIMIT 1`;
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
      const accountFullName = searchData.records[0].Name;
      console.log(`   Found: ${accountFullName}`);
      console.log(`   ID: ${accountId}`);

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
      console.log(`\n\n🔎 ADDRESS FIELDS FOR ${accountName}:`);
      console.log('=' .repeat(80));

      const foundFields = {};

      for (const [key, value] of Object.entries(data)) {
        if (value && typeof value === 'string') {
          // Check if this field contains any of the search strings
          const valueLower = value.toLowerCase();
          const matchesSearch = searchStrings.some(search => valueLower.includes(search.toLowerCase()));

          // Also show all fields with address-related names
          const isAddressField = key.toLowerCase().includes('street') ||
                                 key.toLowerCase().includes('city') ||
                                 key.toLowerCase().includes('state') ||
                                 key.toLowerCase().includes('postal') ||
                                 key.toLowerCase().includes('zip') ||
                                 key.toLowerCase().includes('country') ||
                                 key.toLowerCase().includes('address') ||
                                 key.toLowerCase().includes('shipping') ||
                                 key.toLowerCase().includes('billing') ||
                                 key.toLowerCase().includes('parent');

          if (matchesSearch) {
            foundFields[key] = value;
            console.log(`   ✅ MATCH: ${key} = "${value}"`);
          } else if (isAddressField && value.trim() !== '') {
            foundFields[key] = value;
            console.log(`   📍 ${key} = "${value}"`);
          }
        }
      }

      return foundFields;
    };

    if (eliteStor) {
      const eliteFields = findAddressFields(eliteStor, 'Elite-Stor Storage - CORP', ['2751', 'dixie', 'west palm']);

      console.log('\n\n📋 SUMMARY FOR ELITE-STOR:');
      console.log('ShippingStreet:', eliteStor.ShippingStreet);
      console.log('ShippingCity:', eliteStor.ShippingCity);
      console.log('ShippingState:', eliteStor.ShippingState);
      console.log('ShippingPostalCode:', eliteStor.ShippingPostalCode);
      console.log('BillingStreet:', eliteStor.BillingStreet);
      console.log('BillingCity:', eliteStor.BillingCity);
      console.log('BillingState:', eliteStor.BillingState);
    }

    if (federalStorage) {
      const fedFields = findAddressFields(federalStorage, '10 Federal Storage - CORP', ['3301', 'atlantic', 'raleigh']);

      console.log('\n\n📋 SUMMARY FOR 10 FEDERAL STORAGE:');
      console.log('ShippingStreet:', federalStorage.ShippingStreet);
      console.log('ShippingCity:', federalStorage.ShippingCity);
      console.log('ShippingState:', federalStorage.ShippingState);
      console.log('ShippingPostalCode:', federalStorage.ShippingPostalCode);
      console.log('BillingStreet:', federalStorage.BillingStreet);
      console.log('BillingCity:', federalStorage.BillingCity);
      console.log('BillingState:', federalStorage.BillingState);
    }

    console.log('\n\n✅ Inspection complete!');
    console.log('\nNow we know which field names to use in the sync query.');

  } catch (error) {
    console.error('❌ Error:', error);
    console.error(error.stack);
  }
}

inspectAddresses();
