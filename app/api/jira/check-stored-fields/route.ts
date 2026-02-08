import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

/**
 * Check what's actually stored in the database for Jira issues
 * This helps debug why custom_fields is empty
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Get 5 sample Jira issues with their full metadata
    const { data: issues, error } = await supabase
      .from('jira_issues')
      .select('jira_key, summary, metadata')
      .eq('user_id', user.id)
      .limit(5);

    if (error) {
      return NextResponse.json({ error: 'Database query failed', details: error.message }, { status: 500 });
    }

    if (!issues || issues.length === 0) {
      return NextResponse.json({ error: 'No Jira issues found in database' }, { status: 404 });
    }

    // Analyze the stored data
    const analysis = issues.map(issue => {
      const customFields = issue.metadata?.custom_fields || {};
      const customFieldKeys = Object.keys(customFields);

      return {
        jira_key: issue.jira_key,
        summary: issue.summary,
        has_metadata: !!issue.metadata,
        has_custom_fields: !!issue.metadata?.custom_fields,
        custom_fields_type: typeof customFields,
        custom_fields_is_empty_object: JSON.stringify(customFields) === '{}',
        custom_field_count: customFieldKeys.length,
        custom_field_keys: customFieldKeys,
        sample_custom_fields: customFieldKeys.length > 0 ?
          Object.fromEntries(Object.entries(customFields).slice(0, 3)) :
          null,
        full_metadata: issue.metadata
      };
    });

    return NextResponse.json({
      success: true,
      total_issues_checked: issues.length,
      issues_with_custom_fields: analysis.filter(a => a.custom_field_count > 0).length,
      issues_with_empty_custom_fields: analysis.filter(a => a.custom_fields_is_empty_object).length,
      issues_with_null_custom_fields: analysis.filter(a => !a.has_custom_fields).length,
      analysis
    });

  } catch (error) {
    console.error('Check stored fields error:', error);
    return NextResponse.json({
      error: 'Check failed',
      details: error instanceof Error ? error.message : 'Unknown'
    }, { status: 500 });
  }
}
