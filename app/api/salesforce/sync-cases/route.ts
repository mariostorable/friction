import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { getDecryptedToken, updateEncryptedAccessToken } from '@/lib/encryption';

export const maxDuration = 60; // 60 seconds to handle Salesforce API calls and database operations

export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { accountId } = await request.json();

    if (!accountId) {
      return NextResponse.json({ error: 'Account ID required' }, { status: 400 });
    }

    const { data: account } = await supabase
      .from('accounts')
      .select('salesforce_id, name')
      .eq('id', accountId)
      .eq('user_id', user.id)
      .single();

    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    console.log(`Syncing cases for account: ${account.name} (SF ID: ${account.salesforce_id})`);

    // Check for the most recent case we already have
    const { data: latestCase } = await supabase
      .from('raw_inputs')
      .select('metadata')
      .eq('account_id', accountId)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    const lastSyncDate = latestCase?.metadata?.created_date;
    const isFirstSync = !lastSyncDate;

    console.log('Last sync date:', lastSyncDate || 'Never (first sync)');

    const { data: integration } = await supabase
      .from('integrations')
      .select('*')
      .eq('user_id', user.id)
      .eq('integration_type', 'salesforce')
      .eq('status', 'active')
      .single();

    if (!integration) {
      return NextResponse.json({ error: 'Salesforce not connected' }, { status: 400 });
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

    // Retrieve and decrypt tokens
    let tokens;
    try {
      tokens = await getDecryptedToken(supabaseAdmin, integration.id);
    } catch (error) {
      console.error('Failed to decrypt tokens:', error);
      return NextResponse.json({
        error: 'Failed to access credentials',
        details: 'Please reconnect Salesforce'
      }, { status: 500 });
    }

    if (!tokens) {
      return NextResponse.json({ error: 'No tokens found' }, { status: 400 });
    }

    // Helper function to refresh Salesforce token
    const refreshSalesforceToken = async () => {
      if (!tokens.refresh_token) {
        throw new Error('No refresh token available. Please reconnect Salesforce.');
      }

      console.log('Refreshing Salesforce token...');

      const refreshResponse = await fetch('https://storable.my.salesforce.com/services/oauth2/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: tokens.refresh_token,
          client_id: process.env.SALESFORCE_CLIENT_ID!,
          client_secret: process.env.SALESFORCE_CLIENT_SECRET!,
        }),
      });

      if (!refreshResponse.ok) {
        const errorText = await refreshResponse.text();
        console.error('Token refresh failed:', errorText);
        throw new Error('Failed to refresh Salesforce token. Please reconnect Salesforce.');
      }

      const refreshData = await refreshResponse.json();
      console.log('Token refreshed successfully');

      // Update encrypted token in database
      await updateEncryptedAccessToken(
        supabaseAdmin,
        tokens.id,
        refreshData.access_token,
        new Date(Date.now() + 7200000).toISOString() // 2 hours from now
      );

      return refreshData.access_token;
    };

    // Build query based on whether this is first sync or incremental
    let dateFilter: string;
    if (isFirstSync) {
      dateFilter = 'CreatedDate=LAST_N_DAYS:90';
      console.log('First sync - fetching last 90 days');
    } else {
      // Incremental sync - only get cases created after our last sync
      dateFilter = `CreatedDate>${lastSyncDate}`;
      console.log('Incremental sync - fetching cases since', lastSyncDate);
    }

    // Fetch ALL cases (explicit LIMIT 2000) - Salesforce defaults to 100 records without explicit limit
    const query = `SELECT Id,CaseNumber,Subject,Description,Status,Priority,CreatedDate,ClosedDate,Origin FROM Case WHERE AccountId='${account.salesforce_id}' AND ${dateFilter} ORDER BY CreatedDate DESC LIMIT 2000`;
    const queryUrl = `${integration.instance_url}/services/data/v59.0/query?q=${encodeURIComponent(query)}`;

    console.log('Salesforce Query:', query);

    // Helper function to fetch cases
    const fetchCases = async (accessToken: string) => {
      return await fetch(queryUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });
    };

    // Try to fetch cases, refresh token if expired
    let casesResponse = await fetchCases(tokens.access_token);

    console.log('Salesforce Response Status:', casesResponse.status);

    // If 401 Unauthorized, refresh token and retry
    if (casesResponse.status === 401) {
      console.log('Access token expired, refreshing...');
      try {
        const newAccessToken = await refreshSalesforceToken();
        casesResponse = await fetchCases(newAccessToken);
      } catch (refreshError) {
        return NextResponse.json({
          error: 'Salesforce token expired',
          details: refreshError instanceof Error ? refreshError.message : 'Please reconnect Salesforce from Settings',
          needsReconnect: true
        }, { status: 401 });
      }
    }

    if (!casesResponse.ok) {
      const errorText = await casesResponse.text();
      console.error('Salesforce Error:', errorText);
      return NextResponse.json({ error: 'Failed to fetch cases from Salesforce', details: errorText }, { status: 500 });
    }

    const casesData = await casesResponse.json();
    console.log('Cases returned:', casesData.totalSize || 0);
    console.log('Case records length:', casesData.records?.length || 0);

    if (!casesData.records || casesData.records.length === 0) {
      const message = isFirstSync
        ? `No cases found for ${account.name} in the last 90 days.`
        : `No new cases since last sync (${new Date(lastSyncDate).toLocaleDateString()}).`;

      console.log(message);
      return NextResponse.json({
        success: true,
        synced: 0,
        accountName: account.name,
        message,
        isIncremental: !isFirstSync
      }, { status: 200 });
    }

    // Only delete old data on first sync to start fresh
    if (isFirstSync) {
      console.log('First sync - cleaning up any existing data...');

      // Delete old friction cards
      const { error: cardsDeleteError } = await supabase
        .from('friction_cards')
        .delete()
        .eq('account_id', accountId)
        .eq('user_id', user.id);

      if (cardsDeleteError) {
        console.error('Error deleting old friction_cards:', cardsDeleteError);
      }

      // Delete old raw_inputs
      const { error: inputsDeleteError } = await supabase
        .from('raw_inputs')
        .delete()
        .eq('account_id', accountId)
        .eq('user_id', user.id);

      if (inputsDeleteError) {
        console.error('Error deleting old raw_inputs:', inputsDeleteError);
      }

      console.log('Old data cleaned up successfully');
    } else {
      console.log(`Incremental sync - adding ${casesData.records.length} new cases to existing data`);
    }

    // Log first case to debug Origin field
    if (casesData.records.length > 0) {
      console.log('Sample case data from Salesforce:', {
        CaseNumber: casesData.records[0].CaseNumber,
        Origin: casesData.records[0].Origin,
        allFields: Object.keys(casesData.records[0])
      });
    }

    const rawInputs = casesData.records.map((sfCase: any) => {
      // Handle Origin field - try multiple possible field names
      const origin = sfCase.Origin || sfCase.origin || sfCase.CaseOrigin || 'Unknown';

      return {
        user_id: user.id,
        account_id: accountId,
        source_type: 'salesforce_case',
        source_id: sfCase.Id,
        source_url: `${integration.instance_url}/${sfCase.Id}`,
        text_content: `Case #${sfCase.CaseNumber}: ${sfCase.Subject}\n\n${sfCase.Description || 'No description'}\n\nStatus: ${sfCase.Status}\nPriority: ${sfCase.Priority}\nOrigin: ${origin}`,
        metadata: {
          case_number: sfCase.CaseNumber,
          subject: sfCase.Subject,
          status: sfCase.Status,
          priority: sfCase.Priority,
          origin: origin,
          created_date: sfCase.CreatedDate,
          closed_date: sfCase.ClosedDate,
        },
        processed: false,
      };
    });

    const { data: insertedInputs, error: insertError } = await supabase
      .from('raw_inputs')
      .insert(rawInputs)
      .select();

    if (insertError) {
      console.error('Insert error:', insertError);
      return NextResponse.json({ error: 'Failed to store cases', details: insertError.message }, { status: 500 });
    }

    console.log('Successfully inserted:', insertedInputs?.length);

    const syncType = isFirstSync ? 'Full sync' : 'Incremental sync';
    return NextResponse.json({
      success: true,
      synced: insertedInputs?.length || 0,
      accountName: account.name,
      message: `${syncType}: Added ${insertedInputs?.length} ${isFirstSync ? '' : 'new '}cases for ${account.name}`,
      isIncremental: !isFirstSync
    });

  } catch (error) {
    console.error('Case sync error:', error);
    return NextResponse.json({ 
      error: 'Case sync failed', 
      details: error instanceof Error ? error.message : 'Unknown'
    }, { status: 500 });
  }
}
