import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Get sample of Jira issues with custom fields
    const { data: issues, error } = await supabaseAdmin
      .from('jira_issues')
      .select('jira_key, summary, metadata')
      .eq('user_id', user.id)
      .not('metadata->custom_fields', 'is', null)
      .limit(10);

    if (error) {
      console.error('Error fetching issues:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Get all accounts with Salesforce IDs
    const { data: accounts } = await supabaseAdmin
      .from('accounts')
      .select('id, name, salesforce_id')
      .eq('user_id', user.id)
      .not('salesforce_id', 'is', null);

    // Analyze custom fields
    const customFieldKeys = new Set<string>();
    const customFieldSamples: Record<string, Set<string>> = {};
    const potentialMatches: any[] = [];

    issues?.forEach((issue: any) => {
      const customFields = issue.metadata?.custom_fields || {};

      Object.entries(customFields).forEach(([key, value]: [string, any]) => {
        customFieldKeys.add(key);

        if (!customFieldSamples[key]) {
          customFieldSamples[key] = new Set();
        }

        const valueStr = String(value).substring(0, 100);
        if (valueStr && customFieldSamples[key].size < 5) {
          customFieldSamples[key].add(valueStr);
        }

        // Check if this value matches any Salesforce ID
        accounts?.forEach((account: any) => {
          if (String(value) === account.salesforce_id) {
            potentialMatches.push({
              jira_key: issue.jira_key,
              summary: issue.summary,
              custom_field_key: key,
              custom_field_value: value,
              matched_account: account.name,
              salesforce_id: account.salesforce_id,
            });
          }
        });
      });
    });

    // Convert sets to arrays
    const fieldAnalysis = Array.from(customFieldKeys).map(key => ({
      field_key: key,
      sample_values: Array.from(customFieldSamples[key] || []),
    }));

    return NextResponse.json({
      total_issues_analyzed: issues?.length || 0,
      total_accounts: accounts?.length || 0,
      custom_fields_found: customFieldKeys.size,
      field_analysis: fieldAnalysis,
      salesforce_matches: potentialMatches,
      recommendation: potentialMatches.length > 0
        ? `Found ${potentialMatches.length} matches! Use field: ${potentialMatches[0].custom_field_key}`
        : 'No direct Salesforce ID matches found. Check sample values above.',
    });
  } catch (error) {
    console.error('Custom field analysis error:', error);
    return NextResponse.json({
      error: 'Analysis failed',
      details: error instanceof Error ? error.message : 'Unknown',
    }, { status: 500 });
  }
}
