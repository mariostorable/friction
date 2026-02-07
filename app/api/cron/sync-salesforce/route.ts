import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const maxDuration = 300; // 5 minutes

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: Request) {
  try {
    // Verify cron secret for security
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('Starting scheduled Salesforce case sync...');

    // Get all active Salesforce integrations
    const { data: integrations } = await supabaseAdmin
      .from('integrations')
      .select('*')
      .eq('integration_type', 'salesforce')
      .eq('status', 'active');

    if (!integrations || integrations.length === 0) {
      return NextResponse.json({ message: 'No active Salesforce integrations found' });
    }

    const results = [];

    for (const integration of integrations) {
      try {
        console.log(`Processing Salesforce sync for user ${integration.user_id}`);

        // Get all portfolios for this user (top 25 storage + marine)
        const { data: portfolios } = await supabaseAdmin
          .from('portfolios')
          .select('account_ids, portfolio_type')
          .eq('user_id', integration.user_id)
          .in('portfolio_type', ['top_25_edge', 'top_25_marine']);

        if (!portfolios || portfolios.length === 0) {
          console.log(`No portfolios found for user ${integration.user_id}`);
          continue;
        }

        // Collect all unique account IDs from all portfolios
        const accountIds = new Set<string>();
        portfolios.forEach(p => p.account_ids.forEach((id: string) => accountIds.add(id)));

        console.log(`Found ${accountIds.size} accounts to sync for user ${integration.user_id}`);

        let synced = 0;
        let newCases = 0;

        // Sync cases for each account (incremental - only new cases)
        for (const accountId of Array.from(accountIds)) {
          try {
            // The sync-cases endpoint already handles incremental syncing
            // It only pulls cases created since the last sync
            const syncResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/salesforce/sync-cases`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                accountId,
                userId: integration.user_id // Pass user ID for cron auth
              }),
            });

            if (syncResponse.ok) {
              const syncData = await syncResponse.json();
              synced++;
              newCases += syncData.synced || 0;
              console.log(`✓ Synced ${syncData.synced || 0} new cases for account ${accountId}`);
            } else {
              console.error(`✗ Failed to sync account ${accountId}:`, await syncResponse.text());
            }
          } catch (accountError) {
            console.error(`Error syncing account ${accountId}:`, accountError);
          }
        }

        // Update last_synced_at timestamp
        await supabaseAdmin
          .from('integrations')
          .update({ last_synced_at: new Date().toISOString() })
          .eq('id', integration.id);

        results.push({
          user_id: integration.user_id,
          success: true,
          accounts_synced: synced,
          new_cases: newCases,
          total_accounts: accountIds.size,
        });

        console.log(`Completed sync for user ${integration.user_id}: ${synced}/${accountIds.size} accounts, ${newCases} new cases`);
      } catch (error) {
        console.error(`Failed to sync for user ${integration.user_id}:`, error);
        results.push({
          user_id: integration.user_id,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return NextResponse.json({
      message: 'Scheduled Salesforce case sync completed',
      results,
    });
  } catch (error) {
    console.error('Cron sync error:', error);
    return NextResponse.json(
      {
        error: 'Sync failed',
        details: error instanceof Error ? error.message : 'Unknown',
      },
      { status: 500 }
    );
  }
}
