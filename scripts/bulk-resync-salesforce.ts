import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { getDecryptedToken } from '../lib/encryption.js';

dotenv.config({ path: '.env.local' });

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

async function bulkResyncSalesforce() {
  const userId = process.argv[2] || 'ab953672-7bad-4601-9289-5d766e73fec9';

  console.log('\n=== BULK RE-SYNC SALESFORCE CASES (365 DAYS) ===\n');
  console.log(`User ID: ${userId}\n`);

  // Get all portfolio accounts
  const { data: portfolios } = await supabaseAdmin
    .from('portfolios')
    .select('account_ids')
    .eq('user_id', userId)
    .in('portfolio_type', ['top_25_edge', 'top_25_marine', 'top_25_sitelink']);

  if (!portfolios || portfolios.length === 0) {
    console.error('✗ No portfolios found');
    return;
  }

  const accountIds = new Set<string>();
  portfolios.forEach(p => p.account_ids.forEach((id: string) => accountIds.add(id)));

  console.log(`Found ${accountIds.size} unique accounts across portfolios\n`);

  // Get account details
  const { data: accounts } = await supabaseAdmin
    .from('accounts')
    .select('id, name, salesforce_id')
    .in('id', Array.from(accountIds))
    .eq('user_id', userId)
    .order('name');

  if (!accounts || accounts.length === 0) {
    console.error('✗ No accounts found');
    return;
  }

  // Get Salesforce integration
  const { data: integration } = await supabaseAdmin
    .from('integrations')
    .select('*')
    .eq('user_id', userId)
    .eq('integration_type', 'salesforce')
    .eq('status', 'active')
    .single();

  if (!integration) {
    console.error('✗ No active Salesforce integration found');
    return;
  }

  const tokens = await getDecryptedToken(supabaseAdmin, integration.id);

  if (!tokens) {
    console.error('✗ No Salesforce tokens found');
    return;
  }

  console.log(`Using Salesforce instance: ${integration.instance_url}\n`);
  console.log('Starting re-sync for all accounts...\n');

  let successCount = 0;
  let errorCount = 0;
  const errors: string[] = [];

  for (let i = 0; i < accounts.length; i++) {
    const account = accounts[i];
    const progress = `[${i + 1}/${accounts.length}]`;

    console.log(`${progress} ${account.name}...`);

    if (!account.salesforce_id) {
      console.log(`  ⚠️  Skipped - no Salesforce ID\n`);
      continue;
    }

    try {
      // Delete old raw_inputs for this account to trigger "first sync"
      const { error: deleteError } = await supabaseAdmin
        .from('raw_inputs')
        .delete()
        .eq('account_id', account.id)
        .eq('user_id', userId)
        .eq('source_type', 'salesforce');

      if (deleteError) {
        console.error(`  ✗ Failed to delete old data:`, deleteError.message);
        errorCount++;
        errors.push(`${account.name}: Delete failed - ${deleteError.message}`);
        continue;
      }

      // Fetch 365 days of cases from Salesforce
      const query = `SELECT Id,CaseNumber,Subject,Description,Status,Priority,CreatedDate,ClosedDate,Origin FROM Case WHERE AccountId='${account.salesforce_id}' AND CreatedDate=LAST_N_DAYS:365 ORDER BY CreatedDate DESC LIMIT 2000`;
      const queryUrl = `${integration.instance_url}/services/data/v59.0/query?q=${encodeURIComponent(query)}`;

      const response = await fetch(queryUrl, {
        headers: {
          'Authorization': `Bearer ${tokens.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`  ✗ Salesforce API error:`, response.status, errorText.slice(0, 100));
        errorCount++;
        errors.push(`${account.name}: SF API ${response.status}`);
        continue;
      }

      const casesData = await response.json();
      const caseCount = casesData.records?.length || 0;

      if (caseCount === 0) {
        console.log(`  ✓ No cases found (account may have no cases in last 365 days)\n`);
        successCount++;
        continue;
      }

      // Create raw_inputs
      const rawInputs = casesData.records.map((sfCase: any) => {
        const origin = sfCase.Origin || sfCase.origin || sfCase.CaseOrigin || 'Unknown';

        return {
          user_id: userId,
          account_id: account.id,
          source_type: 'salesforce',
          source_id: sfCase.CaseNumber,
          source_url: `${integration.instance_url}/${sfCase.Id}`,
          text_content: `Case #${sfCase.CaseNumber}: ${sfCase.Subject}\n\n${sfCase.Description || 'No description'}\n\nStatus: ${sfCase.Status}\nPriority: ${sfCase.Priority}\nOrigin: ${origin}`,
          metadata: {
            salesforce_id: sfCase.Id,
            case_number: sfCase.CaseNumber,
            subject: sfCase.Subject,
            status: sfCase.Status,
            priority: sfCase.Priority,
            origin: origin,
            created_date: sfCase.CreatedDate,
            closed_date: sfCase.ClosedDate,
          },
          processed: false,
        };
      });

      const { error: insertError } = await supabaseAdmin
        .from('raw_inputs')
        .insert(rawInputs);

      if (insertError) {
        console.error(`  ✗ Failed to insert cases:`, insertError.message);
        errorCount++;
        errors.push(`${account.name}: Insert failed - ${insertError.message}`);
        continue;
      }

      console.log(`  ✓ Synced ${caseCount} cases (365 days)\n`);
      successCount++;

      // Rate limit: 100ms delay between accounts
      await new Promise(resolve => setTimeout(resolve, 100));

    } catch (error) {
      console.error(`  ✗ Error:`, error instanceof Error ? error.message : error);
      errorCount++;
      errors.push(`${account.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  console.log('\n=== BULK RE-SYNC COMPLETE ===');
  console.log(`  Total accounts: ${accounts.length}`);
  console.log(`  Successful: ${successCount}`);
  console.log(`  Errors: ${errorCount}`);

  if (errors.length > 0) {
    console.log(`\n❌ Errors encountered:`);
    errors.slice(0, 10).forEach(err => console.log(`  - ${err}`));
    if (errors.length > 10) {
      console.log(`  ... and ${errors.length - 10} more`);
    }
  }

  console.log(`\nNext steps:`);
  console.log(`  1. Run: npx tsx scripts/bulk-analyze-friction.ts ${userId}`);
  console.log(`  2. Run: npx tsx scripts/backfill-salesforce-links.ts ${userId}\n`);
}

bulkResyncSalesforce();
