import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { getDecryptedToken } from '@/lib/encryption';

export const maxDuration = 120; // Increased for large Jira instances

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
    // Check if this is a cron job request
    const authHeader = request.headers.get('authorization');
    const userIdHeader = request.headers.get('x-user-id');
    const isCronRequest = authHeader === `Bearer ${process.env.CRON_SECRET}` && userIdHeader;

    let userId: string;

    if (isCronRequest) {
      // Cron job request - use the user ID from header
      userId = userIdHeader!;
    } else {
      // Regular user request - authenticate via session
      const supabase = createRouteHandlerClient({ cookies });
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
      }
      userId = user.id;
    }

    // Use admin client for all database operations
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

    // Get Jira integration
    const { data: integration } = await supabaseAdmin
      .from('integrations')
      .select('*')
      .eq('user_id', userId)
      .eq('integration_type', 'jira')
      .eq('status', 'active')
      .single();

    if (!integration) {
      return NextResponse.json({ error: 'Jira not connected' }, { status: 400 });
    }

    // Update last_synced_at at the START so UI updates even if we timeout
    await supabaseAdmin
      .from('integrations')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('id', integration.id);

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
    const jiraAuthHeader = `Basic ${Buffer.from(`${email}:${tokens.access_token}`).toString('base64')}`;

    // Fetch recent issues from Jira with pagination
    // Limit to avoid Vercel timeout (10s on Hobby plan)
    const MAX_ISSUES_PER_SYNC = 200; // Process most recent 200 issues per sync
    const jql = `updated >= -90d ORDER BY updated DESC`;
    const maxResults = 100; // Jira's max per request
    let startAt = 0;
    let allIssues: any[] = [];
    let totalIssues = 0;

    console.log(`Fetching Jira issues with JQL: ${jql} (max ${MAX_ISSUES_PER_SYNC})`);

    // Fetch field metadata on first run to discover custom fields
    if (startAt === 0) {
      try {
        const fieldsResponse = await fetch(
          `${integration.instance_url}/rest/api/3/field`,
          {
            headers: {
              'Authorization': jiraAuthHeader,
              'Accept': 'application/json',
            },
          }
        );

        if (fieldsResponse.ok) {
          const fields = await fieldsResponse.json();
          console.log('Available Jira fields that might contain account info:');
          const relevantFields = fields.filter((f: any) => {
            const nameLower = (f.name || '').toLowerCase();
            return nameLower.includes('account') ||
                   nameLower.includes('customer') ||
                   nameLower.includes('salesforce') ||
                   nameLower.includes('organization') ||
                   nameLower.includes('company');
          });
          console.log('Potentially relevant fields:', relevantFields.map((f: any) => ({
            id: f.id,
            name: f.name,
            custom: f.custom,
            schema: f.schema
          })));
        }
      } catch (error) {
        console.error('Failed to fetch field metadata:', error);
      }
    }

    // Paginate through all results
    let hasMorePages = true;
    do {
      const jiraResponse = await fetch(
        `${integration.instance_url}/rest/api/3/search/jql?jql=${encodeURIComponent(jql)}&startAt=${startAt}&maxResults=${maxResults}&fields=summary,description,status,priority,assignee,labels,created,updated,resolutiondate,resolution,comment,sprint,components,fixVersions,parent,issuetype,reporter,customfield_*`,
        {
          headers: {
            'Authorization': jiraAuthHeader,
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
      console.log('Full Jira API response (first 500 chars):', JSON.stringify(jiraData).substring(0, 500));
      console.log('All top-level keys:', Object.keys(jiraData));
      console.log('Looking for total in different fields:', {
        total: jiraData.total,
        totalResults: jiraData.totalResults,
        count: jiraData.count,
        size: jiraData.size,
        maxResults: jiraData.maxResults,
        startAt: jiraData.startAt,
        issuesLength: jiraData.issues?.length
      });

      // Log first issue's field structure to discover custom fields
      if (startAt === 0 && jiraData.issues && jiraData.issues.length > 0) {
        const firstIssue = jiraData.issues[0];
        console.log('\n=== First Issue Field Analysis ===');
        console.log('Issue Key:', firstIssue.key);
        console.log('All available field keys:', Object.keys(firstIssue.fields || {}));

        // Look for custom fields that might contain account info
        const customFields = Object.entries(firstIssue.fields || {})
          .filter(([key]) => key.startsWith('customfield_'))
          .map(([key, value]) => ({
            key,
            value: value,
            type: typeof value,
            hasValue: value !== null && value !== undefined && value !== ''
          }));

        console.log('Custom fields found:', customFields);
        console.log('Custom fields with values:', customFields.filter(f => f.hasValue));
      }

      // Try different field names for total count
      totalIssues = jiraData.total || jiraData.totalResults || jiraData.count || totalIssues;

      const fetchedCount = jiraData.issues?.length || 0;
      if (fetchedCount > 0) {
        allIssues = allIssues.concat(jiraData.issues);
        console.log(`Fetched ${allIssues.length} issues so far (got ${fetchedCount} in this batch)`);
      }

      // Continue if we got a full page AND haven't hit our limit
      hasMorePages = fetchedCount === maxResults && allIssues.length < MAX_ISSUES_PER_SYNC;
      startAt += maxResults;

    } while (hasMorePages);

    console.log(`Finished fetching ${allIssues.length} Jira issues`);

    // If we never got a total count, use the actual number we fetched
    if (totalIssues === 0 && allIssues.length > 0) {
      totalIssues = allIssues.length;
    }

    if (allIssues.length === 0) {
      return NextResponse.json({
        success: true,
        synced: 0,
        links_created: 0,
        message: 'No Jira issues found in the last 90 days',
      });
    }

    // Generate AI-friendly summaries for new/updated issues
    const existingIssueKeys = new Set<string>();
    const { data: existingIssues } = await supabaseAdmin
      .from('jira_issues')
      .select('jira_key, updated_date')
      .eq('user_id', userId);

    existingIssues?.forEach((issue: any) => {
      existingIssueKeys.add(issue.jira_key);
    });

    const issuesNeedingSummary = allIssues.filter((issue: any) => !existingIssueKeys.has(issue.key));

    console.log(`Found ${issuesNeedingSummary.length} new issues (skipping AI summaries to avoid timeout)`);

    // Skip AI summary generation to avoid timeouts
    // AI summaries are nice-to-have but not critical for linking tickets to themes/accounts
    // TODO: Consider generating summaries in a separate background job
    const aiSummaries: Record<string, string> = {};

    // Transform and store Jira issues
    const jiraIssues = allIssues.map((issue: any) => {
      // Extract components
      const components = (issue.fields.components || []).map((c: any) => c.name);

      // Extract fix versions
      const fixVersions = (issue.fields.fixVersions || []).map((v: any) => v.name);

      // Extract parent issue key (for subtasks)
      const parentKey = issue.fields.parent?.key || null;

      // Extract resolution reason
      const resolution = issue.fields.resolution?.name || null;

      // Extract reporter
      const reporterName = issue.fields.reporter?.displayName || null;
      const reporterEmail = issue.fields.reporter?.emailAddress || null;

      // Extract all custom fields for discovery
      const customFields: Record<string, any> = {};
      Object.entries(issue.fields || {}).forEach(([key, value]) => {
        if (key.startsWith('customfield_') && value !== null && value !== undefined && value !== '') {
          // Store custom field with simplified value
          if (typeof value === 'object') {
            // For objects, try to extract meaningful value
            const objValue = value as any;
            if (objValue.displayName) customFields[key] = objValue.displayName;
            else if (objValue.name) customFields[key] = objValue.name;
            else if (objValue.value) customFields[key] = objValue.value;
            else if (Array.isArray(objValue)) {
              customFields[key] = objValue.map((v: any) => v.name || v.value || v).join(', ');
            } else {
              customFields[key] = JSON.stringify(objValue).substring(0, 500);
            }
          } else {
            customFields[key] = value;
          }
        }
      });

      return {
        user_id: userId,
        integration_id: integration.id,
        jira_id: issue.id,
        jira_key: issue.key,
        summary: issue.fields.summary,
        description: issue.fields.description || '',
        status: issue.fields.status?.name || 'Unknown',
        issue_type: issue.fields.issuetype?.name || 'Unknown',
        priority: issue.fields.priority?.name || null,
        resolution: resolution,
        components: components,
        fix_versions: fixVersions,
        parent_key: parentKey,
        assignee_name: issue.fields.assignee?.displayName || null,
        assignee_email: issue.fields.assignee?.emailAddress || null,
        reporter_name: reporterName,
        reporter_email: reporterEmail,
        sprint_name: issue.fields.sprint?.name || null,
        labels: issue.fields.labels || [],
        created_date: issue.fields.created,
        updated_date: issue.fields.updated,
        resolution_date: issue.fields.resolutiondate || null,
        issue_url: `${integration.instance_url}/browse/${issue.key}`,
        ai_summary: aiSummaries[issue.key] || null,
        metadata: {
          comment_count: issue.fields.comment?.total || 0,
          custom_fields: customFields,
        },
        last_synced_at: new Date().toISOString(),
      };
    });

    // Deduplicate issues by jira_key (keep most recent)
    const uniqueIssuesMap = new Map<string, any>();
    jiraIssues.forEach((issue: any) => {
      uniqueIssuesMap.set(issue.jira_key, issue);
    });
    const uniqueJiraIssues = Array.from(uniqueIssuesMap.values());

    console.log(`Deduped ${jiraIssues.length} to ${uniqueJiraIssues.length} unique issues`);

    // Upsert issues
    const { data: insertedIssues, error: insertError } = await supabaseAdmin
      .from('jira_issues')
      .upsert(uniqueJiraIssues, {
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

    // Get actual friction themes from the system (not hardcoded!)
    const { data: frictionCards } = await supabaseAdmin
      .from('friction_cards')
      .select('theme_key')
      .eq('user_id', userId);

    const actualThemes = Array.from(new Set(frictionCards?.map((c: any) => c.theme_key) || []));
    console.log(`Found ${actualThemes.length} actual friction themes for matching:`, actualThemes);

    // Batch link creation for better performance
    const themeLinksToCreate: any[] = [];
    const accountLinksToCreate: any[] = [];

    // Get all Top 25 accounts for name matching
    const { data: accounts } = await supabaseAdmin
      .from('accounts')
      .select('id, name')
      .eq('user_id', userId)
      .eq('status', 'active');

    // Collect all links to create (batch processing)
    for (const issue of insertedIssues || []) {
      // Get theme links for this issue using BOTH hardcoded keywords AND actual themes
      const themeLinks = getThemeLinks(userId, issue);
      const actualThemeLinks = getThemeLinksFromActualThemes(userId, issue, actualThemes);
      themeLinksToCreate.push(...themeLinks, ...actualThemeLinks);

      // Get account links for this issue
      const accountLinks = getAccountLinks(userId, issue, accounts || []);
      accountLinksToCreate.push(...accountLinks);
    }

    // Batch insert theme links
    let linksCreated = 0;
    if (themeLinksToCreate.length > 0) {
      const { data: createdThemeLinks } = await supabaseAdmin
        .from('theme_jira_links')
        .upsert(themeLinksToCreate, { onConflict: 'user_id,jira_issue_id,theme_key', ignoreDuplicates: true })
        .select();
      linksCreated = createdThemeLinks?.length || themeLinksToCreate.length;
    }

    // Batch insert account links
    let accountLinksCreated = 0;
    if (accountLinksToCreate.length > 0) {
      const { data: createdAccountLinks } = await supabaseAdmin
        .from('account_jira_links')
        .upsert(accountLinksToCreate, { onConflict: 'user_id,account_id,jira_key', ignoreDuplicates: true })
        .select();
      accountLinksCreated = createdAccountLinks?.length || accountLinksToCreate.length;
    }

    console.log(`Sync complete: ${insertedIssues?.length} issues, ${linksCreated} theme links, ${accountLinksCreated} account links created`);

    const hasMoreIssues = totalIssues > (insertedIssues?.length || 0);
    const message = hasMoreIssues
      ? `Synced ${insertedIssues?.length} most recent issues (${totalIssues} total available). Run sync again to fetch more.`
      : `Synced all ${insertedIssues?.length} issues (${accountLinksCreated} linked to accounts)`;

    return NextResponse.json({
      success: true,
      synced: insertedIssues?.length || 0,
      total_available: totalIssues,
      links_created: linksCreated,
      account_links_created: accountLinksCreated,
      message,
      has_more: hasMoreIssues,
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
  const componentsText = (issue.components || []).join(' ').toLowerCase();

  // Strategy 1: Label-based matching (highest confidence)
  for (const label of issue.labels || []) {
    const labelLower = label.toLowerCase().replace(/[_-\s]/g, '_');

    // Check if label matches a theme key exactly
    if (THEME_KEYWORDS[labelLower]) {
      await createThemeLink(supabase, userId, issue.id, labelLower, 'label', 1.0);
      linkedThemes.push(labelLower);
    }
  }

  // Strategy 2: Component-based matching (high confidence)
  // Components often directly map to product areas
  if (componentsText) {
    for (const [themeKey, keywords] of Object.entries(THEME_KEYWORDS)) {
      if (linkedThemes.includes(themeKey)) continue;

      const componentMatches = keywords.filter(keyword =>
        componentsText.includes(keyword.toLowerCase())
      ).length;

      if (componentMatches >= 1) {
        await createThemeLink(supabase, userId, issue.id, themeKey, 'component', 0.9);
        linkedThemes.push(themeKey);
      }
    }
  }

  // Strategy 3: Keyword-based matching (medium confidence)
  for (const [themeKey, keywords] of Object.entries(THEME_KEYWORDS)) {
    // Skip if already linked via label or component
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

// Helper: Get theme links for batch processing (doesn't do DB operations)
function getThemeLinks(userId: string, issue: any): any[] {
  const links: any[] = [];
  const linkedThemes: string[] = [];
  const searchText = `${issue.summary} ${issue.description || ''}`.toLowerCase();
  const componentsText = (issue.components || []).join(' ').toLowerCase();

  // Strategy 1: Label-based matching
  for (const label of issue.labels || []) {
    const labelLower = label.toLowerCase().replace(/[_-\s]/g, '_');
    if (THEME_KEYWORDS[labelLower]) {
      links.push({
        user_id: userId,
        jira_issue_id: issue.id,
        theme_key: labelLower,
        jira_key: issue.jira_key,
        match_type: 'label',
        confidence: 1.0
      });
      linkedThemes.push(labelLower);
    }
  }

  // Strategy 2: Component-based matching
  if (componentsText) {
    for (const [themeKey, keywords] of Object.entries(THEME_KEYWORDS)) {
      if (linkedThemes.includes(themeKey)) continue;
      const componentMatches = keywords.filter(keyword =>
        componentsText.includes(keyword.toLowerCase())
      ).length;
      if (componentMatches >= 1) {
        links.push({
          user_id: userId,
          jira_issue_id: issue.id,
          theme_key: themeKey,
          jira_key: issue.jira_key,
          match_type: 'component',
          confidence: 0.9
        });
        linkedThemes.push(themeKey);
      }
    }
  }

  // Strategy 3: Keyword-based matching
  for (const [themeKey, keywords] of Object.entries(THEME_KEYWORDS)) {
    if (linkedThemes.includes(themeKey)) continue;
    const matchCount = keywords.filter(keyword =>
      searchText.includes(keyword.toLowerCase())
    ).length;
    if (matchCount >= 2) {
      links.push({
        user_id: userId,
        jira_issue_id: issue.id,
        theme_key: themeKey,
        jira_key: issue.jira_key,
        match_type: 'keyword',
        confidence: 0.8
      });
      linkedThemes.push(themeKey);
    } else if (matchCount === 1) {
      links.push({
        user_id: userId,
        jira_issue_id: issue.id,
        theme_key: themeKey,
        jira_key: issue.jira_key,
        match_type: 'keyword',
        confidence: 0.5
      });
      linkedThemes.push(themeKey);
    }
  }

  return links;
}

// Helper: Match Jira issues to ACTUAL friction themes (not hardcoded keywords)
function getThemeLinksFromActualThemes(userId: string, issue: any, actualThemes: string[]): any[] {
  const links: any[] = [];
  const searchText = `${issue.summary} ${issue.description || ''} ${issue.labels?.join(' ') || ''}`.toLowerCase();

  for (const themeKey of actualThemes) {
    // Convert theme_key to searchable format
    // Example: "reporting_data_accuracy" -> ["reporting", "data", "accuracy"]
    const themeWords = themeKey.toLowerCase().split('_').filter(w => w.length > 3);

    // Count how many theme words appear in the Jira issue
    const matchCount = themeWords.filter(word => searchText.includes(word)).length;

    if (matchCount >= 2) {
      // Multiple words match - high confidence
      links.push({
        user_id: userId,
        jira_issue_id: issue.id,
        theme_key: themeKey,
        jira_key: issue.jira_key,
        match_type: 'keyword',
        confidence: 0.8
      });
    } else if (matchCount === 1 && themeWords.length === 1) {
      // Single word theme that matches - medium confidence
      links.push({
        user_id: userId,
        jira_issue_id: issue.id,
        theme_key: themeKey,
        jira_key: issue.jira_key,
        match_type: 'keyword',
        confidence: 0.6
      });
    }

    // Also check for exact label match
    if (issue.labels) {
      for (const label of issue.labels) {
        const labelNormalized = label.toLowerCase().replace(/[_-\s]/g, '_');
        if (labelNormalized === themeKey.toLowerCase()) {
          links.push({
            user_id: userId,
            jira_issue_id: issue.id,
            theme_key: themeKey,
            jira_key: issue.jira_key,
            match_type: 'label',
            confidence: 1.0
          });
          break;
        }
      }
    }
  }

  return links;
}

// Helper: Get account links for batch processing (doesn't do DB operations)
function getAccountLinks(userId: string, issue: any, accounts: any[]): any[] {
  const links: any[] = [];
  const searchText = `${issue.summary} ${issue.description || ''}`.toLowerCase();

  for (const account of accounts) {
    const accountName = account.name.toLowerCase();
    if (searchText.includes(accountName)) {
      links.push({
        user_id: userId,
        account_id: account.id,
        jira_key: issue.jira_key,
        match_confidence: 0.9
      });
    }
  }

  return links;
}

// Helper: Link Jira issue to accounts by name matching
async function linkIssueToAccounts(
  supabase: any,
  userId: string,
  issue: any,
  accounts: Array<{ id: string; name: string }>
): Promise<string[]> {
  const linkedAccounts: string[] = [];
  const searchText = `${issue.summary} ${issue.description || ''}`.toLowerCase();

  for (const account of accounts) {
    // Check if account name appears in the ticket
    // Try both full name and variations (e.g., "William Warren" matches "Warren")
    const nameParts = account.name.toLowerCase().split(/[\s-,]+/);
    const matchesName = nameParts.some(part =>
      part.length > 3 && searchText.includes(part)
    );

    if (matchesName) {
      try {
        await supabase
          .from('account_jira_links')
          .upsert({
            user_id: userId,
            account_id: account.id,
            jira_issue_id: issue.id,
            match_type: 'account_name',
            match_confidence: 0.9,
          }, {
            onConflict: 'account_id,jira_issue_id',
            ignoreDuplicates: true
          });
        linkedAccounts.push(account.id);
        console.log(`Linked ${issue.jira_key} to account ${account.name}`);
      } catch (error) {
        console.error(`Failed to link to account ${account.name}:`, error);
      }
    }
  }

  return linkedAccounts;
}

// Helper: Create theme-jira link
async function createThemeLink(
  supabase: any,
  userId: string,
  jiraIssueId: string,
  themeKey: string,
  matchType: 'label' | 'keyword' | 'component',
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

// Helper: Generate AI-friendly summary using Claude
async function generateAISummary(issue: any): Promise<string> {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error('ANTHROPIC_API_KEY not configured');
      return issue.fields.summary;
    }

    const description = issue.fields.description || 'No description provided';
    const prompt = `Rewrite this Jira ticket in plain English that a customer success manager would understand:

Title: ${issue.fields.summary}
Description: ${description}
Status: ${issue.fields.status?.name || 'Unknown'}
Priority: ${issue.fields.priority?.name || 'Not set'}

Provide a 1-2 sentence summary focusing on:
- What customer problem this fixes
- The business impact

Keep it concise, non-technical, and customer-focused.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 200,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Claude API error:', errorText);
      return issue.fields.summary;
    }

    const data = await response.json();
    return data.content[0].text;
  } catch (error) {
    console.error('Failed to generate AI summary:', error);
    return issue.fields.summary;
  }
}
