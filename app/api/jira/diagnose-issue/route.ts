import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { getDecryptedToken } from '@/lib/encryption';

export const dynamic = 'force-dynamic';

/**
 * Diagnostic endpoint to fetch a single Jira issue and show raw API response
 * This helps debug why custom fields aren't being captured
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Get Jira integration
    const { data: integration } = await supabase
      .from('integrations')
      .select('*')
      .eq('user_id', user.id)
      .eq('integration_type', 'jira')
      .eq('status', 'active')
      .single();

    if (!integration) {
      return NextResponse.json({ error: 'No active Jira integration found' }, { status: 404 });
    }

    // Decrypt token
    const decryptedMetadata = await getDecryptedToken(supabase, integration.id);
    const accessToken = decryptedMetadata?.access_token;

    if (!accessToken) {
      return NextResponse.json({ error: 'No Jira access token found' }, { status: 401 });
    }

    const jiraAuthHeader = `Bearer ${accessToken}`;

    // Fetch ONE recent issue with same fields as sync endpoint
    const jql = `updated >= -90d ORDER BY updated DESC`;
    const jiraResponse = await fetch(
      `${integration.instance_url}/rest/api/3/search/jql?jql=${encodeURIComponent(jql)}&maxResults=1&fields=summary,description,status,priority,assignee,labels,created,updated,resolutiondate,resolution,comment,sprint,components,fixVersions,parent,issuetype,reporter,customfield_*`,
      {
        headers: {
          'Authorization': jiraAuthHeader,
          'Accept': 'application/json',
        },
      }
    );

    if (!jiraResponse.ok) {
      const errorText = await jiraResponse.text();
      return NextResponse.json({
        error: 'Failed to fetch from Jira',
        details: errorText
      }, { status: 500 });
    }

    const jiraData = await jiraResponse.json();
    const issue = jiraData.issues?.[0];

    if (!issue) {
      return NextResponse.json({ error: 'No issues found' }, { status: 404 });
    }

    // Extract all field keys
    const allFieldKeys = Object.keys(issue.fields || {});
    const customFieldKeys = allFieldKeys.filter(k => k.startsWith('customfield_'));

    // Show custom fields with their values
    const customFieldsWithValues = customFieldKeys.map(key => ({
      key,
      value: issue.fields[key],
      type: typeof issue.fields[key],
      hasValue: issue.fields[key] !== null && issue.fields[key] !== undefined && issue.fields[key] !== ''
    }));

    // Look for fields that might contain Salesforce IDs
    const salesforceFields = customFieldsWithValues.filter(f => {
      if (!f.value) return false;
      const valueStr = JSON.stringify(f.value);
      return valueStr.includes('500') || // Case ID
             valueStr.includes('001') || // Account ID
             valueStr.includes('003') || // Contact ID
             valueStr.toLowerCase().includes('salesforce') ||
             valueStr.toLowerCase().includes('case');
    });

    return NextResponse.json({
      success: true,
      issueKey: issue.key,
      summary: issue.fields.summary,
      totalFields: allFieldKeys.length,
      totalCustomFields: customFieldKeys.length,
      customFieldsWithValues: customFieldsWithValues.filter(f => f.hasValue).length,
      customFieldsEmpty: customFieldsWithValues.filter(f => !f.hasValue).length,
      salesforceFields: salesforceFields.length,
      // Show details
      customFieldKeys: customFieldKeys,
      customFieldsWithData: customFieldsWithValues.filter(f => f.hasValue),
      potentialSalesforceFields: salesforceFields,
      // Full raw data for debugging
      rawIssue: issue
    });

  } catch (error) {
    console.error('Diagnostic error:', error);
    return NextResponse.json({
      error: 'Diagnostic failed',
      details: error instanceof Error ? error.message : 'Unknown'
    }, { status: 500 });
  }
}
