import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

async function backfillAllJiraLinks() {
  try {
    console.log('\n=== BACKFILLING ALL JIRA LINKS (Case IDs + Account Names) ===\n');

    const userId = process.argv[2] || 'ab953672-7bad-4601-9289-5d766e73fec9';
    console.log(`Processing for user: ${userId}`);

    // Step 1: Delete existing salesforce_case and account_name links
    console.log('\nStep 1: Deleting existing links...');
    const { error: deleteError } = await supabaseAdmin
      .from('account_jira_links')
      .delete()
      .eq('user_id', userId)
      .in('match_type', ['salesforce_case', 'account_name']);

    if (deleteError) {
      console.error('Error deleting old links:', deleteError);
      process.exit(1);
    }

    console.log('✓ Deleted existing salesforce_case and account_name links');

    // Step 2: Get all Salesforce cases
    console.log('\nStep 2: Loading Salesforce cases...');
    let allSalesforceCases: any[] = [];
    let caseOffset = 0;
    const caseBatchSize = 1000;

    while (true) {
      const { data: caseBatch } = await supabaseAdmin
        .from('friction_cards')
        .select(`
          id,
          account_id,
          raw_input:raw_inputs!inner(source_id, source_type)
        `)
        .eq('user_id', userId)
        .eq('raw_inputs.source_type', 'salesforce')
        .not('raw_inputs.source_id', 'is', null)
        .range(caseOffset, caseOffset + caseBatchSize - 1);

      if (!caseBatch || caseBatch.length === 0) break;

      allSalesforceCases = allSalesforceCases.concat(caseBatch);
      console.log(`  Fetched batch: ${caseBatch.length} friction cards (total: ${allSalesforceCases.length})`);

      if (caseBatch.length < caseBatchSize) break;
      caseOffset += caseBatchSize;
    }

    const caseIdToAccountId = new Map<string, string>();

    allSalesforceCases.forEach((card: any) => {
      const caseId = card.raw_input?.source_id;
      const accountId = card.account_id;
      if (caseId && accountId) {
        caseIdToAccountId.set(caseId, accountId);
      }
    });

    console.log(`✓ Loaded ${caseIdToAccountId.size} unique Salesforce case IDs`);

    // Step 3: Get all accounts with their names
    console.log('\nStep 3: Loading account names...');
    const { data: accounts } = await supabaseAdmin
      .from('accounts')
      .select('id, name')
      .eq('user_id', userId);

    console.log(`✓ Loaded ${accounts?.length || 0} accounts`);

    // Step 4: Get all Jira issues
    console.log('\nStep 4: Loading Jira issues...');
    let allJiraIssues: any[] = [];
    let offset = 0;
    const batchSize = 1000;

    while (true) {
      const { data: batch } = await supabaseAdmin
        .from('jira_issues')
        .select('id, jira_key, summary, description, metadata')
        .eq('user_id', userId)
        .range(offset, offset + batchSize - 1);

      if (!batch || batch.length === 0) break;

      allJiraIssues = allJiraIssues.concat(batch);
      console.log(`  Fetched batch: ${batch.length} issues (total: ${allJiraIssues.length})`);

      if (batch.length < batchSize) break;
      offset += batchSize;
    }

    console.log(`✓ Processing ${allJiraIssues.length} total Jira issues`);

    // Step 5: Process each Jira issue
    console.log('\nStep 5: Matching Jira issues to accounts...');
    const accountLinksToCreate: any[] = [];
    let salesforceCaseMatches = 0;
    let accountNameMatches = 0;
    const matchedTickets = new Set<string>();

    for (const issue of allJiraIssues || []) {
      const matchedAccountIds = new Set<string>();

      // Match 1: Check for Salesforce case IDs in custom fields
      const customFields = issue.metadata?.custom_fields || {};
      const salesforceCaseIds: string[] = [];

      for (const [key, value] of Object.entries(customFields)) {
        if (!value) continue;
        const fieldValue = value.toString();
        const caseMatches = fieldValue.match(/\b\d{8}\b/g);
        if (caseMatches) {
          salesforceCaseIds.push(...caseMatches);
        }
      }

      const uniqueCaseIds = Array.from(new Set(salesforceCaseIds));

      for (const caseId of uniqueCaseIds) {
        const accountId = caseIdToAccountId.get(caseId);
        if (accountId && !matchedAccountIds.has(accountId)) {
          matchedAccountIds.add(accountId);
          accountLinksToCreate.push({
            user_id: userId,
            account_id: accountId,
            jira_issue_id: issue.id,
            match_type: 'salesforce_case',
            match_confidence: 1.0
          });
          salesforceCaseMatches++;
        }
      }

      // Match 2: Check for account names in summary/description
      const searchText = `${issue.summary || ''} ${issue.description || ''}`.toLowerCase();

      for (const account of accounts || []) {
        if (matchedAccountIds.has(account.id)) continue; // Skip if already matched via case ID

        // Try both full name and name parts (e.g., "Spartan Investment Group" -> "spartan", "investment", "group")
        const nameParts = account.name.toLowerCase().split(/[\s-,]+/);
        const matchesName = nameParts.some((part: string) =>
          part.length > 3 && searchText.includes(part)
        );

        if (matchesName) {
          matchedAccountIds.add(account.id);
          accountLinksToCreate.push({
            user_id: userId,
            account_id: account.id,
            jira_issue_id: issue.id,
            match_type: 'account_name',
            match_confidence: 0.9
          });
          accountNameMatches++;
        }
      }

      if (matchedAccountIds.size > 0) {
        matchedTickets.add(issue.jira_key);
      }
    }

    console.log(`\n✓ Found ${matchedTickets.size} tickets with matches`);
    console.log(`  - ${salesforceCaseMatches} salesforce_case links`);
    console.log(`  - ${accountNameMatches} account_name links`);
    console.log(`✓ Creating ${accountLinksToCreate.length} total account links`);

    // Step 6: Insert new links
    if (accountLinksToCreate.length > 0) {
      console.log(`\n✓ Inserting ${accountLinksToCreate.length} new links...`);
      const { error: insertError } = await supabaseAdmin
        .from('account_jira_links')
        .insert(accountLinksToCreate);

      if (insertError) {
        console.error('Error inserting links:', insertError);
        process.exit(1);
      }

      console.log('✓ Successfully created account links');
    }

    console.log('\n=== BACKFILL COMPLETE ===');
    console.log(`\nSummary:`);
    console.log(`  - Total Jira issues processed: ${allJiraIssues.length}`);
    console.log(`  - Tickets with matches: ${matchedTickets.size}`);
    console.log(`  - Salesforce case matches: ${salesforceCaseMatches}`);
    console.log(`  - Account name matches: ${accountNameMatches}`);
    console.log(`  - Total links created: ${accountLinksToCreate.length}\n`);

  } catch (error) {
    console.error('Backfill error:', error);
    process.exit(1);
  }
}

backfillAllJiraLinks();
