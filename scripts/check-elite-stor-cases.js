require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkEliteStor() {
  // Find the account
  const { data: accounts, error: accountError } = await supabase
    .from('accounts')
    .select('id, name, salesforce_id, user_id')
    .ilike('name', '%Elite-Stor%CORP%');

  if (accountError || !accounts || accounts.length === 0) {
    console.log('Account not found:', accountError);
    return;
  }

  if (accounts.length > 1) {
    console.log('Multiple accounts found:');
    accounts.forEach((acc, idx) => {
      console.log(`${idx + 1}. ${acc.name}`);
    });
    console.log('\nUsing first match...\n');
  }

  const account = accounts[0];

  console.log('Account found:', account.name);
  console.log('Salesforce ID:', account.salesforce_id);
  console.log('Internal ID:', account.id);
  console.log('User ID:', account.user_id);

  // Check raw_inputs count
  const { data: rawInputs, error: rawError } = await supabase
    .from('raw_inputs')
    .select('id, created_at')
    .eq('account_id', account.id)
    .order('created_at', { ascending: false });

  console.log('\nRaw inputs in DB:', rawInputs?.length || 0);

  // Check friction cards count
  const { data: frictionCards, error: cardError } = await supabase
    .from('friction_cards')
    .select('id')
    .eq('account_id', account.id);

  console.log('Friction cards in DB:', frictionCards?.length || 0);

  // Get integration for this account's user
  const { data: integration } = await supabase
    .from('integrations')
    .select('*')
    .eq('user_id', account.user_id)
    .eq('integration_type', 'salesforce')
    .eq('status', 'active')
    .single();

  if (!integration) {
    console.log('\n⚠️  No active Salesforce integration found for this user');
    return;
  }

  console.log('Using integration ID:', integration.id);

  const { data: tokens } = await supabase
    .from('oauth_tokens')
    .select('*')
    .eq('integration_id', integration.id)
    .single();

  if (!tokens) {
    console.log('\nNo tokens found');
    return;
  }

  // Query Salesforce for case count
  const query = `SELECT Id FROM Case WHERE AccountId='${account.salesforce_id}' AND CreatedDate=LAST_N_DAYS:90`;

  console.log('\nQuerying Salesforce...');
  const response = await fetch(
    `${integration.instance_url}/services/data/v59.0/query?q=${encodeURIComponent(query)}`,
    {
      headers: {
        'Authorization': `Bearer ${tokens.access_token}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.log('Salesforce query failed:', response.status, errorText);
    return;
  }

  const data = await response.json();
  console.log('Cases in Salesforce (last 90 days):', data.totalSize || 0);
  console.log('Returned records:', data.records?.length || 0);

  if (data.totalSize > data.records?.length) {
    console.log('\n⚠️  WARNING: Salesforce has more cases than were returned!');
    console.log('This means the query needs LIMIT 2000 to fetch all records.');
  }
}

checkEliteStor().catch(console.error);
