import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { getDecryptedToken } from '@/lib/encryption';

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
    let nextUrl: string | null = `${integration.instance_url}/resources/accounts`;
    let pageCount = 0;

    console.log('Starting Vitally account fetch with pagination...');

    while (nextUrl && pageCount < 100) { // Safety limit of 100 pages
      pageCount++;
      console.log(`Fetching page ${pageCount} from: ${nextUrl}`);

      const pageResponse: Response = await fetch(nextUrl, {
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

      // Check if there are more pages
      if (pageData.atEnd || !pageData.next) {
        console.log('Reached end of results');
        nextUrl = null;
      } else {
        // Vitally returns the full URL in the 'next' field
        nextUrl = pageData.next;
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
      .select('id, salesforce_account_id, name')
      .eq('user_id', user.id);

    // Create a map for quick lookup by Salesforce ID
    const accountsBySalesforceId = new Map();
    const accountsByName = new Map();
    existingAccounts?.forEach(acc => {
      if (acc.salesforce_account_id) {
        accountsBySalesforceId.set(acc.salesforce_account_id, acc);
      }
      accountsByName.set(acc.name.toLowerCase().trim(), acc);
    });

    let matched = 0;
    let stored = 0;

    // Process each Vitally account
    console.log(`Processing ${vitallyAccounts.length} Vitally accounts...`);
    for (const vAccount of vitallyAccounts) {
      try {
        const vitallyId = vAccount.id;
        const accountName = vAccount.name || 'Unknown';
        console.log(`Processing account: ${accountName} (${vitallyId})`);

        // Try multiple possible field names for Salesforce ID
        const salesforceId = vAccount.accountId ||
                           vAccount.externalId ||
                           vAccount.salesforceId ||
                           vAccount.salesforceAccountId ||
                           vAccount.traits?.salesforceId ||
                           vAccount.traits?.salesforceAccountId ||
                           null;

        // Extract health metrics (try different possible structures)
        const healthScore = vAccount.health?.score ||
                          vAccount.healthScore ||
                          vAccount.traits?.health?.score ||
                          null;
        const npsScore = vAccount.nps?.score ||
                       vAccount.npsScore ||
                       vAccount.traits?.nps ||
                       null;
        const status = vAccount.status || vAccount.traits?.status || null;
        const mrr = vAccount.mrr || vAccount.traits?.mrr || null;
        const lastActivityAt = vAccount.lastActivityAt ||
                              vAccount.lastActivity ||
                              vAccount.traits?.lastActivityAt ||
                              null;

        // Try to find matching account
        let matchedAccount = null;
        if (salesforceId) {
          matchedAccount = accountsBySalesforceId.get(salesforceId);
          if (matchedAccount) matched++;
        }
        if (!matchedAccount) {
          matchedAccount = accountsByName.get(accountName.toLowerCase().trim());
          if (matchedAccount) matched++;
        }

        // Store in vitally_accounts table with ALL Vitally data
        console.log(`Attempting to store account ${accountName} with health_score: ${healthScore}`);
        const { error: vitallyError } = await supabaseAdmin
          .from('vitally_accounts')
          .upsert({
            user_id: user.id,
            vitally_account_id: vitallyId,
            account_id: matchedAccount?.id || null,
            salesforce_account_id: salesforceId,
            account_name: accountName,
            health_score: healthScore,
            nps_score: npsScore,
            status: status,
            mrr: mrr,
            traits: vAccount, // Store the ENTIRE Vitally account object for analysis
            last_activity_at: lastActivityAt,
            synced_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }, {
            onConflict: 'user_id,vitally_account_id'
          });

        if (vitallyError) {
          console.error(`Error storing Vitally account ${vitallyId}:`, JSON.stringify(vitallyError));
          continue;
        }

        console.log(`Successfully stored account ${accountName}`);
        stored++;

        // Update the main accounts table with Vitally data if matched
        if (matchedAccount) {
          await supabaseAdmin
            .from('accounts')
            .update({
              vitally_health_score: healthScore,
              vitally_nps_score: npsScore,
              vitally_status: status,
              vitally_last_activity_at: lastActivityAt,
            })
            .eq('id', matchedAccount.id);
        }
      } catch (err) {
        console.error('Error processing Vitally account:', err);
        continue;
      }
    }

    console.log(`Stored ${stored} Vitally accounts, matched ${matched} to existing accounts`);

    return NextResponse.json({
      success: true,
      synced: stored,
      matched: matched,
      total: vitallyAccounts.length,
      message: `Synced ${stored} of ${vitallyAccounts.length} Vitally accounts${matched > 0 ? `, matched ${matched} to existing Salesforce accounts` : ''}`,
    });

  } catch (error) {
    console.error('Vitally sync error:', error);
    return NextResponse.json({
      error: 'Vitally sync failed',
      details: error instanceof Error ? error.message : 'Unknown',
    }, { status: 500 });
  }
}
