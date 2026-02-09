import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const userId = user.id;

    console.log('\n=== BACKFILLING SALESFORCE CASE LINKS ===\n');

    // Step 1: Delete existing salesforce_case links to regenerate them
    const { error: deleteError } = await supabaseAdmin
      .from('account_jira_links')
      .delete()
      .eq('user_id', userId)
      .eq('match_type', 'salesforce_case');

    if (deleteError) {
      console.error('Error deleting old links:', deleteError);
      return NextResponse.json({
        error: 'Failed to delete old links',
        details: deleteError.message
      }, { status: 500 });
    }

    console.log('Deleted existing salesforce_case links');

    // Step 2: Get ALL Salesforce cases (not just friction)
    const { data: allSalesforceCases } = await supabaseAdmin
      .from('friction_cards')
      .select(`
        id,
        account_id,
        raw_input:raw_inputs!inner(source_id, source_type)
      `)
      .eq('user_id', userId)
      .eq('raw_inputs.source_type', 'salesforce')
      .not('raw_inputs.source_id', 'is', null);

    const caseIdToAccountId = new Map<string, string>();

    allSalesforceCases?.forEach((card: any) => {
      const caseId = card.raw_input?.source_id;
      const accountId = card.account_id;
      if (caseId && accountId) {
        caseIdToAccountId.set(caseId, accountId);
      }
    });

    console.log(`Loaded ${caseIdToAccountId.size} Salesforce case IDs`);

    // Step 3: Get ALL Jira issues
    const { data: allJiraIssues, error: jiraError } = await supabaseAdmin
      .from('jira_issues')
      .select('id, jira_key, metadata')
      .eq('user_id', userId);

    if (jiraError) {
      console.error('Error fetching Jira issues:', jiraError);
      return NextResponse.json({
        error: 'Failed to fetch Jira issues',
        details: jiraError.message
      }, { status: 500 });
    }

    console.log(`Processing ${allJiraIssues?.length || 0} Jira issues`);

    // Step 4: Process each Jira issue to find Salesforce case matches
    const accountLinksToCreate: any[] = [];
    let matchedTickets = 0;

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
        console.log(`${issue.jira_key}: Matched ${matchedAccountIds.size} accounts via cases [${uniqueCaseIds.join(', ')}]`);
      }
    }

    console.log(`\nFound ${matchedTickets} tickets with Salesforce case matches`);
    console.log(`Creating ${accountLinksToCreate.length} account links`);

    // Step 5: Batch insert new links
    if (accountLinksToCreate.length > 0) {
      const { error: insertError } = await supabaseAdmin
        .from('account_jira_links')
        .insert(accountLinksToCreate);

      if (insertError) {
        console.error('Error inserting links:', insertError);
        return NextResponse.json({
          error: 'Failed to insert links',
          details: insertError.message
        }, { status: 500 });
      }

      console.log('Successfully created account links');
    }

    return NextResponse.json({
      success: true,
      stats: {
        total_issues_processed: allJiraIssues?.length || 0,
        tickets_with_matches: matchedTickets,
        links_created: accountLinksToCreate.length,
        unique_case_ids_available: caseIdToAccountId.size
      }
    });

  } catch (error) {
    console.error('Backfill error:', error);
    return NextResponse.json({
      error: 'Backfill failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
