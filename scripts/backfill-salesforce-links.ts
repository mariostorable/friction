import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

async function backfillSalesforceLinks() {
  try {
    console.log('\n=== BACKFILLING SALESFORCE CASE LINKS ===\n');

    // Get user ID - either from argument, env, or fetch from database
    let userId = process.argv[2] || process.env.USER_ID;

    if (!userId) {
      console.log('No user ID provided, fetching from database...');
      const { data: card } = await supabaseAdmin
        .from('friction_cards')
        .select('user_id')
        .limit(1)
        .single();

      userId = card?.user_id;

      if (!userId) {
        console.error('Error: Could not determine user ID');
        process.exit(1);
      }
    }

    console.log(`Processing for user: ${userId}`);

    // Step 1: Delete existing salesforce_case links to regenerate them
    const { error: deleteError } = await supabaseAdmin
      .from('account_jira_links')
      .delete()
      .eq('user_id', userId)
      .eq('match_type', 'salesforce_case');

    if (deleteError) {
      console.error('Error deleting old links:', deleteError);
      process.exit(1);
    }

    console.log('✓ Deleted existing salesforce_case links');

    // Step 2: Get ALL Salesforce cases (paginate to get all records)
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

    console.log(`✓ Loaded ${caseIdToAccountId.size} unique Salesforce case IDs from ${allSalesforceCases.length} cards`);

    // Debug: Check if specific MREQ case IDs are in the map
    const mreqCases = ['03690227', '03732752'];
    console.log('\nDebug: Checking for MREQ case IDs:');
    mreqCases.forEach(caseId => {
      const accountId = caseIdToAccountId.get(caseId);
      console.log(`  ${caseId}: ${accountId ? `✓ Found (account: ${accountId.substring(0, 8)}...)` : '✗ NOT in map'}`);
    });

    // Step 3: Get ALL Jira issues (paginate to get all records)
    let allJiraIssues: any[] = [];
    let offset = 0;
    const batchSize = 1000;

    while (true) {
      const { data: batch, error: jiraError } = await supabaseAdmin
        .from('jira_issues')
        .select('id, jira_key, metadata')
        .eq('user_id', userId)
        .range(offset, offset + batchSize - 1);

      if (jiraError) {
        console.error('Error fetching Jira issues:', jiraError);
        process.exit(1);
      }

      if (!batch || batch.length === 0) break;

      allJiraIssues = allJiraIssues.concat(batch);
      console.log(`  Fetched batch: ${batch.length} issues (total: ${allJiraIssues.length})`);

      if (batch.length < batchSize) break;
      offset += batchSize;
    }

    console.log(`✓ Processing ${allJiraIssues.length} total Jira issues`);

    // Step 4: Process each Jira issue to find Salesforce case matches
    const accountLinksToCreate: any[] = [];
    let matchedTickets = 0;
    const matchedTicketsList: string[] = [];

    for (const issue of allJiraIssues || []) {
      const customFields = issue.metadata?.custom_fields || {};
      const salesforceCaseIds: string[] = [];

      // Extract 8-digit case numbers from ALL custom fields
      for (const [key, value] of Object.entries(customFields)) {
        if (!value) continue;

        const fieldValue = value.toString();
        const caseMatches = fieldValue.match(/\b\d{8}\b/g);
        if (caseMatches) {
          salesforceCaseIds.push(...caseMatches);
        }
      }

      // Deduplicate
      const uniqueCaseIds = Array.from(new Set(salesforceCaseIds));

      // Check if any case IDs match our database
      const matchedAccountIds = new Set<string>();
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
        }
      }

      if (matchedAccountIds.size > 0) {
        matchedTickets++;
        matchedTicketsList.push(issue.jira_key);
        console.log(`  ${issue.jira_key}: Matched ${matchedAccountIds.size} accounts via cases [${uniqueCaseIds.join(', ')}]`);
      }
    }

    console.log(`\n✓ Found ${matchedTickets} tickets with Salesforce case matches`);
    console.log(`✓ Creating ${accountLinksToCreate.length} account links`);

    // Step 5: Delete existing links for matched tickets (to avoid duplicates), then insert new links
    if (accountLinksToCreate.length > 0) {
      const matchedJiraIds = Array.from(new Set(accountLinksToCreate.map(l => l.jira_issue_id)));

      console.log(`\n✓ Deleting existing links for ${matchedJiraIds.length} matched tickets`);
      const { error: deleteOldError } = await supabaseAdmin
        .from('account_jira_links')
        .delete()
        .eq('user_id', userId)
        .in('jira_issue_id', matchedJiraIds);

      if (deleteOldError) {
        console.error('Error deleting old links:', deleteOldError);
        process.exit(1);
      }

      console.log(`✓ Inserting ${accountLinksToCreate.length} new salesforce_case links`);
      const { error: insertError } = await supabaseAdmin
        .from('account_jira_links')
        .insert(accountLinksToCreate);

      if (insertError) {
        console.error('Error inserting links:', insertError);
        process.exit(1);
      }

      console.log('✓ Successfully created account links');
    }

    console.log('\n=== BACKFILL COMPLETE ===\n');
    console.log('Summary:');
    console.log(`  - Total issues processed: ${allJiraIssues?.length || 0}`);
    console.log(`  - Tickets with matches: ${matchedTickets}`);
    console.log(`  - Links created: ${accountLinksToCreate.length}`);
    console.log(`  - Unique case IDs available: ${caseIdToAccountId.size}`);

    if (matchedTicketsList.length > 0) {
      console.log('\nMatched tickets:', matchedTicketsList.slice(0, 20).join(', '));
      if (matchedTicketsList.length > 20) {
        console.log(`  ... and ${matchedTicketsList.length - 20} more`);
      }
    }

  } catch (error) {
    console.error('Backfill error:', error);
    process.exit(1);
  }
}

backfillSalesforceLinks();
