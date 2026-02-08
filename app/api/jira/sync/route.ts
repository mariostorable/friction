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
    // Fetch most recent issues (Pro plan has 60s timeout, can handle more)
    const MAX_ISSUES_PER_SYNC = 1000; // Process most recent 1000 issues per sync
    const jql = `updated >= -90d ORDER BY updated DESC`; // Most recent first
    const maxResults = 100; // Jira's max per request
    let startAt = 0;
    let allIssues: any[] = [];
    let totalIssues = 0;

    console.log(`Fetching most recent Jira issues with JQL: ${jql} (max ${MAX_ISSUES_PER_SYNC})`);

    // Paginate through all results
    let hasMorePages = true;
    let loopIteration = 0;
    do {
      loopIteration++;
      console.log(`\n=== Pagination Loop Iteration #${loopIteration} ===`);
      console.log(`Fetching from startAt=${startAt}, maxResults=${maxResults}`);

      const jiraResponse = await fetch(
        `${integration.instance_url}/rest/api/3/search/jql?jql=${encodeURIComponent(jql)}&startAt=${startAt}&maxResults=${maxResults}&fields=*all`,
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

      // Get total count
      totalIssues = jiraData.total || jiraData.totalResults || jiraData.count || totalIssues;

      const fetchedCount = jiraData.issues?.length || 0;
      if (fetchedCount > 0) {
        allIssues = allIssues.concat(jiraData.issues);
        console.log(`Fetched ${allIssues.length} issues so far (got ${fetchedCount} in this batch)`);
      }

      // Continue if we got a full page AND haven't hit our limit
      hasMorePages = fetchedCount === maxResults && allIssues.length < MAX_ISSUES_PER_SYNC;
      console.log(`Pagination check: fetchedCount=${fetchedCount}, maxResults=${maxResults}, allIssues.length=${allIssues.length}, MAX=${MAX_ISSUES_PER_SYNC}, hasMorePages=${hasMorePages}`);
      startAt += maxResults;

      if (!hasMorePages) {
        console.log(`Stopping pagination: ${fetchedCount < maxResults ? 'got partial page' : 'reached limit'}`);
      }

    } while (hasMorePages);

    console.log(`\n=== Pagination Complete ===`);
    console.log(`Total loop iterations: ${loopIteration}`);

    console.log(`Finished fetching ${allIssues.length} Jira issues (${totalIssues} total available)`);

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

      // Extract ALL fields including Salesforce fields (not just customfield_*)
      const customFields: Record<string, any> = {};
      Object.entries(issue.fields || {}).forEach(([key, value]) => {
        // Capture customfields AND Salesforce fields
        const isCustomField = key.startsWith('customfield_');
        const isSalesforceField = key.toLowerCase().includes('salesforce') ||
                                   key.toLowerCase().includes('client');

        if ((isCustomField || isSalesforceField) && value !== null && value !== undefined && value !== '') {
          // Store field with simplified value
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

    console.log(`Stored ${insertedIssues?.length || 0} Jira issues (fetched ${allIssues.length}, deduped to ${uniqueJiraIssues.length})`);

    // Get actual friction cards with their Salesforce Case IDs for direct linking
    // IMPORTANT: Only link Jira tickets to real friction (not normal support)
    const { data: frictionCardsWithCases } = await supabaseAdmin
      .from('friction_cards')
      .select(`
        id,
        theme_key,
        account_id,
        raw_input:raw_inputs!inner(source_id)
      `)
      .eq('user_id', userId)
      .eq('is_friction', true) // Only real friction, not normal support
      .not('raw_inputs.source_id', 'is', null); // Only cards with Salesforce Case IDs

    // Build map: Salesforce Case ID → Friction Themes
    const caseIdToThemes = new Map<string, Set<string>>();
    const caseIdToAccountId = new Map<string, string>();

    frictionCardsWithCases?.forEach((card: any) => {
      const caseId = card.raw_input?.source_id;
      if (caseId) {
        if (!caseIdToThemes.has(caseId)) {
          caseIdToThemes.set(caseId, new Set());
        }
        caseIdToThemes.get(caseId)!.add(card.theme_key);
        caseIdToAccountId.set(caseId, card.account_id);
      }
    });

    console.log(`Built case mapping: ${caseIdToThemes.size} Salesforce Cases with friction themes`);

    // Also get actual themes for fallback keyword matching
    const actualThemes = Array.from(new Set(frictionCardsWithCases?.map((c: any) => c.theme_key) || []));
    console.log(`Found ${actualThemes.length} actual friction themes`);

    // Batch link creation for better performance
    const themeLinksToCreate: any[] = [];
    const accountLinksToCreate: any[] = [];
    let directLinksCount = 0;
    let keywordLinksCount = 0;

    // Get all Top 25 accounts for name matching
    const { data: accounts } = await supabaseAdmin
      .from('accounts')
      .select('id, name')
      .eq('user_id', userId)
      .eq('status', 'active');

    // Collect all links to create (batch processing)
    for (const issue of insertedIssues || []) {
      // STRATEGY 1 (BEST): Direct link via Salesforce Case ID
      // Check if this Jira ticket has a Salesforce Case ID in custom fields
      const customFields = issue.metadata?.custom_fields || {};
      const salesforceCaseIds: string[] = [];

      // Look for Salesforce Case ID in ALL custom fields by checking the VALUE
      // Don't filter by field name - just scan all field values for case numbers
      for (const [key, value] of Object.entries(customFields)) {
        if (!value) continue;

        const fieldValue = value.toString();

        // Check if VALUE contains 8-digit case numbers (format: 03717747)
        const caseMatches = fieldValue.match(/\b\d{8}\b/g);
        if (caseMatches) {
          salesforceCaseIds.push(...caseMatches);
          console.log(`Found ${caseMatches.length} Salesforce Case Number(s) in ${key}: ${caseMatches.join(', ')}`);
          // Don't break - keep looking in case multiple fields have case numbers
        }

        // Also check for 15/18-char Salesforce IDs (format: 500XXXXXXXXXXXXX)
        const longIdMatch = fieldValue.match(/\b500[a-zA-Z0-9]{12,15}\b/g);
        if (longIdMatch) {
          salesforceCaseIds.push(...longIdMatch);
          console.log(`Found ${longIdMatch.length} Salesforce Case ID(s) in ${key}: ${longIdMatch.join(', ')}`);
          // Don't break - keep looking
        }
      }

      // Deduplicate case IDs
      const uniqueCaseIds = Array.from(new Set(salesforceCaseIds));
      salesforceCaseIds.length = 0;
      salesforceCaseIds.push(...uniqueCaseIds);

      // If we found Case IDs, create DIRECT links for ALL of them
      if (salesforceCaseIds.length > 0) {
        let hasDirectLink = false;
        const allThemes = new Set<string>();
        const allAccountIds = new Set<string>();

        // Process each Case ID
        for (const caseId of salesforceCaseIds) {
          if (caseIdToThemes.has(caseId)) {
            hasDirectLink = true;
            const themes = Array.from(caseIdToThemes.get(caseId)!);
            const accountId = caseIdToAccountId.get(caseId);

            themes.forEach(themeKey => {
              allThemes.add(themeKey);
              themeLinksToCreate.push({
                user_id: userId,
                jira_issue_id: issue.id,
                theme_key: themeKey,
                jira_key: issue.jira_key,
                match_type: 'salesforce_case',
                confidence: 1.0
              });
            });

            // Link to the account directly
            if (accountId) {
              allAccountIds.add(accountId);
              accountLinksToCreate.push({
                user_id: userId,
                account_id: accountId,
                jira_issue_id: issue.id,
                match_confidence: 1.0
              });
            }
          }
        }

        if (hasDirectLink) {
          directLinksCount++;
          console.log(`Direct link: ${issue.jira_key} → Cases [${salesforceCaseIds.join(', ')}] → ${allAccountIds.size} accounts, ${allThemes.size} themes`);
          continue; // Skip keyword matching - we have direct links!
        }
      }

      // STRATEGY 2 (FALLBACK): Keyword matching (less accurate but better than nothing)
      const keywordThemeLinks = getThemeLinksFromActualThemes(userId, issue, actualThemes);
      themeLinksToCreate.push(...keywordThemeLinks);
      if (keywordThemeLinks.length > 0) {
        keywordLinksCount++;
      }

      // Get account links for this issue (name matching)
      const accountLinks = getAccountLinks(userId, issue, accounts || []);
      accountLinksToCreate.push(...accountLinks);
    }

    console.log(`Link strategies: ${directLinksCount} direct (via Case ID), ${keywordLinksCount} keyword-based`);

    // Batch insert theme links
    let linksCreated = 0;
    if (themeLinksToCreate.length > 0) {
      const { data: createdThemeLinks } = await supabaseAdmin
        .from('theme_jira_links')
        .upsert(themeLinksToCreate, { onConflict: 'user_id,jira_issue_id,theme_key', ignoreDuplicates: true })
        .select();
      linksCreated = createdThemeLinks?.length || themeLinksToCreate.length;
    }

    // STRATEGY 3: Link accounts via themes (Jira→Theme→Account transitive linking)
    // For each Jira ticket that matched a theme, link to accounts that have friction in that theme
    console.log('Creating account links via theme associations...');

    // Build map: theme_key → Set of account_ids that have friction in that theme
    const themeToAccounts = new Map<string, Set<string>>();
    frictionCardsWithCases?.forEach((card: any) => {
      if (!themeToAccounts.has(card.theme_key)) {
        themeToAccounts.set(card.theme_key, new Set());
      }
      themeToAccounts.get(card.theme_key)!.add(card.account_id);
    });

    // For each theme link, create account links to all accounts with that theme
    const themeBasedAccountLinks: any[] = [];
    for (const themeLink of themeLinksToCreate) {
      const accountsForTheme = themeToAccounts.get(themeLink.theme_key);
      if (accountsForTheme) {
        accountsForTheme.forEach(accountId => {
          themeBasedAccountLinks.push({
            user_id: userId,
            account_id: accountId,
            jira_issue_id: themeLink.jira_issue_id,
            match_confidence: 0.7 // Medium confidence - linked via theme
          });
        });
      }
    }

    console.log(`Created ${themeBasedAccountLinks.length} account links via theme associations`);
    accountLinksToCreate.push(...themeBasedAccountLinks);

    // Batch insert account links (includes both direct Case ID links AND theme-based links)
    let accountLinksCreated = 0;
    if (accountLinksToCreate.length > 0) {
      const { data: createdAccountLinks, error: accountLinksError } = await supabaseAdmin
        .from('account_jira_links')
        .upsert(accountLinksToCreate, { onConflict: 'account_id,jira_issue_id', ignoreDuplicates: true })
        .select();

      if (accountLinksError) {
        console.error('Failed to create account links:', accountLinksError);
      }

      accountLinksCreated = createdAccountLinks?.length || 0;
    }

    const issuesSynced = allIssues.length; // Use actual fetched count, not DB return count
    console.log(`Sync complete: fetched ${issuesSynced} issues, DB returned ${insertedIssues?.length}, ${linksCreated} theme links, ${accountLinksCreated} account links created`);

    const hasMoreIssues = totalIssues > issuesSynced;
    const message = hasMoreIssues
      ? `Synced ${issuesSynced} most recent issues (${totalIssues} total available). Run sync again to fetch more.`
      : `Synced all ${issuesSynced} issues (${accountLinksCreated} linked to accounts)`;

    return NextResponse.json({
      success: true,
      synced: issuesSynced,
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
        jira_issue_id: issue.id,
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
