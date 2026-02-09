import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

async function checkUnmatchedCaseIds() {
  const userId = 'ab953672-7bad-4601-9289-5d766e73fec9';

  console.log('\n=== Checking why 34 tickets with customfield_17254 didn\'t match ===\n');

  // Get all tickets with customfield_17254
  const { data: ticketsWithField } = await supabaseAdmin
    .from('jira_issues')
    .select('jira_key, metadata')
    .eq('user_id', userId)
    .not('metadata->custom_fields->customfield_17254', 'is', null);

  console.log(`Found ${ticketsWithField?.length || 0} tickets with customfield_17254`);

  // Get matched tickets
  const { data: matchedTickets } = await supabaseAdmin
    .from('account_jira_links')
    .select('jira_issues!inner(jira_key)')
    .eq('user_id', userId)
    .eq('match_type', 'salesforce_case');

  const matchedKeys = new Set(matchedTickets?.map((t: any) => t.jira_issues.jira_key));
  console.log(`${matchedKeys.size} matched tickets: ${Array.from(matchedKeys).join(', ')}\n`);

  // Get all case IDs from friction_cards
  const { data: allCases } = await supabaseAdmin
    .from('friction_cards')
    .select('raw_inputs!inner(source_id)')
    .eq('user_id', userId)
    .eq('raw_inputs.source_type', 'salesforce')
    .not('raw_inputs.source_id', 'is', null);

  const knownCaseIds = new Set(allCases?.map((c: any) => c.raw_inputs.source_id));
  console.log(`Known case IDs in database: ${knownCaseIds.size}\n`);

  // Analyze unmatched tickets
  const unmatched: any[] = [];
  for (const ticket of ticketsWithField || []) {
    if (matchedKeys.has(ticket.jira_key)) continue;

    const customFields = ticket.metadata?.custom_fields || {};
    const fieldValue = customFields['customfield_17254'];

    if (!fieldValue) continue;

    const caseMatches = fieldValue.toString().match(/\b\d{8}\b/g);
    const uniqueCases = Array.from(new Set(caseMatches || []));

    const caseInDb = uniqueCases.filter(c => knownCaseIds.has(c));
    const caseNotInDb = uniqueCases.filter(c => !knownCaseIds.has(c));

    unmatched.push({
      jira_key: ticket.jira_key,
      extracted_cases: uniqueCases,
      cases_in_db: caseInDb,
      cases_not_in_db: caseNotInDb,
      reason: caseInDb.length > 0 ? 'Has case in DB but still unmatched?' : 'No cases in DB'
    });
  }

  console.log(`Unmatched tickets: ${unmatched.length}\n`);

  // Group by reason
  const noCasesInDb = unmatched.filter(t => t.cases_in_db.length === 0);
  const hasCasesButUnmatched = unmatched.filter(t => t.cases_in_db.length > 0);

  console.log(`${noCasesInDb.length} tickets: Case IDs not in database`);
  console.log(`${hasCasesButUnmatched.length} tickets: Have cases in DB but still unmatched (BUG?)\n`);

  if (hasCasesButUnmatched.length > 0) {
    console.log('⚠️  Potential bugs - these should have matched:');
    hasCasesButUnmatched.forEach(t => {
      console.log(`  ${t.jira_key}: Cases in DB: ${t.cases_in_db.join(', ')}`);
    });
  }

  // Sample tickets with cases not in DB
  console.log('\nSample tickets with cases NOT in database:');
  noCasesInDb.slice(0, 5).forEach(t => {
    console.log(`  ${t.jira_key}: ${t.cases_not_in_db.join(', ')}`);
  });

  // Check if any storage-related case IDs exist in DB
  console.log('\nChecking business units of case IDs in database:');
  const { data: casesWithBusinessUnit } = await supabaseAdmin
    .from('friction_cards')
    .select(`
      raw_inputs!inner(source_id),
      accounts!inner(name, business_unit)
    `)
    .eq('user_id', userId)
    .eq('raw_inputs.source_type', 'salesforce')
    .not('raw_inputs.source_id', 'is', null)
    .limit(100);

  const businessUnitCounts: Record<string, number> = {};
  casesWithBusinessUnit?.forEach((c: any) => {
    const bu = c.accounts?.business_unit || 'unknown';
    businessUnitCounts[bu] = (businessUnitCounts[bu] || 0) + 1;
  });

  console.log('  Business unit distribution:');
  Object.entries(businessUnitCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([bu, count]) => {
      console.log(`    ${bu}: ${count} cases`);
    });
}

checkUnmatchedCaseIds();
