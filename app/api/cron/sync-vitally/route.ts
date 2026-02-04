import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getDecryptedToken } from '@/lib/encryption';

export const maxDuration = 300;

export async function GET(request: Request) {
  try {
    // Verify cron secret to ensure only Vercel can call this
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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

    // Get all active Vitally integrations
    const { data: integrations, error: intError } = await supabaseAdmin
      .from('integrations')
      .select('*')
      .eq('integration_type', 'vitally')
      .eq('status', 'active');

    if (intError || !integrations || integrations.length === 0) {
      console.log('No active Vitally integrations found');
      return NextResponse.json({
        success: true,
        message: 'No active Vitally integrations',
        synced: 0
      });
    }

    console.log(`Found ${integrations.length} active Vitally integration(s)`);
    const results = [];

    // Sync each integration
    for (const integration of integrations) {
      try {
        console.log(`Syncing Vitally for user ${integration.user_id}...`);

        // Get decrypted API key
        const tokenData = await getDecryptedToken(supabaseAdmin, integration.id);
        if (!tokenData?.access_token) {
          console.error(`No API key found for integration ${integration.id}`);
          results.push({
            user_id: integration.user_id,
            success: false,
            error: 'No API key found'
          });
          continue;
        }

        const apiKey = tokenData.access_token;
        const authHeader = `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`;

        // Fetch ALL accounts from Vitally with pagination
        const vitallyAccounts: any[] = [];
        let nextCursor: string | null = null;
        let pageCount = 0;

        while (pageCount < 100) {
          pageCount++;
          const url = nextCursor
            ? `${integration.instance_url}/resources/accounts?limit=100&from=${encodeURIComponent(nextCursor)}`
            : `${integration.instance_url}/resources/accounts?limit=100`;

          const pageResponse = await fetch(url, {
            method: 'GET',
            headers: {
              'Authorization': authHeader,
              'Content-Type': 'application/json',
            },
          });

          if (!pageResponse.ok) {
            const errorText = await pageResponse.text();
            console.error('Vitally API error:', errorText);
            throw new Error(`Vitally API error: ${errorText}`);
          }

          const pageData: any = await pageResponse.json();
          const pageResults = pageData.results || [];
          vitallyAccounts.push(...pageResults);

          if (pageData.atEnd || !pageData.next) {
            break;
          }
          nextCursor = pageData.next;
        }

        console.log(`Fetched ${vitallyAccounts.length} Vitally accounts`);

        if (vitallyAccounts.length === 0) {
          results.push({
            user_id: integration.user_id,
            success: true,
            synced: 0,
            message: 'No accounts found'
          });
          continue;
        }

        // Get all existing accounts for this user
        const { data: existingAccounts } = await supabaseAdmin
          .from('accounts')
          .select('id, salesforce_id, name')
          .eq('user_id', integration.user_id);

        // Create lookup maps
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
        const vitallyRecords: any[] = [];
        const accountUpdates: Map<string, any> = new Map();

        // Process accounts
        for (const vAccount of vitallyAccounts) {
          const vitallyId = vAccount.id;
          const accountName = vAccount.name || 'Unknown';

          const salesforceId = vAccount.accountId ||
                             vAccount.externalId ||
                             vAccount.salesforceId ||
                             vAccount.salesforceAccountId ||
                             vAccount.traits?.salesforceId ||
                             vAccount.traits?.salesforceAccountId ||
                             null;

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

          // Find matching account
          let matchedAccount = null;
          if (salesforceId) {
            matchedAccount = accountsBySalesforceId.get(salesforceId);
          }
          if (!matchedAccount) {
            matchedAccount = accountsByName.get(accountName.toLowerCase().trim());
          }
          if (matchedAccount) {
            matched++;
          }

          vitallyRecords.push({
            user_id: integration.user_id,
            vitally_account_id: vitallyId,
            account_id: matchedAccount?.id || null,
            salesforce_account_id: salesforceId,
            account_name: accountName,
            health_score: healthScore,
            nps_score: npsScore,
            status: status,
            mrr: mrr,
            traits: vAccount,
            last_activity_at: lastActivityAt,
            synced_at: now,
            updated_at: now,
          });

          if (matchedAccount) {
            accountUpdates.set(matchedAccount.id, {
              id: matchedAccount.id,
              vitally_health_score: healthScore,
              vitally_nps_score: npsScore,
              vitally_status: status,
              vitally_last_activity_at: lastActivityAt,
            });
          }
        }

        // Batch insert vitally_accounts
        const { error: vitallyError } = await supabaseAdmin
          .from('vitally_accounts')
          .upsert(vitallyRecords, {
            onConflict: 'user_id,vitally_account_id'
          });

        if (vitallyError) {
          console.error('Error storing Vitally accounts:', vitallyError);
          throw vitallyError;
        }

        // Batch update accounts
        if (accountUpdates.size > 0) {
          const updateRecords = Array.from(accountUpdates.values());
          await supabaseAdmin
            .from('accounts')
            .upsert(updateRecords, {
              onConflict: 'id'
            });
        }

        // Update last_synced_at
        await supabaseAdmin
          .from('integrations')
          .update({ last_synced_at: now })
          .eq('id', integration.id);

        results.push({
          user_id: integration.user_id,
          success: true,
          synced: vitallyRecords.length,
          matched: matched,
          total: vitallyAccounts.length
        });

        console.log(`Successfully synced ${vitallyRecords.length} accounts for user ${integration.user_id}`);

      } catch (err) {
        console.error(`Error syncing integration ${integration.id}:`, err);
        results.push({
          user_id: integration.user_id,
          success: false,
          error: err instanceof Error ? err.message : 'Unknown error'
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: `Synced ${integrations.length} Vitally integration(s)`,
      results
    });

  } catch (error) {
    console.error('Cron sync error:', error);
    return NextResponse.json({
      error: 'Cron sync failed',
      details: error instanceof Error ? error.message : 'Unknown',
    }, { status: 500 });
  }
}
