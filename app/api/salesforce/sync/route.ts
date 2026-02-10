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
      // Query top accounts by MRR with software/product detection fields
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

    // DEBUG: Check which address fields exist and have data
    if (accountsData.records.length > 0) {
      const firstAccount = accountsData.records[0];
      console.log('\n🔍 ADDRESS FIELD TEST:');
      console.log(`Account: ${firstAccount.Name}`);

      const addressFields = [
        'ShippingStreet', 'ShippingCity', 'ShippingState', 'ShippingPostalCode', 'ShippingCountry',
        'Parent_Street__c', 'Parent_City__c', 'Parent_State__c', 'Parent_Zip__c',
        'BillingStreet', 'BillingCity', 'BillingState', 'BillingPostalCode',
        'smartystreets__Shipping_Latitude__c', 'smartystreets__Shipping_Longitude__c',
        'smartystreets__Billing_Latitude__c', 'smartystreets__Billing_Longitude__c'
      ];

      addressFields.forEach(field => {
        if (firstAccount[field] !== undefined && firstAccount[field] !== null) {
          console.log(`✅ ${field}: ${firstAccount[field]}`);
        }
      });
      console.log('📍 End address field test\n');
    }

    // Deduplicate accounts by corporate name
    // PRIORITY: Keep CORP accounts over child accounts (they have the HQ address we need)
    // Group by corporate name, then pick CORP account if exists, otherwise highest ARR
    const accountsByCorporateName = new Map<string, any[]>();

    accountsData.records.forEach((sfAccount: any) => {
      const corporateName = (sfAccount.dL_Product_s_Corporate_Name__c || sfAccount.Name || '').trim();
      if (!corporateName) return; // Skip accounts with no name

      if (!accountsByCorporateName.has(corporateName)) {
        accountsByCorporateName.set(corporateName, []);
      }
      accountsByCorporateName.get(corporateName)!.push(sfAccount);
    });

    const uniqueAccounts: any[] = [];
    accountsByCorporateName.forEach((accounts) => {
      // Prefer CORP accounts (they have HQ address)
      const corpAccount = accounts.find(a =>
        a.Name && (a.Name.includes('- CORP') || a.Name.includes('-CORP') || a.Name.includes('CORP.'))
      );

      if (corpAccount) {
        uniqueAccounts.push(corpAccount);
        console.log(`Selected CORP account: ${corpAccount.Name}`);
      } else {
        // No CORP account, take the first one (highest ARR due to query sort)
        uniqueAccounts.push(accounts[0]);
      }
    });

    console.log(`Deduped ${accountsData.records.length} accounts to ${uniqueAccounts.length} unique corporate names`);

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

      return {
        user_id: user.id,
        salesforce_id: sfAccount.Id,
        name: sfAccount.dL_Product_s_Corporate_Name__c || sfAccount.Name,
        // Use MRR_MVR__c if available (converted to ARR), otherwise AnnualRevenue
        arr: sfAccount.MRR_MVR__c ? sfAccount.MRR_MVR__c * 12 : (sfAccount.AnnualRevenue || null),
        vertical: businessUnit,
        products: products.length > 0 ? products.join(', ') : null,
        segment: sfAccount.Type || null,
        owner_name: sfAccount.Owner?.Name || null,
        customer_since: sfAccount.CreatedDate || null,
        facility_count: sfAccount.Locations__c || 0,
        service_level: sfAccount.LevelOfService__c || null,
        managed_account: sfAccount.Managed_Account__c || null,
        cs_segment: sfAccount.VitallyClient_Success_Tier__c || null,
        // Property address - PRIORITY: Parent (Corporate HQ) > Billing > Shipping
        // Parent_Street__c, Parent_City__c, etc. contain corporate HQ address (e.g., 10 Federal Storage = Raleigh)
        property_address_street: sfAccount.Parent_Street__c ||
                                sfAccount.BillingStreet ||
                                sfAccount.ShippingStreet ||
                                null,
        property_address_city: sfAccount.Parent_City__c ||
                              sfAccount.BillingCity ||
                              sfAccount.ShippingCity ||
                              null,
        property_address_state: sfAccount.Parent_State__c ||
                               sfAccount.BillingState ||
                               sfAccount.ShippingState ||
                               null,
        property_address_postal_code: sfAccount.Parent_Zip__c ||
                                     sfAccount.BillingPostalCode ||
                                     sfAccount.ShippingPostalCode ||
                                     null,
        property_address_country: sfAccount.BillingCountry ||
                                 sfAccount.ShippingCountry ||
                                 null,
        // Billing address (store separately for reference)
        billing_address_street: sfAccount.BillingStreet || null,
        billing_address_city: sfAccount.BillingCity || null,
        billing_address_state: sfAccount.BillingState || null,
        billing_address_postal_code: sfAccount.BillingPostalCode || null,
        billing_address_country: sfAccount.BillingCountry || null,
        // Geocoding - SmartyStreets coordinates from Billing or Shipping addresses
        // NOTE: Parent fields don't have SmartyStreets coords, so accounts using Parent address
        // will have address but no coordinates and need manual geocoding via Google Maps API
        latitude: sfAccount.smartystreets__Billing_Latitude__c ||
                  sfAccount.smartystreets__Shipping_Latitude__c ||
                  null,
        longitude: sfAccount.smartystreets__Billing_Longitude__c ||
                   sfAccount.smartystreets__Shipping_Longitude__c ||
                   null,
        geocode_source: (sfAccount.smartystreets__Billing_Latitude__c || sfAccount.smartystreets__Shipping_Latitude__c) ? 'salesforce' : null,
        geocode_quality: sfAccount.smartystreets__Billing_Latitude__c ? 'high' :
                        (sfAccount.smartystreets__Shipping_Verified__c ? 'high' : 'medium'),
        geocoded_at: (sfAccount.smartystreets__Billing_Latitude__c || sfAccount.smartystreets__Shipping_Latitude__c) ?
                     new Date().toISOString() : null,
        // Account hierarchy
        ultimate_parent_id: sfAccount.UltimateParentId || null,
        metadata: {
          industry: sfAccount.Industry,
          type: sfAccount.Type,
          current_fms: sfAccount.Current_FMS__c,
          location_name: sfAccount.Name
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

    // Clean up: Convert any remaining 'rv' vertical accounts to 'storage'
    // At Storable, RV facilities are storage facilities, not a separate vertical
    await supabase
      .from('accounts')
      .update({ vertical: 'storage' })
      .eq('user_id', user.id)
      .eq('vertical', 'rv');

    await supabase.from('portfolios').delete().eq('user_id', user.id);

    // Get all accounts (active only, has ARR or is corporate parent)
    const { data: allAccounts } = await supabase
      .from('accounts')
      .select('id, vertical, products, arr, name')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('arr', { ascending: false });

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

    // Top 25 Storage Accounts (ONLY EDGE + SiteLink - exclude accounts without software)
    const allStorageAccounts = allAccounts?.filter(a => a.vertical === 'storage') || [];
    const storageWithProducts = allStorageAccounts.filter(a => a.products && a.products.trim());
    const storageWithSoftware = storageWithProducts.filter(a =>
      a.products.includes('EDGE') || a.products.includes('SiteLink')
    );

    console.log('🔍 Storage Account Filtering:');
    console.log(`  Total storage accounts: ${allStorageAccounts.length}`);
    console.log(`  With any products: ${storageWithProducts.length}`);
    console.log(`  With EDGE/SiteLink: ${storageWithSoftware.length}`);
    if (storageWithSoftware.length > 0) {
      console.log(`  Sample products:`, storageWithSoftware.slice(0, 3).map(a => ({ name: a.name, products: a.products })));
    }

    const storageAccounts = storageWithSoftware.slice(0, 25);

    if (storageAccounts && storageAccounts.length > 0) {
      await supabase.from('portfolios').insert({
        user_id: user.id,
        name: 'Top 25 Storage Accounts',
        portfolio_type: 'top_25_edge',  // Keep as top_25_edge for dashboard compatibility
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

    const topAccounts = [...(storageAccounts || []), ...(marineAccounts || [])];

    await supabase.from('integrations').update({ last_synced_at: new Date().toISOString() }).eq('id', integration.id);

    // AUTO-GEOCODE: Geocode accounts that have addresses but no coordinates
    // PRIORITY: Top 25 portfolio accounts first, then other accounts
    const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    let geocodedInSync = 0;

    if (GOOGLE_MAPS_API_KEY) {
      // Get all portfolio account IDs
      const portfolioAccountIds = topAccounts?.map(a => a.id) || [];

      // Priority 1: Geocode Top 25 accounts that need it
      let needsGeocoding: any[] = [];
      if (portfolioAccountIds.length > 0) {
        const { data: portfolioNeedsGeo } = await supabase
          .from('accounts')
          .select('id, property_address_street, property_address_city, property_address_state, property_address_postal_code')
          .in('id', portfolioAccountIds)
          .not('property_address_street', 'is', null)
          .is('latitude', null);

        needsGeocoding = portfolioNeedsGeo || [];
      }

      // Priority 2: Add other accounts up to limit of 50 total
      if (needsGeocoding.length < 50) {
        const { data: otherNeedsGeo } = await supabase
          .from('accounts')
          .select('id, property_address_street, property_address_city, property_address_state, property_address_postal_code')
          .eq('user_id', user.id)
          .eq('status', 'active')
          .not('property_address_street', 'is', null)
          .is('latitude', null)
          .limit(50 - needsGeocoding.length);

        if (otherNeedsGeo) {
          needsGeocoding = [...needsGeocoding, ...otherNeedsGeo];
        }
      }

      if (needsGeocoding && needsGeocoding.length > 0) {
        console.log(`Auto-geocoding ${needsGeocoding.length} accounts...`);

        for (const account of needsGeocoding) {
          const addressParts = [
            account.property_address_street,
            account.property_address_city,
            account.property_address_state,
            account.property_address_postal_code
          ].filter(Boolean);

          const fullAddress = addressParts.join(', ');
          if (!fullAddress) continue;

          try {
            const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(fullAddress)}&key=${GOOGLE_MAPS_API_KEY}`;
            const geocodeResponse = await fetch(geocodeUrl);
            const geocodeData = await geocodeResponse.json();

            if (geocodeData.status === 'OK' && geocodeData.results && geocodeData.results.length > 0) {
              const location = geocodeData.results[0].geometry.location;

              await supabase
                .from('accounts')
                .update({
                  latitude: location.lat,
                  longitude: location.lng,
                  geocode_source: 'google_maps',
                  geocode_quality: geocodeData.results[0].geometry.location_type || 'APPROXIMATE',
                  geocoded_at: new Date().toISOString()
                })
                .eq('id', account.id);

              geocodedInSync++;
            }

            // Rate limit: 100ms between requests
            await new Promise(resolve => setTimeout(resolve, 100));
          } catch (error) {
            console.error(`Failed to geocode account ${account.id}:`, error);
          }
        }
      }
    }

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

    if (geocodedInSync > 0) {
      message += `\n\n📍 Auto-geocoded ${geocodedInSync} accounts with missing coordinates.`;
    }

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
        storage: storageAccounts?.length || 0,
        marine: marineAccounts?.length || 0,
      },
      geocoded: geocodedCount || 0,
      geocodedInSync: geocodedInSync || 0,
      analysisResult,
      analysisError,
      message,
      debug: {
        totalStorage: allStorageAccounts.length,
        withProducts: storageWithProducts.length,
        withEDGEorSiteLink: storageWithSoftware.length,
        sampleProducts: storageWithProducts.slice(0, 5).map(a => ({
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
