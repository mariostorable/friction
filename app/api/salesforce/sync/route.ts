import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { getDecryptedToken, updateEncryptedAccessToken } from '@/lib/encryption';

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

    // Helper function to map Salesforce Type to business unit
    const mapTypeToVertical = (type: string | null): 'storage' | 'marine' | 'rv' | null => {
      if (!type) return null;
      const typeLower = type.toLowerCase();

      if (typeLower.includes('marine') || typeLower.includes('marina')) {
        return 'marine';
      }
      if (typeLower.includes('storage') || typeLower.includes('self storage')) {
        return 'storage';
      }
      if (typeLower.includes('rv') || typeLower.includes('recreational vehicle')) {
        return 'rv';
      }

      // Default to storage if unclear
      return 'storage';
    };

    // Don't delete accounts - upsert to preserve friction data
    const accountsToUpsert = accountsData.records.map((sfAccount: any) => {
      const businessUnit = mapTypeToVertical(sfAccount.Type);
      const products = [];

      // Product detection based on business unit and specific ID fields
      // Storage products
      if (businessUnit === 'storage') {
        if (sfAccount.Corp_Code__c) products.push('Software (SiteLink)');
        if (sfAccount.SE_Company_UUID__c) products.push('Software (EDGE)');
        if (sfAccount.SpareFoot_Client_Key__c) products.push('Marketplace (SpareFoot)');
        if (sfAccount.Insurance_ZCRM_ID__c) products.push('Insurance');

        // Legacy fields for storage
        if (sfAccount.Current_FMS__c && !products.some(p => p.includes(sfAccount.Current_FMS__c))) {
          products.push(`Software (${sfAccount.Current_FMS__c})`);
        }
        if (sfAccount.Online_Listing_Service__c && !products.some(p => p.includes('Marketplace'))) {
          products.push(`Marketplace (${sfAccount.Online_Listing_Service__c})`);
        }
      }

      // Marine products - check Current_FMS__c for Molo or other marine software
      if (businessUnit === 'marine') {
        if (sfAccount.Current_FMS__c) {
          products.push(`Software (${sfAccount.Current_FMS__c})`);
        }
        // Add marine marketplace if they have one
        if (sfAccount.Online_Listing_Service__c) {
          products.push(`Marketplace (${sfAccount.Online_Listing_Service__c})`);
        }
      }

      // Common products across all business units
      if (sfAccount.Insurance_ZCRM_ID__c && !products.includes('Insurance')) {
        products.push('Insurance');
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
        vertical: businessUnit,
        products: products.length > 0 ? products.join(', ') : null,
        segment: sfAccount.Type || null,
        owner_name: sfAccount.Owner?.Name || null,
        customer_since: sfAccount.CreatedDate || null,
        facility_count: sfAccount.Locations__c || 0,
        service_level: sfAccount.LevelOfService__c || null,
        managed_account: sfAccount.Managed_Account__c || null,
        cs_segment: sfAccount.VitallyClient_Success_Tier__c || null,
        metadata: {
          industry: sfAccount.Industry,
          type: sfAccount.Type,
          current_fms: sfAccount.Current_FMS__c
        },
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

    // Get all accounts with products and vertical fields (active only)
    const { data: allAccounts } = await supabase
      .from('accounts')
      .select('id, vertical, products, arr')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .not('arr', 'is', null)
      .order('arr', { ascending: false });

    // Top 25 Storage Accounts (EDGE + SiteLink)
    const storageAccounts = allAccounts?.filter(a =>
      a.vertical === 'storage' && a.products && (a.products.includes('EDGE') || a.products.includes('SiteLink'))
    ).slice(0, 25);

    if (storageAccounts && storageAccounts.length > 0) {
      await supabase.from('portfolios').insert({
        user_id: user.id,
        name: 'Top 25 Storage Accounts',
        portfolio_type: 'top_25_edge', // Keep same type for backwards compatibility
        criteria: { type: 'top_mrr_storage', limit: 25, vertical: 'storage' },
        account_ids: storageAccounts.map(a => a.id),
      });
    }

    // Top 25 Marine Accounts
    const marineAccounts = allAccounts?.filter(a =>
      a.vertical === 'marine'
    ).slice(0, 25);

    if (marineAccounts && marineAccounts.length > 0) {
      await supabase.from('portfolios').insert({
        user_id: user.id,
        name: 'Top 25 Marine Accounts',
        portfolio_type: 'top_25_marine',
        criteria: { type: 'top_mrr_marine', limit: 25, vertical: 'marine' },
        account_ids: marineAccounts.map(a => a.id),
      });
    }

    await supabase.from('integrations').update({ last_synced_at: new Date().toISOString() }).eq('id', integration.id);

    // Trigger friction analysis (wait for it to complete so we can report errors)
    let analysisResult = null;
    let analysisError = null;

    try {
      const protocol = request.headers.get('x-forwarded-proto') || 'https';
      const host = request.headers.get('host') || 'friction-intelligence.vercel.app';
      const analyzeUrl = `${protocol}://${host}/api/cron/analyze-portfolio`;

      console.log('Triggering friction analysis at:', analyzeUrl);

      // Wait for the analysis to complete (or timeout after 30 seconds to check status)
      const analysisResponse = await fetch(analyzeUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${process.env.CRON_SECRET}`
        },
        signal: AbortSignal.timeout(30000) // 30 second timeout for initial check
      });

      if (!analysisResponse.ok) {
        const errorText = await analysisResponse.text();
        console.error('Analysis endpoint returned error:', analysisResponse.status, errorText);
        analysisError = `Analysis started but returned status ${analysisResponse.status}`;
      } else {
        analysisResult = await analysisResponse.json();
        console.log('Analysis completed:', analysisResult);
      }
    } catch (e) {
      console.error('Error triggering analysis:', e);
      analysisError = e instanceof Error ? e.message : 'Unknown error';

      // If it's a timeout, that's actually OK - analysis is long-running
      if (e instanceof Error && e.name === 'TimeoutError') {
        console.log('Analysis still running after 30s (expected for large portfolios)');
        analysisError = null; // Don't treat timeout as error
      }
    }

    // Build response message
    let message = `Synced ${upsertedAccounts?.length || 0} accounts successfully!`;

    if (analysisError) {
      message += `\n\n⚠️ Warning: Analysis trigger failed - ${analysisError}\n\nYou may need to manually trigger analysis from the dashboard or check Vercel logs.`;
    } else if (analysisResult) {
      const summary = analysisResult.summary || {};
      const analyzed = summary.analyzed || 0;
      const skipped = summary.skipped || 0;
      const pending = (storageAccounts?.length || 0) + (marineAccounts?.length || 0) - analyzed - skipped;

      if (analyzed > 0) {
        message += `\n\n✓ Analyzed ${analyzed} account${analyzed > 1 ? 's' : ''}!`;
      }
      if (skipped > 0) {
        message += ` ${skipped} already up to date.`;
      }
      if (pending > 0) {
        message += ` ${pending} still pending (will process in next run).`;
      }
    } else {
      message += `\n\nAnalysis is running in the background (processing up to 50 accounts). Check back in a few minutes.`;
    }

    return NextResponse.json({
      success: true,
      synced: upsertedAccounts?.length || 0,
      portfolios: {
        storage: storageAccounts?.length || 0,
        marine: marineAccounts?.length || 0,
      },
      analysisResult,
      analysisError,
      message
    });

  } catch (error) {
    return NextResponse.json({ 
      error: 'Sync failed', 
      details: error instanceof Error ? error.message : 'Unknown'
    }, { status: 500 });
  }
}
