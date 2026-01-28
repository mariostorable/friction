import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
  const debugInfo: any = {};
  
  try {
    const supabase = createRouteHandlerClient({ cookies });
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

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

    const { data: tokens } = await supabaseAdmin
      .from('oauth_tokens')
      .select('*')
      .eq('integration_id', integration.id)
      .single();

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

      // Update tokens in database
      await supabaseAdmin
        .from('oauth_tokens')
        .update({
          access_token: refreshData.access_token,
          expires_at: new Date(Date.now() + 7200000).toISOString(), // 2 hours from now
        })
        .eq('id', tokens.id);

      return refreshData.access_token;
    };

    // Helper function to fetch accounts from Salesforce
    const fetchSalesforceAccounts = async (accessToken: string) => {
      return await fetch(
        `${integration.instance_url}/services/data/v59.0/query?q=SELECT+Id,Name,MRR_MVR__c,Industry,Type,Owner.Name,CreatedDate,Current_FMS__c,Online_Listing_Service__c,Current_Website_Provider__c,Current_Payment_Provider__c,Insurance_Company__c,Gate_System__c,LevelOfService__c,Managed_Account__c,VitallyClient_Success_Tier__c,Locations__c,Corp_Code__c,SE_Company_UUID__c,SpareFoot_Client_Key__c,Insurance_ZCRM_ID__c,(SELECT+Id+FROM+Assets)+FROM+Account+WHERE+ParentId=null+AND+MRR_MVR__c>0+ORDER+BY+MRR_MVR__c+DESC+LIMIT+200`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );
    };

    // Try to fetch accounts, refresh token if expired
    let accountsResponse = await fetchSalesforceAccounts(tokens.access_token);

    // If 401 Unauthorized, refresh token and retry
    if (accountsResponse.status === 401) {
      console.log('Access token expired, refreshing...');
      try {
        const newAccessToken = await refreshSalesforceToken();
        accountsResponse = await fetchSalesforceAccounts(newAccessToken);
      } catch (refreshError) {
        return NextResponse.json({
          error: 'Salesforce token expired',
          details: refreshError instanceof Error ? refreshError.message : 'Please reconnect Salesforce from Settings',
          needsReconnect: true
        }, { status: 401 });
      }
    }

    if (!accountsResponse.ok) {
      const errorText = await accountsResponse.text();
      return NextResponse.json({ error: 'Failed to fetch accounts', details: errorText }, { status: 500 });
    }

    const accountsData = await accountsResponse.json();

    if (!accountsData.records || accountsData.records.length === 0) {
      return NextResponse.json({ message: 'No accounts found', synced: 0 });
    }

    // Don't delete accounts - upsert to preserve friction data
    const accountsToUpsert = accountsData.records.map((sfAccount: any) => {
      const products = [];

      // Product detection based on specific ID fields (most reliable)
      if (sfAccount.Corp_Code__c) products.push('Software (SiteLink)');
      if (sfAccount.SE_Company_UUID__c) products.push('Software (EDGE)');
      if (sfAccount.SpareFoot_Client_Key__c) products.push('Marketplace (SpareFoot)');
      if (sfAccount.Insurance_ZCRM_ID__c) products.push('Insurance');

      // Also check legacy fields to catch additional products
      // (Don't skip if ID fields already found - accounts can have multiple products)
      if (sfAccount.Current_FMS__c && !products.some(p => p.includes(sfAccount.Current_FMS__c))) {
        products.push(`Software (${sfAccount.Current_FMS__c})`);
      }
      if (sfAccount.Online_Listing_Service__c && !products.some(p => p.includes('Marketplace'))) {
        products.push(`Marketplace (${sfAccount.Online_Listing_Service__c})`);
      }
      if (sfAccount.Current_Website_Provider__c) {
        products.push(`Website (${sfAccount.Current_Website_Provider__c})`);
      }
      if (sfAccount.Current_Payment_Provider__c) {
        products.push(`Payments (${sfAccount.Current_Payment_Provider__c})`);
      }
      if (sfAccount.Insurance_Company__c && !products.includes('Insurance')) {
        products.push(`Insurance (${sfAccount.Insurance_Company__c})`);
      }
      if (sfAccount.Gate_System__c) {
        products.push(`Gate (${sfAccount.Gate_System__c})`);
      }

      return {
        user_id: user.id,
        salesforce_id: sfAccount.Id,
        name: sfAccount.Name,
        arr: sfAccount.MRR_MVR__c ? sfAccount.MRR_MVR__c * 12 : null,
        vertical: products.length > 0 ? products.join(', ') : null,
        segment: sfAccount.Type || null,
        owner_name: sfAccount.Owner?.Name || null,
        customer_since: sfAccount.CreatedDate || null,
        facility_count: sfAccount.Locations__c || 0,
        service_level: sfAccount.LevelOfService__c || null,
        managed_account: sfAccount.Managed_Account__c || null,
        cs_segment: sfAccount.VitallyClient_Success_Tier__c || null,
        // Don't set status here - preserve existing status on update, default to 'active' via column default on insert
      };
    });

    // Upsert accounts to update existing and add new ones
    const { data: upsertedAccounts, error: upsertError } = await supabase
      .from('accounts')
      .upsert(accountsToUpsert, {
        onConflict: 'user_id,salesforce_id',
        ignoreDuplicates: false
      })
      .select();

    if (upsertError) {
      return NextResponse.json({ error: 'Failed to store accounts', details: upsertError.message }, { status: 500 });
    }

    await supabase.from('portfolios').delete().eq('user_id', user.id);

    // Get all accounts with vertical field to filter by product (active only)
    const { data: allAccounts } = await supabase
      .from('accounts')
      .select('id, vertical, arr')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .not('arr', 'is', null)
      .order('arr', { ascending: false });

    // Top 25 EDGE Accounts (must have EDGE software)
    const edgeAccounts = allAccounts?.filter(a =>
      a.vertical && a.vertical.includes('EDGE')
    ).slice(0, 25);

    if (edgeAccounts && edgeAccounts.length > 0) {
      await supabase.from('portfolios').insert({
        user_id: user.id,
        name: 'Top 25 EDGE Accounts',
        portfolio_type: 'top_25_edge',
        criteria: { type: 'top_mrr_edge', limit: 25, product: 'EDGE' },
        account_ids: edgeAccounts.map(a => a.id),
      });
    }

    // Top 25 SiteLink Accounts (must have SiteLink software)
    const sitelinkAccounts = allAccounts?.filter(a =>
      a.vertical && a.vertical.includes('SiteLink')
    ).slice(0, 25);

    if (sitelinkAccounts && sitelinkAccounts.length > 0) {
      await supabase.from('portfolios').insert({
        user_id: user.id,
        name: 'Top 25 SiteLink Accounts',
        portfolio_type: 'top_25_sitelink',
        criteria: { type: 'top_mrr_sitelink', limit: 25, product: 'SiteLink' },
        account_ids: sitelinkAccounts.map(a => a.id),
      });
    }

    await supabase.from('integrations').update({ last_synced_at: new Date().toISOString() }).eq('id', integration.id);

    // Trigger friction analysis in the background (fire-and-forget)
    try {
      const protocol = request.headers.get('x-forwarded-proto') || 'https';
      const host = request.headers.get('host') || 'friction-intelligence.vercel.app';
      const analyzeUrl = `${protocol}://${host}/api/cron/analyze-portfolio`;

      console.log('Triggering friction analysis at:', analyzeUrl);

      // Fire and forget - don't wait for completion to avoid timeout
      fetch(analyzeUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${process.env.CRON_SECRET}`
        }
      }).catch(e => console.error('Error triggering analysis:', e));
    } catch (e) {
      console.error('Error running analysis:', e);
    }

    const message = `Synced ${upsertedAccounts?.length || 0} accounts successfully!\n\nFriction analysis is running in the background. Refresh the page in 2-3 minutes to see updated scores with correct dates.`;

    return NextResponse.json({
      success: true,
      synced: upsertedAccounts?.length || 0,
      portfolios: {
        edge: edgeAccounts?.length || 0,
        sitelink: sitelinkAccounts?.length || 0,
      },
      message
    });

  } catch (error) {
    return NextResponse.json({ 
      error: 'Sync failed', 
      details: error instanceof Error ? error.message : 'Unknown'
    }, { status: 500 });
  }
}
