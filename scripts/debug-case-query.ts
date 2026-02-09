import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

async function debugCaseQuery() {
  const userId = 'ab953672-7bad-4601-9289-5d766e73fec9';

  console.log('\n=== DEBUG: Why case IDs aren\'t in the map ===\n');

  // Run the same query as the backfill script
  const { data: allSalesforceCases, error } = await supabaseAdmin
    .from('friction_cards')
    .select(`
      id,
      account_id,
      raw_input:raw_inputs!inner(source_id, source_type)
    `)
    .eq('user_id', userId)
    .eq('raw_inputs.source_type', 'salesforce')
    .not('raw_inputs.source_id', 'is', null);

  if (error) {
    console.error('Query error:', error);
    return;
  }

  console.log(`Total records returned: ${allSalesforceCases?.length || 0}`);

  // Build the map like the script does
  const caseIdToAccountId = new Map<string, string>();
  allSalesforceCases?.forEach((card: any) => {
    const caseId = card.raw_input?.source_id;
    const accountId = card.account_id;
    if (caseId && accountId) {
      caseIdToAccountId.set(caseId, accountId);
    }
  });

  console.log(`Unique case IDs in map: ${caseIdToAccountId.size}`);

  // Look for our specific case IDs
  const targetCases = ['03690227', '03732752'];
  console.log('\nSearching for target case IDs in query results:');

  for (const targetCase of targetCases) {
    const found = allSalesforceCases?.find((card: any) =>
      card.raw_input?.source_id === targetCase
    );

    if (found) {
      console.log(`  ${targetCase}: ✓ Found in query results`);
      console.log(`    Card ID: ${found.id}`);
      console.log(`    Account ID: ${found.account_id}`);
      console.log(`    Raw input: ${JSON.stringify(found.raw_input)}`);
    } else {
      console.log(`  ${targetCase}: ✗ NOT in query results`);
    }
  }

  // Now query directly for these specific case IDs
  console.log('\nDirect query for these case IDs:');
  const { data: directQuery } = await supabaseAdmin
    .from('friction_cards')
    .select(`
      id,
      account_id,
      user_id,
      raw_input_id,
      raw_inputs!inner(source_id, source_type)
    `)
    .eq('raw_inputs.source_type', 'salesforce')
    .in('raw_inputs.source_id', targetCases);

  console.log(`  Direct query returned: ${directQuery?.length || 0} records`);
  directQuery?.forEach((card: any) => {
    console.log(`    Case ${card.raw_inputs.source_id}:`);
    console.log(`      User ID: ${card.user_id}`);
    console.log(`      User ID matches: ${card.user_id === userId ? 'YES' : 'NO'}`);
    console.log(`      Account ID: ${card.account_id}`);
  });
}

debugCaseQuery();
