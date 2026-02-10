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
      // Try full query with custom fields first (for Storable orgs)
      // Property Address in UI = STANDARD ShippingAddress compound field (ShippingStreet, ShippingCity, ShippingState, etc. WITHOUT __c)
      // Parent Address fields: Parent_Street__c, Parent_City__c, Parent_State__c, Parent_Zip__c (for corporate parent accounts)
      // Pull top 500 storage accounts (Industry contains 'Storage') OR top 100 marine/RV accounts
      // This ensures we get all major storage accounts while still including other verticals
      const fullQuery = `SELECT Id,Name,dL_Product_s_Corporate_Name__c,MRR_MVR__c,Industry,Type,Owner.Name,CreatedDate,Current_FMS__c,Online_Listing_Service__c,Current_Website_Provider__c,Current_Payment_Provider__c,Insurance_Company__c,Gate_System__c,LevelOfService__c,Managed_Account__c,VitallyClient_Success_Tier__c,Locations__c,Corp_Code__c,SE_Company_UUID__c,SpareFoot_Client_Key__c,Insurance_ZCRM_ID__c,ShippingStreet,ShippingCity,ShippingState,ShippingPostalCode,ShippingCountry,Parent_Street__c,Parent_City__c,Parent_State__c,Parent_Zip__c,BillingStreet,BillingCity,BillingState,BillingPostalCode,BillingCountry,smartystreets__Shipping_Latitude__c,smartystreets__Shipping_Longitude__c,smartystreets__Billing_Latitude__c,smartystreets__Billing_Longitude__c,smartystreets__Shipping_Address_Status__c,smartystreets__Shipping_Verified__c,UltimateParentId,(SELECT Id FROM Assets) FROM Account WHERE ParentId=null AND (Industry LIKE '%Storage%' OR Industry LIKE '%Marine%' OR Industry LIKE '%RV%') AND MRR_MVR__c>0 ORDER BY MRR_MVR__c DESC LIMIT 1000`;

      const fullResponse = await fetch(
        `${integration.instance_url}/services/data/v59.0/query?q=${encodeURIComponent(fullQuery)}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      // If custom fields don't exist, fall back to standard fields
      if (!fullResponse.ok) {
        const errorText = await fullResponse.text();
        if (errorText.includes('INVALID_FIELD') || errorText.includes('No such column')) {
          console.log('Custom fields not found, using standard fields only');
          const simpleQuery = `SELECT Id,Name,AnnualRevenue,Industry,Type,Owner.Name,CreatedDate,ShippingStreet,ShippingCity,ShippingState,ShippingPostalCode,ShippingCountry,BillingStreet,BillingCity,BillingState,BillingPostalCode,BillingCountry,Parent_Street__c,Parent_City__c,Parent_State__c,Parent_Zip__c,(SELECT Id FROM Assets) FROM Account WHERE ParentId=null AND (Industry LIKE '%Storage%' OR Industry LIKE '%Marine%' OR Industry LIKE '%RV%') ORDER BY AnnualRevenue DESC NULLS LAST LIMIT 1000`;

          return await fetch(
            `${integration.instance_url}/services/data/v59.0/query?q=${encodeURIComponent(simpleQuery)}`,
            {
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
            }
          );
        }
      }

      return fullResponse;
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

    // Deduplicate accounts by corporate name to avoid syncing child accounts multiple times
    // Keep only the first occurrence of each corporate name (highest ARR due to sort order)
    const seenCorporateNames = new Set<string>();
    const uniqueAccounts = accountsData.records.filter((sfAccount: any) => {
      const corporateName = (sfAccount.dL_Product_s_Corporate_Name__c || sfAccount.Name || '').trim();
      if (!corporateName) return true; // Keep accounts with no name (edge case)

      if (seenCorporateNames.has(corporateName)) {
        console.log(`Skipping duplicate account: ${corporateName} (ARR: ${sfAccount.MRR_MVR__c})`);
        return false; // Skip duplicate
      }

      seenCorporateNames.add(corporateName);
      return true; // Keep first occurrence
    });

    console.log(`Deduped ${accountsData.records.length} accounts to ${uniqueAccounts.length} unique corporate names`);

    // Helper function to map Salesforce Type/Industry to business unit
    const mapTypeToVertical = (type: string | null, industry: string | null): 'storage' | 'marine' | 'rv' => {
      // Check both Type and Industry fields to determine vertical
      const typeLower = (type || '').toLowerCase().trim();
      const industryLower = (industry || '').toLowerCase().trim();
      const combined = typeLower + ' ' + industryLower;

      // Check for marine indicators
      if (combined.includes('marine') || combined.includes('marina') || combined.includes('boat')) {
        return 'marine';
      }

      // Check for RV indicators
      if (combined.includes('rv') || combined.includes('recreational vehicle') ||
          combined.includes('recreation vehicle')) {
        return 'rv';
      }

      // Check for storage indicators (or default)
      if (combined.includes('storage') || combined.includes('self storage') ||
          combined.includes('self-storage') || !combined.trim()) {
        return 'storage';
      }

      // Default to storage if unclear (most Storable accounts are storage)
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

    await supabase.from('portfolios').delete().eq('user_id', user.id);

    // Get all accounts (active only, has ARR)
    const { data: allAccounts } = await supabase
      .from('accounts')
      .select('id, vertical, products, arr')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .not('arr', 'is', null)
      .order('arr', { ascending: false });

    // Top 25 Storage Accounts (ONLY EDGE + SiteLink - exclude accounts without software)
    const storageAccounts = allAccounts?.filter(a => {
      if (a.vertical !== 'storage') return false;
      // ONLY include accounts with EDGE or SiteLink software
      if (!a.products || !a.products.trim()) return false;
      return a.products.includes('EDGE') || a.products.includes('SiteLink');
    }).slice(0, 25);

    if (storageAccounts && storageAccounts.length > 0) {
      await supabase.from('portfolios').insert({
        user_id: user.id,
        name: 'Top 25 Storage Accounts',
        portfolio_type: 'top_25_edge',
        criteria: { type: 'top_mrr_storage', limit: 25, vertical: 'storage', requires_software: true },
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
    // This handles accounts using Parent address fields which don't have SmartyStreets coords
    const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    let geocodedInSync = 0;

    if (GOOGLE_MAPS_API_KEY) {
      const { data: needsGeocoding } = await supabase
        .from('accounts')
        .select('id, property_address_street, property_address_city, property_address_state, property_address_postal_code')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .not('property_address_street', 'is', null)
        .is('latitude', null)
        .limit(50); // Geocode up to 50 accounts per sync

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
      portfolios: {
        storage: storageAccounts?.length || 0,
        marine: marineAccounts?.length || 0,
      },
      geocoded: geocodedCount || 0,
      geocodedInSync: geocodedInSync || 0,
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
