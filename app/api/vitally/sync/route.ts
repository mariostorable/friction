import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { getDecryptedToken } from '@/lib/encryption';

// Increase timeout for large Vitally syncs (requires Vercel Pro)
export const maxDuration = 300; // 5 minutes

export async function POST() {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    // Get authenticated user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get Vitally integration
    const { data: integration, error: integrationError } = await supabase
      .from('integrations')
      .select('*')
      .eq('user_id', user.id)
      .eq('integration_type', 'vitally')
      .eq('status', 'active')
      .single();

    if (integrationError || !integration) {
      return NextResponse.json({ error: 'Vitally not connected' }, { status: 400 });
    }

    // Get admin client to fetch encrypted tokens
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

    // Get decrypted API key from oauth_tokens table
    const tokenData = await getDecryptedToken(supabaseAdmin, integration.id);
    if (!tokenData?.access_token) {
      return NextResponse.json({ error: 'Vitally credentials not found' }, { status: 400 });
    }

    // Update last_synced_at at the START
    await supabaseAdmin
      .from('integrations')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('id', integration.id);

    // Build Basic Auth header
    // Vitally uses Basic auth with API key as username and empty password (colon at the end)
    const apiKey = tokenData.access_token;
    const authHeader = `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`;

    // Fetch ALL accounts from Vitally with pagination
    const vitallyAccounts: any[] = [];
    let nextCursor: string | null = null;
    let pageCount = 0;

    console.log('Starting Vitally account fetch (limited to 100 accounts)...');

    while (pageCount < 100 && vitallyAccounts.length < 100) { // Stop after 100 accounts
      pageCount++;

      // Build URL with cursor if we have one, limit to 100 per page
      const url = nextCursor
        ? `${integration.instance_url}/resources/accounts?limit=100&from=${encodeURIComponent(nextCursor)}`
        : `${integration.instance_url}/resources/accounts?limit=100`;

      console.log(`Fetching page ${pageCount} from: ${url}`);

      const pageResponse: Response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
        },
      });

      if (!pageResponse.ok) {
        const errorText = await pageResponse.text();
        console.error('Vitally API error:', errorText);
        return NextResponse.json({
          error: 'Vitally API request failed',
          details: errorText,
        }, { status: pageResponse.status });
      }

      const pageData: any = await pageResponse.json();
      const pageResults = pageData.results || [];
      vitallyAccounts.push(...pageResults);

      console.log(`Page ${pageCount}: fetched ${pageResults.length} accounts. Total so far: ${vitallyAccounts.length}`);

      // Stop if we've reached 100 accounts
      if (vitallyAccounts.length >= 100) {
        console.log('Reached 100 account limit, stopping pagination');
        break;
      }

      // Check if there are more pages
      if (pageData.atEnd || !pageData.next) {
        console.log('Reached end of results');
        break;
      } else {
        // Vitally returns a cursor token in the 'next' field
        nextCursor = pageData.next;
      }
    }

    console.log(`Finished fetching. Total accounts: ${vitallyAccounts.length} across ${pageCount} pages`);

    if (vitallyAccounts.length === 0) {
      console.log('No accounts found in Vitally');
      return NextResponse.json({
        success: true,
        synced: 0,
        message: 'No accounts found in Vitally'
      });
    }

    // Get all existing accounts for this user to match against
    const { data: existingAccounts } = await supabaseAdmin
      .from('accounts')
      .select('id, salesforce_id, name')
      .eq('user_id', user.id);

    // Create a map for quick lookup by Salesforce ID
    const accountsBySalesforceId = new Map();
    const accountsByName = new Map();
    existingAccounts?.forEach(acc => {
      if (acc.salesforce_id) {
        accountsBySalesforceId.set(acc.salesforce_id, acc);
      }
      accountsByName.set(acc.name.toLowerCase().trim(), acc);
    });

    let matched = 0;
    const now = new Date().toISOString();

    // Process each Vitally account and prepare batch data
    console.log(`Processing ${vitallyAccounts.length} Vitally accounts...`);

    // First pass: Group accounts by organizationId
    const accountsByOrg = new Map<string, any[]>();

    for (const vAccount of vitallyAccounts) {
      // Group by organizationId - this is how Vitally groups facilities under a parent org
      const orgId = vAccount.organizationId || vAccount.id; // Fall back to account ID if no org

      if (!accountsByOrg.has(orgId)) {
        accountsByOrg.set(orgId, []);
      }
      accountsByOrg.get(orgId)!.push(vAccount);
    }

    console.log(`Found ${accountsByOrg.size} organization groups from ${vitallyAccounts.length} accounts`);

    const vitallyRecords: any[] = [];
    const accountUpdates: Map<string, any> = new Map();

    // Process each organization group
    for (const [orgId, childAccounts] of Array.from(accountsByOrg.entries())) {
      try {
        // Use the first account to get organization-level data
        const primaryAccount = childAccounts[0];
        const vitallyId = primaryAccount.id;

        // Extract the corporate/parent account name from SFDC traits
        // Primary source: dL_Product_s_Corporate_Name__c contains the actual corporate name (e.g., "William Warren Group")
        // Fallback: extract prefix from facility name (e.g., "SROA - Greenville" -> "SROA")
        let accountName = primaryAccount.traits?.['sfdc.dL_Product_s_Corporate_Name__c'] ||
                         primaryAccount.name ||
                         'Unknown';

        // If no corporate name field and multiple facilities, extract the common parent name from facility names
        // e.g., "SROA - Greenville" -> "SROA"
        if (!primaryAccount.traits?.['sfdc.dL_Product_s_Corporate_Name__c'] && childAccounts.length > 1) {
          // Try to extract common prefix before the dash
          const commonPrefix = primaryAccount.name.split(' - ')[0] || primaryAccount.name.split('-')[0];
          if (commonPrefix && commonPrefix !== primaryAccount.name) {
            accountName = commonPrefix.trim();
          }
        }

        console.log(`Processing organization: ${accountName} (${childAccounts.length} facilities, orgId: ${orgId})`);

        // Get the parent Salesforce Account ID from Case_Safe_Parent_Account_Id__c
        const salesforceId = primaryAccount.traits?.['sfdc.Case_Safe_Parent_Account_Id__c'] ||
                           primaryAccount.externalId ||
                           null;

        console.log(`  Looking for Salesforce ID: ${salesforceId}`);

        // Aggregate health metrics across child accounts (use average or first non-null)
        let totalHealth = 0;
        let healthCount = 0;
        let totalNps = 0;
        let npsCount = 0;
        let latestStatus: string | null = null;
        let totalMrr = 0;
        let latestActivity: string | null = null;

        childAccounts.forEach((child: any) => {
          const childHealth = child.health?.score || child.healthScore || child.traits?.health?.score;
          if (childHealth !== null && childHealth !== undefined) {
            totalHealth += childHealth;
            healthCount++;
          }

          const childNps = child.nps?.score || child.npsScore || child.traits?.nps;
          if (childNps !== null && childNps !== undefined) {
            totalNps += childNps;
            npsCount++;
          }

          const childMrr = child.mrr || child.traits?.mrr || 0;
          totalMrr += childMrr;

          const childStatus = child.status || child.traits?.status;
          if (childStatus) latestStatus = childStatus;

          const childActivity = child.lastActivityAt || child.lastActivity || child.traits?.lastActivityAt;
          if (childActivity && (!latestActivity || new Date(childActivity) > new Date(latestActivity))) {
            latestActivity = childActivity;
          }
        });

        const healthScore = healthCount > 0 ? totalHealth / healthCount : null;
        const npsScore = npsCount > 0 ? totalNps / npsCount : null;
        const status = latestStatus;
        const mrr = totalMrr;
        const lastActivityAt = latestActivity;

        // Try to find matching account (corporate level)
        let matchedAccount = null;
        if (salesforceId) {
          matchedAccount = accountsBySalesforceId.get(salesforceId);
        }
        if (!matchedAccount) {
          matchedAccount = accountsByName.get(accountName.toLowerCase().trim());
        }

        if (matchedAccount) {
          matched++;
          console.log(`  ✓ Matched "${accountName}" (${childAccounts.length} facilities) to Salesforce: ${matchedAccount.name}`);
        } else {
          console.log(`  ✗ No match found for "${accountName}" (${childAccounts.length} facilities, SF ID: ${salesforceId})`);
        }

        // Prepare vitally_accounts record (store organization with facilities)
        vitallyRecords.push({
          user_id: user.id,
          vitally_account_id: vitallyId,
          account_id: matchedAccount?.id || null,
          salesforce_account_id: salesforceId,
          account_name: accountName,
          health_score: healthScore,
          nps_score: npsScore,
          status: status,
          mrr: mrr,
          traits: {
            ...primaryAccount,
            organizationId: orgId,
            facilities: childAccounts.map((c: any) => ({
              id: c.id,
              name: c.name,
              externalId: c.externalId
            })),
            facilityCount: childAccounts.length
          }, // Store organization with all facility references
          last_activity_at: lastActivityAt,
          synced_at: now,
          updated_at: now,
        });

        // Prepare account update if matched
        if (matchedAccount) {
          accountUpdates.set(matchedAccount.id, {
            id: matchedAccount.id,
            vitally_health_score: healthScore,
            vitally_nps_score: npsScore,
            vitally_status: status,
            vitally_last_activity_at: lastActivityAt,
          });
        }
      } catch (err) {
        console.error('Error processing Vitally account:', err);
        continue;
      }
    }

    console.log(`Prepared ${vitallyRecords.length} Vitally records, ${matched} matched to existing accounts`);

    // Batch insert/update vitally_accounts records in chunks of 50
    const chunkSize = 50;
    for (let i = 0; i < vitallyRecords.length; i += chunkSize) {
      const chunk = vitallyRecords.slice(i, i + chunkSize);
      console.log(`Inserting chunk ${Math.floor(i / chunkSize) + 1}/${Math.ceil(vitallyRecords.length / chunkSize)} (${chunk.length} records)`);

      const { error: vitallyError } = await supabaseAdmin
        .from('vitally_accounts')
        .upsert(chunk, {
          onConflict: 'user_id,vitally_account_id'
        });

      if (vitallyError) {
        console.error('Error batch storing Vitally accounts:', JSON.stringify(vitallyError));
        return NextResponse.json({
          error: 'Failed to store Vitally accounts',
          details: vitallyError.message,
        }, { status: 500 });
      }
    }

    console.log(`Successfully stored ${vitallyRecords.length} Vitally accounts`);

    // Batch update matched accounts with Vitally data in chunks of 50
    if (accountUpdates.size > 0) {
      const updateRecords = Array.from(accountUpdates.values());
      const chunkSize = 50;

      for (let i = 0; i < updateRecords.length; i += chunkSize) {
        const chunk = updateRecords.slice(i, i + chunkSize);
        console.log(`Updating accounts chunk ${Math.floor(i / chunkSize) + 1}/${Math.ceil(updateRecords.length / chunkSize)} (${chunk.length} records)`);

        const { error: accountsError } = await supabaseAdmin
          .from('accounts')
          .upsert(chunk, {
            onConflict: 'id'
          });

        if (accountsError) {
          console.error('Error batch updating accounts:', JSON.stringify(accountsError));
          // Don't fail the whole sync if account updates fail
        }
      }

      console.log(`Successfully updated ${updateRecords.length} accounts with Vitally data`);
    }

    // Fetch notes/conversations for matched organizations
    let totalNotes = 0;
    if (matched > 0) {
      console.log(`Fetching notes for ${matched} matched organizations...`);

      // Process each organization group that was matched
      for (const [, childAccounts] of Array.from(accountsByOrg.entries())) {
        const primaryAccount = childAccounts[0];

        // Determine the corporate account name (same logic as above)
        let accountName = primaryAccount.traits?.['sfdc.dL_Product_s_Corporate_Name__c'] ||
                         primaryAccount.name ||
                         'Unknown';

        if (!primaryAccount.traits?.['sfdc.dL_Product_s_Corporate_Name__c'] && childAccounts.length > 1) {
          const commonPrefix = primaryAccount.name.split(' - ')[0] || primaryAccount.name.split('-')[0];
          if (commonPrefix && commonPrefix !== primaryAccount.name) {
            accountName = commonPrefix.trim();
          }
        }

        // Check if this organization was matched
        const salesforceId = primaryAccount.traits?.['sfdc.Case_Safe_Parent_Account_Id__c'] ||
                           primaryAccount.externalId ||
                           null;

        let matchedAccount = null;
        if (salesforceId) {
          matchedAccount = accountsBySalesforceId.get(salesforceId);
        }
        if (!matchedAccount) {
          matchedAccount = accountsByName.get(accountName.toLowerCase().trim());
        }

        if (!matchedAccount) continue; // Skip unmatched accounts

        console.log(`Fetching notes for organization "${accountName}" (${childAccounts.length} facilities)...`);

        // Fetch notes from ALL facility accounts and associate with parent Salesforce account
        for (const childAccount of childAccounts) {
          const vitallyId = childAccount.id;
          const childName = childAccount.name || 'Unknown';

          try {
            // Fetch notes for this child Vitally account (limited to 10 most recent to avoid timeout)
            const notesUrl = `${integration.instance_url}/resources/notes?accountId=${vitallyId}&limit=10`;
            const notesResponse = await fetch(notesUrl, {
              method: 'GET',
              headers: {
                'Authorization': authHeader,
                'Content-Type': 'application/json',
              },
            });

            if (notesResponse.ok) {
              const notesData = await notesResponse.json();
              const notes = notesData.results || [];

              if (notes.length > 0) {
                console.log(`  Found ${notes.length} notes for facility "${childName}"`);

                // Prepare notes as raw_inputs for analysis - link to corporate Salesforce account
                const noteInputs = notes.map((note: any) => ({
                  user_id: user.id,
                  account_id: matchedAccount.id, // Link to corporate Salesforce account
                  source_type: 'vitally_note',
                  source_id: note.id || `vitally-note-${vitallyId}-${Date.now()}`,
                  source_url: `https://storable.vitally.io/organizations/${vitallyId}`,
                  text_content: `${note.title || 'Vitally Note'}\n\n${note.body || note.content || note.text || ''}\n\nAuthor: ${note.authorName || note.author?.name || 'Unknown'}\nDate: ${note.createdAt || note.createdDate || 'Unknown'}\n\nFacility: ${childName}`,
                  metadata: {
                    note_id: note.id,
                    author: note.authorName || note.author?.name || 'Unknown',
                    created_date: note.createdAt || note.createdDate,
                    vitally_account_id: vitallyId,
                    vitally_facility_name: childName,
                    corporate_account_name: accountName,
                    note_type: note.type || 'note',
                  },
                  processed: false,
                }));

                // Insert notes in batches
                if (noteInputs.length > 0) {
                  const { error: notesError } = await supabaseAdmin
                    .from('raw_inputs')
                    .upsert(noteInputs, {
                      onConflict: 'user_id,source_type,source_id',
                      ignoreDuplicates: false
                    });

                  if (notesError) {
                    console.error(`  Error storing notes for ${childName}:`, notesError.message);
                  } else {
                    totalNotes += noteInputs.length;
                  }
                }
              }
            }
          } catch (noteError) {
            console.error(`  Error fetching notes for facility ${childName}:`, noteError);
            // Continue with other facilities even if one fails
          }
        }
      }

      console.log(`Successfully synced ${totalNotes} notes from Vitally across all facilities`);
    }

    return NextResponse.json({
      success: true,
      synced: vitallyRecords.length,
      matched: matched,
      notes: totalNotes,
      total: vitallyAccounts.length,
      organizations: accountsByOrg.size,
      message: `Synced ${vitallyAccounts.length} Vitally facilities grouped into ${accountsByOrg.size} organizations${matched > 0 ? `, matched ${matched} to Salesforce accounts` : ''}${totalNotes > 0 ? `, pulled ${totalNotes} notes` : ''}`,
    });

  } catch (error) {
    console.error('Vitally sync error:', error);
    return NextResponse.json({
      error: 'Vitally sync failed',
      details: error instanceof Error ? error.message : 'Unknown',
    }, { status: 500 });
  }
}
