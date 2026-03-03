import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { getDecryptedToken } from '@/lib/encryption';

export const maxDuration = 300; // Max allowed on Vercel Pro
export const dynamic = 'force-dynamic';


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

    // Fetch all issues across relevant projects within the last 365 days.
    // Per-pass caps prevent Vercel 5-min timeout — raise if needed.
    const maxResults = 100;
    let allIssues: any[] = [];
    let totalIssues = 0;

    const fetchPaginatedIssues = async (jql: string, cap = 2000): Promise<any[]> => {
      const issues: any[] = [];
      let startAt = 0;
      let pageNum = 0;

      while (issues.length < cap) {
        pageNum++;
        const fields = [
          'summary', 'description', 'status', 'issuetype', 'priority',
          'created', 'updated', 'components', 'fixVersions', 'labels',
          'customfield_12184', // Client(s) field
          'customfield_17254', // SF Case Numbers
          'customfield_10007', // Sprint
          'customfield_10008', // Epic Link
          'customfield_12046', // Team
          'customfield_12114', // Fix Version
          'customfield_12141', // Product Area
          'customfield_12145', // Environment
          'customfield_12186', // CSM
          'customfield_12976', // Account Manager
          'customfield_15858', // Customer Priority
          'customfield_17089', // Customer Impacting
          'customfield_17453', // AHA Link
        ].join(',');
        const url = `${integration.instance_url}/rest/api/3/search/jql?jql=${encodeURIComponent(jql)}&startAt=${startAt}&maxResults=${maxResults}&fields=${fields}`;
        const response = await fetch(url, {
          headers: { 'Authorization': jiraAuthHeader, 'Accept': 'application/json' }
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(`Jira API ${response.status} on page ${pageNum}: ${text.substring(0, 200)}`);
        }

        let data: any;
        try {
          data = await response.json();
        } catch (e) {
          throw new Error(`Jira returned invalid JSON on page ${pageNum} (startAt=${startAt})`);
        }

        const batch: any[] = data.issues || [];
        issues.push(...batch);
        totalIssues = data.total || totalIssues;
        console.log(`[${jql.substring(0, 50)}] page ${pageNum}: +${batch.length} = ${issues.length} / ${data.total}`);

        if (batch.length < maxResults) break; // reached last page
        startAt += maxResults;
      }

      return issues.slice(0, cap);
    };

    // Pass 1: EDGE tickets (cap 1500)
    console.log('Pass 1: Fetching EDGE tickets...');
    const edgeIssues = await fetchPaginatedIssues(
      `project = EDGE AND updated >= "-365d" ORDER BY updated DESC`, 1500
    );
    console.log(`Pass 1 complete: ${edgeIssues.length} EDGE tickets`);

    // Pass 2: SiteLink tickets (cap 1500)
    console.log('Pass 2: Fetching SiteLink tickets...');
    let slIssues: any[] = [];
    try {
      slIssues = await fetchPaginatedIssues(
        `project = SL AND updated >= "-365d" ORDER BY updated DESC`, 1500
      );
      console.log(`Pass 2 complete: ${slIssues.length} SiteLink tickets`);
    } catch (err) {
      console.error(`Pass 2 (SiteLink) failed (continuing):`, err instanceof Error ? err.message : err);
    }

    // Pass 3: Marine projects (cap 500)
    const MARINE_PROJECTS = ['NBK', 'MREQ', 'MDEV', 'EASY', 'TOPS', 'BZD', 'ESST'];
    const marineJql = MARINE_PROJECTS.map(p => `"${p}"`).join(', ');
    let marineIssues: any[] = [];
    try {
      marineIssues = await fetchPaginatedIssues(
        `project in (${marineJql}) AND updated >= "-365d" ORDER BY updated DESC`, 500
      );
      console.log(`Pass 3 complete: ${marineIssues.length} marine tickets`);
    } catch (err) {
      console.error(`Pass 3 (marine) failed (continuing):`, err instanceof Error ? err.message : err);
    }

    // Pass 4: Remaining storage-relevant projects (cap 500)
    const OTHER_PROJECTS = ['WEB', 'BUGS', 'SLT', 'PAY', 'CRM', 'DATA', 'SF', 'STOR', 'SAC', 'CPBUG', 'WA', 'PAYEXT', 'POL', 'SFT'];
    const projectsJql = OTHER_PROJECTS.map(p => `"${p}"`).join(', ');
    let otherIssues: any[] = [];
    try {
      otherIssues = await fetchPaginatedIssues(
        `project in (${projectsJql}) AND updated >= "-365d" ORDER BY updated DESC`, 500
      );
      console.log(`Pass 4 complete: ${otherIssues.length} other tickets`);
    } catch (err) {
      console.error(`Pass 4 failed (continuing):`, err instanceof Error ? err.message : err);
    }

    allIssues = [...edgeIssues, ...slIssues, ...marineIssues, ...otherIssues];
    console.log(`Total: ${allIssues.length} (${edgeIssues.length} EDGE + ${slIssues.length} SiteLink + ${marineIssues.length} marine + ${otherIssues.length} other)`);

    console.log(`\n=== Pagination Complete ===`);
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

    // Upsert issues (no .select() - large payloads cause incomplete returns)
    const { error: insertError } = await supabaseAdmin
      .from('jira_issues')
      .upsert(uniqueJiraIssues, {
        onConflict: 'user_id,jira_key',
        ignoreDuplicates: false
      });

    if (insertError) {
      console.error('Insert error:', insertError);
      return NextResponse.json({
        error: 'Failed to store Jira issues',
        details: insertError.message
      }, { status: 500 });
    }

    // Fetch the DB rows for all upserted keys to get their IDs for link creation
    // Must chunk to avoid Supabase's 1000-item .in() limit
    const jiraKeys = uniqueJiraIssues.map(i => i.jira_key);
    const CHUNK_SIZE = 500;
    const insertedIssues: any[] = [];
    for (let i = 0; i < jiraKeys.length; i += CHUNK_SIZE) {
      const chunk = jiraKeys.slice(i, i + CHUNK_SIZE);
      const { data: batch } = await supabaseAdmin
        .from('jira_issues')
        .select('id, jira_key, metadata, labels, components, summary, description')
        .eq('user_id', userId)
        .in('jira_key', chunk);
      if (batch) insertedIssues.push(...batch);
    }

    console.log(`Stored ${uniqueJiraIssues.length} issues, fetched ${insertedIssues.length} back from DB for linking`);

    // Step 1: Build CaseNumber → AccountID map directly from raw_inputs
    // Query raw_inputs directly (not via friction_cards) to catch ALL synced cases,
    // not just ones that have been processed into friction_cards
    const { data: allSalesforceCases } = await supabaseAdmin
      .from('raw_inputs')
      .select('source_id, account_id')
      .eq('user_id', userId)
      .eq('source_type', 'salesforce')
      .not('source_id', 'is', null);

    // Build map: Salesforce CaseNumber → Account ID
    const caseIdToAccountId = new Map<string, string>();

    allSalesforceCases?.forEach((row: any) => {
      const caseId = row.source_id;
      const accountId = row.account_id;
      if (caseId && accountId) {
        caseIdToAccountId.set(caseId, accountId);
      }
    });

    console.log(`Built case mapping: ${caseIdToAccountId.size} total Salesforce Cases`);

    // Step 2: Get friction cards for theme linking
    const { data: frictionCardsWithCases } = await supabaseAdmin
      .from('friction_cards')
      .select(`
        id,
        theme_key,
        account_id,
        raw_input:raw_inputs!inner(source_id)
      `)
      .eq('user_id', userId)
      .eq('is_friction', true)
      .not('raw_inputs.source_id', 'is', null);

    // Build map: Salesforce Case ID → Friction Themes (only for friction cases)
    const caseIdToThemes = new Map<string, Set<string>>();

    frictionCardsWithCases?.forEach((card: any) => {
      const caseId = card.raw_input?.source_id;
      if (caseId) {
        if (!caseIdToThemes.has(caseId)) {
          caseIdToThemes.set(caseId, new Set());
        }
        caseIdToThemes.get(caseId)!.add(card.theme_key);
      }
    });

    console.log(`  - ${caseIdToThemes.size} cases have friction themes`);

    // Also get actual themes for fallback keyword matching
    const actualThemes = Array.from(new Set(frictionCardsWithCases?.map((c: any) => c.theme_key) || []));
    console.log(`Found ${actualThemes.length} actual friction themes`);

    // Step 3: Load client name aliases table for Strategy 2 (client_field)
    const { data: clientAliasRows } = await supabaseAdmin
      .from('client_name_aliases')
      .select('jira_short_name, sf_account_name')
      .not('sf_account_name', 'is', null); // Only rows with a known mapping

    // Build lookup: lowercase short name → sf_account_name
    const clientAliasMap = new Map<string, string>();
    clientAliasRows?.forEach((row: any) => {
      clientAliasMap.set(row.jira_short_name.toLowerCase(), row.sf_account_name);
    });
    console.log(`Loaded ${clientAliasMap.size} client name aliases`);

    // Batch link creation for better performance
    const themeLinksToCreate: any[] = [];
    const accountLinksToCreate: any[] = [];
    let directLinksCount = 0;
    let keywordLinksCount = 0;

    // Get all active accounts for alias-based name lookups
    const { data: accounts } = await supabaseAdmin
      .from('accounts')
      .select('id, name, products')
      .eq('user_id', userId)
      .eq('status', 'active')
      .limit(5000);
    console.log(`Loaded ${accounts?.length || 0} active accounts for matching`);

    // Collect all links to create (batch processing)
    for (const issue of insertedIssues || []) {
      // STRATEGY 1 (BEST): Direct link via Salesforce Case ID
      // Check if this Jira ticket has a Salesforce Case ID in custom fields
      const customFields = issue.metadata?.custom_fields || {};
      const salesforceCaseIds: string[] = [];

      // STRATEGY 2 (FALLBACK): Client field matching via alias table
      // Only used when no salesforce_case link exists (checked later via hasDirectLink flag).
      // Extract customfield_12184 which contains semicolon-delimited short names like "10 Federal;Spartan"
      const clientFieldValue = customFields['customfield_12184'];
      const clientFieldLinks: any[] = [];
      if (clientFieldValue && typeof clientFieldValue === 'string') {
        const clientNames = clientFieldValue
          .split(/[;,]/)
          .map((name: string) => name.trim())
          .filter((name: string) => name.length > 0);

        if (clientNames.length > 0) {
          for (const clientName of clientNames) {
            // Use alias table lookup — exact match only (no fuzzy text scanning)
            const sfAccountName = clientAliasMap.get(clientName.toLowerCase());
            if (!sfAccountName) continue;

            // Find all accounts with this exact SF name (duplicates exist for CORP parents)
            const matchingAccounts = accounts?.filter(acc =>
              acc.name.toLowerCase() === sfAccountName.toLowerCase()
            );

            if (!matchingAccounts || matchingAccounts.length === 0) continue;

            // Use first match — alias table is manually curated so no product validation needed
            const bestMatch = matchingAccounts[0];

            clientFieldLinks.push({
              user_id: userId,
              account_id: bestMatch.id,
              jira_issue_id: issue.id,
              match_type: 'client_field',
              match_confidence: 0.85
            });
          }
        }
      }

      // Look for Salesforce Case ID in ALL custom fields by checking the VALUE
      // Don't filter by field name - just scan all field values for case numbers
      for (const [, value] of Object.entries(customFields)) {
        if (!value) continue;

        const fieldValue = value.toString();

        // Check if VALUE contains 8-digit case numbers (format: 03717747)
        const caseMatches = fieldValue.match(/\b\d{8}\b/g);
        if (caseMatches) {
          salesforceCaseIds.push(...caseMatches);
        }

        // Also check for 15/18-char Salesforce IDs (format: 500XXXXXXXXXXXXX)
        const longIdMatch = fieldValue.match(/\b500[a-zA-Z0-9]{12,15}\b/g);
        if (longIdMatch) {
          salesforceCaseIds.push(...longIdMatch);
        }
      }

      // Deduplicate case IDs
      const uniqueCaseIds = Array.from(new Set(salesforceCaseIds));
      salesforceCaseIds.length = 0;
      salesforceCaseIds.push(...uniqueCaseIds);

      // STRATEGY 1: Direct links via Salesforce Case IDs (confidence 1.0)
      let hasDirectLink = false;
      if (salesforceCaseIds.length > 0) {
        const allThemes = new Set<string>();
        const allAccountIds = new Set<string>();

        for (const caseId of salesforceCaseIds) {
          const accountId = caseIdToAccountId.get(caseId);

          if (accountId) {
            hasDirectLink = true;
            allAccountIds.add(accountId);

            accountLinksToCreate.push({
              user_id: userId,
              account_id: accountId,
              jira_issue_id: issue.id,
              match_type: 'salesforce_case',
              match_confidence: 1.0
            });

            // Also create theme links if this case has friction themes
            if (caseIdToThemes.has(caseId)) {
              Array.from(caseIdToThemes.get(caseId)!).forEach(themeKey => {
                allThemes.add(themeKey);
                themeLinksToCreate.push({
                  user_id: userId,
                  jira_issue_id: issue.id,
                  theme_key: themeKey,
                  match_type: 'keyword',
                  match_confidence: 1.0
                });
              });
            }
          }
        }

        if (hasDirectLink) {
          directLinksCount++;
        }
      }

      // STRATEGY 2: Client field alias lookup — ONLY when no case link found
      if (!hasDirectLink && clientFieldLinks.length > 0) {
        accountLinksToCreate.push(...clientFieldLinks);
        keywordLinksCount += clientFieldLinks.length;
      }

      // Theme keyword matching (for "By Theme" view) — always run regardless of account links
      const keywordThemeLinks = getThemeLinksFromActualThemes(userId, issue, actualThemes);
      themeLinksToCreate.push(...keywordThemeLinks);
    }

    console.log(`Link strategies: ${directLinksCount} direct (via Case ID), ${keywordLinksCount} keyword-based`);

    // Batch insert theme links
    let linksCreated = 0;
    if (themeLinksToCreate.length > 0) {
      console.log(`Attempting to create ${themeLinksToCreate.length} theme links...`);
      const { data: createdThemeLinks, error: linkError } = await supabaseAdmin
        .from('theme_jira_links')
        .upsert(themeLinksToCreate, { onConflict: 'jira_issue_id,theme_key', ignoreDuplicates: true })
        .select();

      if (linkError) {
        console.error('❌ Failed to create theme links:', linkError);
      } else {
        linksCreated = createdThemeLinks?.length || 0;
        console.log(`✅ Created ${linksCreated} theme links successfully`);
      }
    }

    // Batch insert account links (client_field and salesforce_case strategies only)
    let accountLinksCreated = 0;
    console.log(`Attempting to upsert ${accountLinksToCreate.length} account links...`);
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
        match_type: 'keyword',
        match_confidence: 0.8
      });
    } else if (matchCount === 1 && themeWords.length === 1) {
      // Single word theme that matches - medium confidence
      links.push({
        user_id: userId,
        jira_issue_id: issue.id,
        theme_key: themeKey,
        match_type: 'keyword',
        match_confidence: 0.6
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
            match_type: 'label',
            match_confidence: 1.0
          });
          break;
        }
      }
    }
  }

  return links;
}

