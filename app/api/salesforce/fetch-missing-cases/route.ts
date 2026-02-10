import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { getDecryptedToken } from '@/lib/encryption';

export const maxDuration = 300; // 5 minutes for fetching many cases
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    console.log('\n=== Fetching Missing Salesforce Cases ===\n');
    console.log(`User ID: ${user.id}\n`);

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );

    // Step 1: Get all case IDs from Jira tickets
    console.log('Step 1: Extracting case IDs from Jira tickets...');
    const { data: jiraIssues } = await supabaseAdmin
      .from('jira_issues')
      .select('jira_key, metadata')
      .eq('user_id', user.id)
      .not('metadata->custom_fields->customfield_17254', 'is', null);

    const jiraCaseIds = new Set<string>();
    for (const issue of jiraIssues || []) {
      const fieldValue = issue.metadata?.custom_fields?.customfield_17254;
      if (!fieldValue) continue;

      const matches = fieldValue.toString().match(/\b\d{8}\b/g);
      if (matches) {
        matches.forEach((caseId: string) => jiraCaseIds.add(caseId));
      }
    }

    console.log(`  Found ${jiraCaseIds.size} unique case IDs in Jira tickets\n`);

    // Step 2: Get all case IDs already in database
    console.log('Step 2: Checking which case IDs are already in database...');
    const { data: existingCases } = await supabaseAdmin
      .from('raw_inputs')
      .select('source_id')
      .eq('user_id', user.id)
      .eq('source_type', 'salesforce')
      .not('source_id', 'is', null);

    const existingCaseIds = new Set(existingCases?.map(c => c.source_id) || []);
    console.log(`  Found ${existingCaseIds.size} case IDs already in database\n`);

    // Step 3: Find missing case IDs
    const missingCaseIds = Array.from(jiraCaseIds).filter(id => !existingCaseIds.has(id));
    console.log(`Step 3: Found ${missingCaseIds.length} missing case IDs\n`);

    if (missingCaseIds.length === 0) {
      console.log('✓ No missing cases! All Jira-referenced cases are in the database.');
      return NextResponse.json({
        success: true,
        message: 'No missing cases',
        imported: 0
      });
    }

    // Step 4: Get Salesforce integration credentials
    console.log('Step 4: Fetching Salesforce credentials...');
    const { data: integration } = await supabaseAdmin
      .from('integrations')
      .select('*')
      .eq('user_id', user.id)
      .eq('integration_type', 'salesforce')
      .eq('status', 'active')
      .single();

    if (!integration) {
      return NextResponse.json({ error: 'No active Salesforce integration found' }, { status: 400 });
    }

    // Get decrypted tokens
    const tokens = await getDecryptedToken(supabaseAdmin, integration.id);

    if (!tokens) {
      return NextResponse.json({ error: 'No Salesforce tokens found' }, { status: 400 });
    }

    console.log(`  Using instance: ${integration.instance_url}\n`);

    // Step 5: Query Salesforce for missing cases in batches
    console.log('Step 5: Querying Salesforce for missing cases...');
    console.log(`  (This may take a moment for ${missingCaseIds.length} cases)\n`);

    const batchSize = 50;
    const allFetchedCases: any[] = [];

    for (let i = 0; i < missingCaseIds.length; i += batchSize) {
      const batch = missingCaseIds.slice(i, i + batchSize);
      const caseNumberList = batch.map(id => `'${id}'`).join(',');

      const query = `SELECT Id,CaseNumber,AccountId,Subject,Description,Status,Priority,CreatedDate,ClosedDate,Origin FROM Case WHERE CaseNumber IN (${caseNumberList})`;
      const queryUrl = `${integration.instance_url}/services/data/v59.0/query?q=${encodeURIComponent(query)}`;

      try {
        const response = await fetch(queryUrl, {
          headers: {
            'Authorization': `Bearer ${tokens.access_token}`,
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          console.error(`  ✗ Batch ${i / batchSize + 1} failed:`, response.status, await response.text());
          continue;
        }

        const data = await response.json();
        if (data.records && data.records.length > 0) {
          allFetchedCases.push(...data.records);
          console.log(`  ✓ Batch ${i / batchSize + 1}: Found ${data.records.length} cases`);
        } else {
          console.log(`  ✗ Batch ${i / batchSize + 1}: No cases found`);
        }
      } catch (error) {
        console.error(`  ✗ Batch ${i / batchSize + 1} error:`, error);
      }
    }

    console.log(`\n  Total cases fetched from Salesforce: ${allFetchedCases.length}\n`);

    if (allFetchedCases.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No cases found in Salesforce - they may have been deleted',
        imported: 0,
        searched: missingCaseIds.length
      });
    }

    // Step 6: Map AccountId to account_id in our database
    console.log('Step 6: Mapping Salesforce AccountIds to database account_ids...');
    const salesforceAccountIds = Array.from(new Set(allFetchedCases.map(c => c.AccountId)));

    const { data: accounts } = await supabaseAdmin
      .from('accounts')
      .select('id, salesforce_id')
      .eq('user_id', user.id)
      .in('salesforce_id', salesforceAccountIds);

    const sfIdToAccountId = new Map(accounts?.map(a => [a.salesforce_id, a.id]) || []);
    console.log(`  Mapped ${sfIdToAccountId.size} Salesforce accounts to database accounts\n`);

    // Step 7: Create raw_inputs for the fetched cases
    console.log('Step 7: Creating raw_inputs...');
    const rawInputs = allFetchedCases
      .filter(sfCase => sfIdToAccountId.has(sfCase.AccountId))
      .map(sfCase => {
        const origin = sfCase.Origin || sfCase.origin || sfCase.CaseOrigin || 'Unknown';

        return {
          user_id: user.id,
          account_id: sfIdToAccountId.get(sfCase.AccountId),
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

    console.log(`  Prepared ${rawInputs.length} raw_inputs (filtered to accounts in database)\n`);

    if (rawInputs.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No cases to import - all fetched cases belong to accounts not in your database',
        imported: 0,
        fetched: allFetchedCases.length
      });
    }

    const { data: insertedInputs, error: insertError } = await supabaseAdmin
      .from('raw_inputs')
      .insert(rawInputs)
      .select();

    if (insertError) {
      console.error('✗ Insert error:', insertError);
      return NextResponse.json({ error: 'Failed to import cases', details: insertError.message }, { status: 500 });
    }

    console.log(`✓ Successfully imported ${insertedInputs?.length} cases\n`);

    // Step 8: Return summary
    return NextResponse.json({
      success: true,
      imported: insertedInputs?.length || 0,
      searched: missingCaseIds.length,
      fetched: allFetchedCases.length,
      message: `Successfully imported ${insertedInputs?.length} cases. Run the backfill script to link them to Jira tickets.`
    });

  } catch (error) {
    console.error('Fetch missing cases error:', error);
    return NextResponse.json({
      error: 'Failed to fetch missing cases',
      details: error instanceof Error ? error.message : 'Unknown'
    }, { status: 500 });
  }
}
