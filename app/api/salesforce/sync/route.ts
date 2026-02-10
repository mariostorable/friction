import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { getDecryptedToken, updateEncryptedAccessToken } from '@/lib/encryption';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { data: integration, error: integrationError } = await supabase
      .from('integrations')
      .select('*')
      .eq('user_id', user.id)
      .eq('integration_type', 'salesforce')
      .eq('status', 'active')
      .order('connected_at', { ascending: false })
      .limit(1)
      .single();

    if (!integration) {
      return NextResponse.json({
        error: 'Salesforce not connected',
        message: 'Please connect Salesforce in Settings',
        integrationError: integrationError?.message
      }, { status: 400 });
    }

    console.log('Found Salesforce integration:', integration.id);

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
      // Query top accounts by MRR with software/product detection fields and addresses
      // Remove ParentId filter - get ALL accounts with revenue
      return await fetch(
        `${integration.instance_url}/services/data/v59.0/query?q=SELECT+Id,Name,MRR_MVR__c,Industry,Type,Owner.Name,CreatedDate,Current_FMS__c,Online_Listing_Service__c,Current_Website_Provider__c,Current_Payment_Provider__c,Insurance_Company__c,Gate_System__c,LevelOfService__c,Managed_Account__c,VitallyClient_Success_Tier__c,Locations__c,Corp_Code__c,SE_Company_UUID__c,SpareFoot_Client_Key__c,Insurance_ZCRM_ID__c,ShippingStreet,ShippingCity,ShippingState,ShippingPostalCode,ShippingCountry,BillingStreet,BillingCity,BillingState,BillingPostalCode,BillingCountry,Property_Street__c,Property_City__c,Property_State__c,Property_Zip__c,smartystreets__Shipping_Latitude__c,smartystreets__Shipping_Longitude__c,smartystreets__Billing_Latitude__c,smartystreets__Billing_Longitude__c,smartystreets__Shipping_Address_Status__c,(SELECT+Id+FROM+Assets)+FROM+Account+WHERE+MRR_MVR__c>0+ORDER+BY+MRR_MVR__c+DESC+LIMIT+200`,
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

    // DEBUG: Check product fields in Salesforce response
    if (accountsData.records.length > 0) {
      console.log('\n🔍 SALESFORCE FIELD DEBUG:');
      console.log(`Total records returned: ${accountsData.records.length}`);

      // Check first 5 accounts for product fields
      const sampleAccounts = accountsData.records.slice(0, 5);
      sampleAccounts.forEach((account: any, index: number) => {
        console.log(`\nAccount ${index + 1}: ${account.Name}`);
        console.log(`  MRR_MVR__c: ${account.MRR_MVR__c || 'NULL'}`);
        console.log(`  Corp_Code__c: ${account.Corp_Code__c || 'NULL'}`);
        console.log(`  SE_Company_UUID__c: ${account.SE_Company_UUID__c || 'NULL'}`);
        console.log(`  Current_FMS__c: ${account.Current_FMS__c || 'NULL'}`);
        console.log(`  Industry: ${account.Industry || 'NULL'}`);
        console.log(`  Type: ${account.Type || 'NULL'}`);
      });

      // Count how many have each field
      const withMRR = accountsData.records.filter((a: any) => a.MRR_MVR__c).length;
      const withCorpCode = accountsData.records.filter((a: any) => a.Corp_Code__c).length;
      const withSEUUID = accountsData.records.filter((a: any) => a.SE_Company_UUID__c).length;
      const withFMS = accountsData.records.filter((a: any) => a.Current_FMS__c).length;

      console.log(`\n📊 Field Coverage:`);
      console.log(`  With MRR_MVR__c: ${withMRR}/${accountsData.records.length}`);
      console.log(`  With Corp_Code__c: ${withCorpCode}/${accountsData.records.length}`);
      console.log(`  With SE_Company_UUID__c: ${withSEUUID}/${accountsData.records.length}`);
      console.log(`  With Current_FMS__c: ${withFMS}/${accountsData.records.length}`);
      console.log('📍 End field debug\n');
    }

    // Deduplicate accounts by corporate name
    // PRIORITY: Keep CORP accounts over child accounts (they have the HQ address we need)
    // Use all accounts from query (no deduplication needed - simple query)
    const uniqueAccounts = accountsData.records;

    // Helper function to map Salesforce Type/Industry to business unit
    const mapTypeToVertical = (type: string | null, industry: string | null): 'storage' | 'marine' | 'rv' => {
      // For Storable: Almost everything is a storage facility
      // RV Storage, Boat Storage, Self Storage → all 'storage' vertical
      // Only pure Marine/Marina operations (not storage) are 'marine'
      const typeLower = (type || '').toLowerCase().trim();
      const industryLower = (industry || '').toLowerCase().trim();
      const combined = typeLower + ' ' + industryLower;

      // Marine: Only if explicitly marine/marina AND not a storage facility
      if ((combined.includes('marine') || combined.includes('marina')) &&
          !combined.includes('storage')) {
        return 'marine';
      }

      // Everything else is storage
      // Includes: Self Storage, RV Storage, Boat Storage, RV, Mini Storage, etc.
      return 'storage';
    };

    // Don't delete accounts - upsert to preserve friction data
    const accountsToUpsert = uniqueAccounts.map((sfAccount: any) => {
      const businessUnit = mapTypeToVertical(sfAccount.Type, sfAccount.Industry);
      const products = [];

      // Product detection based on business unit and specific ID fields (if custom fields exist)
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

      // Determine which geocoding to use
      const hasShippingGeocode = sfAccount.smartystreets__Shipping_Latitude__c && sfAccount.smartystreets__Shipping_Longitude__c;
      const hasBillingGeocode = sfAccount.smartystreets__Billing_Latitude__c && sfAccount.smartystreets__Billing_Longitude__c;

      // DEBUG: Log SmartyStreets data for 10 Federal Storage to diagnose geocoding issue
      if (sfAccount.Name?.includes('10 Federal Storage')) {
        console.log('\n🔍 DEBUG: SmartyStreets data for', sfAccount.Name);
        console.log('  Shipping Lat/Lng:', sfAccount.smartystreets__Shipping_Latitude__c, '/', sfAccount.smartystreets__Shipping_Longitude__c);
        console.log('  Billing Lat/Lng:', sfAccount.smartystreets__Billing_Latitude__c, '/', sfAccount.smartystreets__Billing_Longitude__c);
        console.log('  Shipping Status:', sfAccount.smartystreets__Shipping_Address_Status__c);
        console.log('  Has Shipping Geocode:', hasShippingGeocode);
        console.log('  Has Billing Geocode:', hasBillingGeocode);
      }

      // Prefer shipping address/geocode, fallback to billing
      const latitude = hasShippingGeocode ? sfAccount.smartystreets__Shipping_Latitude__c :
                      (hasBillingGeocode ? sfAccount.smartystreets__Billing_Latitude__c : null);
      const longitude = hasShippingGeocode ? sfAccount.smartystreets__Shipping_Longitude__c :
                       (hasBillingGeocode ? sfAccount.smartystreets__Billing_Longitude__c : null);

      const geocodeQuality = sfAccount.smartystreets__Shipping_Address_Status__c === 'Verified' ? 'high' :
                             (hasShippingGeocode || hasBillingGeocode ? 'medium' : null);

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
        // Property address - prefer custom Property_* fields, fallback to Shipping
        property_address_street: sfAccount.Property_Street__c || sfAccount.ShippingStreet || null,
        property_address_city: sfAccount.Property_City__c || sfAccount.ShippingCity || null,
        property_address_state: sfAccount.Property_State__c || sfAccount.ShippingState || null,
        property_address_postal_code: sfAccount.Property_Zip__c || sfAccount.ShippingPostalCode || null,
        property_address_country: sfAccount.ShippingCountry || null,
        // Billing address (fallback)
        billing_address_street: sfAccount.BillingStreet || null,
        billing_address_city: sfAccount.BillingCity || null,
        billing_address_state: sfAccount.BillingState || null,
        billing_address_postal_code: sfAccount.BillingPostalCode || null,
        billing_address_country: sfAccount.BillingCountry || null,
        // Geocoding from SmartyStreets
        latitude: latitude,
        longitude: longitude,
        geocode_source: (hasShippingGeocode || hasBillingGeocode) ? 'salesforce' : null,
        geocode_quality: geocodeQuality,
        geocoded_at: (latitude && longitude) ? new Date().toISOString() : null,
        metadata: {
          industry: sfAccount.Industry,
          type: sfAccount.Type,
          current_fms: sfAccount.Current_FMS__c,
          location_name: sfAccount.Name
        },
        // Don't set status here - preserve existing status on update, default to 'active' via column default on insert
      };
    });

    // DEBUG: Log first 3 accounts being upserted
    console.log('\n🔧 UPSERT DEBUG - First 3 accounts:');
    accountsToUpsert.slice(0, 3).forEach((acc: any, i: number) => {
      console.log(`\nAccount ${i + 1}:`, acc.name);
      console.log('  ARR:', acc.arr);
      console.log('  Products:', acc.products);
      console.log('  Vertical:', acc.vertical);
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
      console.error('Upsert error:', upsertError);
      return NextResponse.json({ error: 'Failed to store accounts', details: upsertError.message }, { status: 500 });
    }

    // DEBUG: Log what came back from upsert
    console.log('\n✅ UPSERT RESULT - First 3 accounts returned:');
    if (upsertedAccounts && upsertedAccounts.length > 0) {
      upsertedAccounts.slice(0, 3).forEach((acc: any, i: number) => {
        console.log(`\nAccount ${i + 1}:`, acc.name);
        console.log('  ARR:', acc.arr);
        console.log('  Products:', acc.products);
        console.log('  Vertical:', acc.vertical);
      });
    } else {
      console.log('  No accounts returned from upsert!');
    }

    // Clean up: Convert any remaining 'rv' vertical accounts to 'storage'
    // At Storable, RV facilities are storage facilities, not a separate vertical
    await supabase
      .from('accounts')
      .update({ vertical: 'storage' })
      .eq('user_id', user.id)
      .eq('vertical', 'rv');

    await supabase.from('portfolios').delete().eq('user_id', user.id);

    // DEBUG: Instead of querying all accounts, use the freshly upserted accounts
    // The upserted accounts have the correct, fresh data
    console.log('\n📊 Using upserted accounts for portfolio (fresh data)');
    console.log(`  Total upserted: ${upsertedAccounts?.length || 0}`);

    const allAccounts = upsertedAccounts || [];

    // Calculate actual vertical distribution
    const verticalCounts = {
      storage: 0,
      marine: 0,
      rv: 0,
      unknown: 0
    };

    allAccounts?.forEach(a => {
      const v = a.vertical || 'unknown';
      if (v in verticalCounts) {
        verticalCounts[v as keyof typeof verticalCounts]++;
      } else {
        verticalCounts.unknown++;
      }
    });

    // Filter storage accounts: exclude test accounts and require software
    const allStorageAccounts = allAccounts?.filter(a =>
      a.vertical === 'storage' &&
      !a.name?.toLowerCase().includes('test') && // Exclude test accounts
      a.products && a.products.trim() && // Must have products
      (a.products.includes('Software') || a.products.includes('EDGE') || a.products.includes('SiteLink')) // Must have software
    ) || [];

    console.log('🔍 Storage Account Filtering:');
    console.log(`  Total storage accounts with software: ${allStorageAccounts.length}`);
    console.log(`  Excluded test accounts and accounts without software`);

    // Top 25 EDGE Accounts - sort by ARR and filter for Edge/EDGE (case-insensitive)
    const edgeAccounts = allStorageAccounts
      .filter(a => a.products?.toLowerCase().includes('edge'))
      .sort((a, b) => (b.arr || 0) - (a.arr || 0))
      .slice(0, 25);

    console.log(`  EDGE accounts: ${edgeAccounts.length}`);

    if (edgeAccounts && edgeAccounts.length > 0) {
      await supabase.from('portfolios').insert({
        user_id: user.id,
        name: 'Top 25 EDGE Accounts',
        portfolio_type: 'top_25_edge',
        criteria: { type: 'top_mrr_edge', limit: 25, vertical: 'storage', software: 'EDGE' },
        account_ids: edgeAccounts.map(a => a.id),
      });
    }

    // Top 25 SiteLink Accounts - sort by ARR and filter for SiteLink
    const sitelinkAccounts = allStorageAccounts
      .filter(a => a.products?.toLowerCase().includes('sitelink'))
      .sort((a, b) => (b.arr || 0) - (a.arr || 0))
      .slice(0, 25);

    console.log(`  SiteLink accounts: ${sitelinkAccounts.length}`);

    if (sitelinkAccounts && sitelinkAccounts.length > 0) {
      await supabase.from('portfolios').insert({
        user_id: user.id,
        name: 'Top 25 SiteLink Accounts',
        portfolio_type: 'top_25_sitelink',
        criteria: { type: 'top_mrr_sitelink', limit: 25, vertical: 'storage', software: 'SiteLink' },
        account_ids: sitelinkAccounts.map(a => a.id),
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

    const topAccounts = [...(edgeAccounts || []), ...(sitelinkAccounts || []), ...(marineAccounts || [])];

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

    // Count accounts with geocoding data for Visit Planner
    const { count: geocodedCount } = await supabase
      .from('accounts')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('status', 'active')
      .not('latitude', 'is', null)
      .not('longitude', 'is', null);

    // Build response message
    let message = `Synced ${upsertedAccounts?.length || 0} accounts successfully!`;

    if (analysisError) {
      message += `\n\n⚠️ Warning: Analysis trigger failed - ${analysisError}\n\nYou may need to manually trigger analysis from the dashboard or check Vercel logs.`;
    } else if (analysisResult) {
      const summary = analysisResult.summary || {};
      const analyzed = summary.analyzed || 0;
      const skipped = summary.skipped || 0;
      const pending = (topAccounts?.length || 0) - analyzed - skipped;

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
      verticals: verticalCounts,
      portfolios: {
        edge: edgeAccounts?.length || 0,
        sitelink: sitelinkAccounts?.length || 0,
        marine: marineAccounts?.length || 0,
      },
      geocoded: geocodedCount || 0,
      analysisResult,
      analysisError,
      message,
      debug: {
        totalStorage: allStorageAccounts.length,
        withSoftware: allStorageAccounts.length,
        sampleProducts: allStorageAccounts.slice(0, 5).map(a => ({
          name: a.name,
          products: a.products
        }))
      }
    });

  } catch (error) {
    return NextResponse.json({ 
      error: 'Sync failed', 
      details: error instanceof Error ? error.message : 'Unknown'
    }, { status: 500 });
  }
}
