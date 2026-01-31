import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { getDecryptedToken } from '@/lib/encryption';

export const maxDuration = 60;

// Theme keyword mapping for intelligent matching
const THEME_KEYWORDS: Record<string, string[]> = {
  'billing_confusion': ['billing', 'invoice', 'payment', 'charge', 'subscription', 'pricing', 'refund', 'credit'],
  'integration_failures': ['integration', 'api', 'sync', 'connection', 'webhook', 'import', 'export', 'connector'],
  'ui_confusion': ['ui', 'interface', 'confusing', 'unclear', 'hard to find', 'navigation', 'usability', 'ux'],
  'performance_issues': ['slow', 'performance', 'loading', 'timeout', 'lag', 'speed', 'hanging', 'freeze'],
  'missing_features': ['feature request', 'missing', 'add', 'enhancement', 'capability', 'functionality'],
  'training_gaps': ['training', 'how to', 'tutorial', 'documentation', 'help', 'guide', 'learn'],
  'support_response_time': ['support', 'response', 'waiting', 'delayed', 'ticket', 'no reply'],
  'data_quality': ['data', 'incorrect', 'missing', 'wrong', 'inaccurate', 'corrupt', 'inconsistent'],
  'reporting_issues': ['report', 'dashboard', 'analytics', 'export', 'csv', 'excel', 'chart'],
  'access_permissions': ['access', 'permission', 'login', 'password', 'locked out', 'authentication', 'authorization'],
  'configuration_problems': ['configuration', 'settings', 'setup', 'config', 'preferences'],
  'notification_issues': ['notification', 'email', 'alert', 'reminder', 'message'],
  'workflow_inefficiency': ['workflow', 'process', 'manual', 'tedious', 'time consuming', 'inefficient'],
  'mobile_issues': ['mobile', 'app', 'ios', 'android', 'phone', 'tablet', 'responsive'],
};

export async function POST(request: NextRequest) {
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
      return NextResponse.json({ error: 'Jira not connected' }, { status: 400 });
    }

    // Get API token
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // Retrieve and decrypt API token
    let tokens;
    try {
      tokens = await getDecryptedToken(supabaseAdmin, integration.id);
    } catch (error) {
      console.error('Failed to decrypt Jira token:', error);
      return NextResponse.json({
        error: 'Failed to access credentials',
        details: 'Please reconnect Jira'
      }, { status: 500 });
    }

    if (!tokens) {
      return NextResponse.json({ error: 'No API token found. Please reconnect Jira.' }, { status: 400 });
    }

    const email = integration.metadata?.email;
    const authHeader = `Basic ${Buffer.from(`${email}:${tokens.access_token}`).toString('base64')}`;

    // Fetch ALL issues from Jira (last 90 days, updated recently) with pagination
    const jql = `updated >= -90d ORDER BY updated DESC`;
    const maxResults = 100; // Jira's max per request
    let startAt = 0;
    let allIssues: any[] = [];
    let totalIssues = 0;

    console.log(`Fetching Jira issues with JQL: ${jql}`);

    // Paginate through all results
    do {
      const jiraResponse = await fetch(
        `${integration.instance_url}/rest/api/3/search/jql?jql=${encodeURIComponent(jql)}&startAt=${startAt}&maxResults=${maxResults}&fields=summary,description,status,priority,assignee,labels,created,updated,resolutiondate,comment,sprint`,
        {
          headers: {
            'Authorization': authHeader,
            'Accept': 'application/json',
          },
        }
      );

      if (!jiraResponse.ok) {
        const errorText = await jiraResponse.text();
        console.error('Jira API error:', errorText);
        return NextResponse.json({
          error: 'Failed to fetch issues from Jira',
          details: errorText
        }, { status: 500 });
      }

      const jiraData = await jiraResponse.json();

      // Log the full response structure to debug total count
      console.log('Full Jira API response structure:', JSON.stringify({
        total: jiraData.total,
        maxResults: jiraData.maxResults,
        startAt: jiraData.startAt,
        issuesCount: jiraData.issues?.length,
        allKeys: Object.keys(jiraData)
      }, null, 2));

      totalIssues = jiraData.total || 0;

      if (jiraData.issues && jiraData.issues.length > 0) {
        allIssues = allIssues.concat(jiraData.issues);
        console.log(`Fetched ${allIssues.length} of ${totalIssues} total Jira issues`);
      }

      startAt += maxResults;

      // Continue if there are more results
    } while (allIssues.length < totalIssues);

    console.log(`Finished fetching ${allIssues.length} Jira issues`);

    if (allIssues.length === 0) {
      return NextResponse.json({
        success: true,
        synced: 0,
        links_created: 0,
        message: 'No Jira issues found in the last 90 days',
      });
    }

    // Transform and store Jira issues
    const jiraIssues = allIssues.map((issue: any) => ({
      user_id: user.id,
      integration_id: integration.id,
      jira_id: issue.id,
      jira_key: issue.key,
      summary: issue.fields.summary,
      description: issue.fields.description || '',
      status: issue.fields.status?.name || 'Unknown',
      priority: issue.fields.priority?.name || null,
      assignee_name: issue.fields.assignee?.displayName || null,
      assignee_email: issue.fields.assignee?.emailAddress || null,
      sprint_name: issue.fields.sprint?.name || null,
      labels: issue.fields.labels || [],
      created_date: issue.fields.created,
      updated_date: issue.fields.updated,
      resolution_date: issue.fields.resolutiondate || null,
      issue_url: `${integration.instance_url}/browse/${issue.key}`,
      metadata: {
        comment_count: issue.fields.comment?.total || 0,
        issue_type: issue.fields.issuetype?.name || 'Unknown',
      },
      last_synced_at: new Date().toISOString(),
    }));

    // Upsert issues
    const { data: insertedIssues, error: insertError } = await supabase
      .from('jira_issues')
      .upsert(jiraIssues, {
        onConflict: 'user_id,jira_key',
        ignoreDuplicates: false
      })
      .select();

    if (insertError) {
      console.error('Insert error:', insertError);
      return NextResponse.json({
        error: 'Failed to store Jira issues',
        details: insertError.message
      }, { status: 500 });
    }

    console.log(`Stored ${insertedIssues?.length || 0} Jira issues`);

    // Create theme links using keyword matching
    let linksCreated = 0;

    for (const issue of insertedIssues || []) {
      const linkedThemes = await linkIssueToThemes(supabase, user.id, issue);
      linksCreated += linkedThemes.length;
    }

    // Update integration last_synced_at
    await supabase
      .from('integrations')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('id', integration.id);

    console.log(`Sync complete: ${insertedIssues?.length} issues, ${linksCreated} theme links created`);

    return NextResponse.json({
      success: true,
      synced: insertedIssues?.length || 0,
      total_available: totalIssues,
      links_created: linksCreated,
      message: `Synced ${insertedIssues?.length} of ${totalIssues} total issues available`,
    });

  } catch (error) {
    console.error('Jira sync error:', error);
    return NextResponse.json({
      error: 'Jira sync failed',
      details: error instanceof Error ? error.message : 'Unknown'
    }, { status: 500 });
  }
}

// Helper: Link a Jira issue to friction themes
async function linkIssueToThemes(supabase: any, userId: string, issue: any): Promise<string[]> {
  const linkedThemes: string[] = [];
  const searchText = `${issue.summary} ${issue.description || ''}`.toLowerCase();

  // Strategy 1: Label-based matching (highest confidence)
  for (const label of issue.labels || []) {
    const labelLower = label.toLowerCase().replace(/[_-\s]/g, '_');

    // Check if label matches a theme key exactly
    if (THEME_KEYWORDS[labelLower]) {
      await createThemeLink(supabase, userId, issue.id, labelLower, 'label', 1.0);
      linkedThemes.push(labelLower);
    }
  }

  // Strategy 2: Keyword-based matching (medium confidence)
  for (const [themeKey, keywords] of Object.entries(THEME_KEYWORDS)) {
    // Skip if already linked via label
    if (linkedThemes.includes(themeKey)) continue;

    // Count keyword matches
    const matchCount = keywords.filter(keyword =>
      searchText.includes(keyword.toLowerCase())
    ).length;

    if (matchCount >= 2) {
      // At least 2 keywords match → high confidence
      await createThemeLink(supabase, userId, issue.id, themeKey, 'keyword', 0.8);
      linkedThemes.push(themeKey);
    } else if (matchCount === 1) {
      // 1 keyword match → medium confidence
      await createThemeLink(supabase, userId, issue.id, themeKey, 'keyword', 0.5);
      linkedThemes.push(themeKey);
    }
  }

  return linkedThemes;
}

// Helper: Create theme-jira link
async function createThemeLink(
  supabase: any,
  userId: string,
  jiraIssueId: string,
  themeKey: string,
  matchType: 'label' | 'keyword',
  confidence: number
) {
  try {
    await supabase
      .from('theme_jira_links')
      .upsert({
        user_id: userId,
        jira_issue_id: jiraIssueId,
        theme_key: themeKey,
        match_type: matchType,
        match_confidence: confidence,
      }, {
        onConflict: 'jira_issue_id,theme_key',
        ignoreDuplicates: true
      });
  } catch (error) {
    console.error(`Failed to create theme link for ${themeKey}:`, error);
  }
}
