/**
 * Show addresses for Top 25 accounts
 * Run with: npx tsx scripts/show-top25-addresses.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function showTop25Addresses() {
  try {
    console.log('Fetching Top 25 accounts and their addresses...\n');

    // Get user (assuming first user for now)
    const { data: users } = await supabase.from('profiles').select('id').limit(1);

    if (!users || users.length === 0) {
      console.error('No users found');
      return;
    }

    const userId = users[0].id;

    // Get Top 25 portfolios
    const { data: portfolios, error: portfolioError } = await supabase
      .from('portfolios')
      .select('account_ids, portfolio_type')
      .eq('user_id', userId)
      .in('portfolio_type', ['top_25_edge', 'top_25_marine', 'top_25_sitelink']);

    if (portfolioError) {
      console.error('Error fetching portfolios:', portfolioError);
      return;
    }

    // Collect all Top 25 account IDs
    const allAccountIds = new Set<string>();
    portfolios?.forEach(p => {
      p.account_ids.forEach((id: string) => allAccountIds.add(id));
    });

    console.log(`Found ${allAccountIds.size} unique accounts in Top 25 portfolios\n`);

    // Fetch account details
    const { data: accounts, error: accountError } = await supabase
      .from('accounts')
      .select(`
        id,
        name,
        arr,
        vertical,
        property_address_street,
        property_address_city,
        property_address_state,
        property_address_postal_code,
        billing_address_street,
        billing_address_city,
        billing_address_state,
        billing_address_postal_code,
        latitude,
        longitude
      `)
      .in('id', Array.from(allAccountIds))
      .order('arr', { ascending: false, nullsFirst: false });

    if (accountError) {
      console.error('Error fetching accounts:', accountError);
      return;
    }

    if (!accounts || accounts.length === 0) {
      console.log('No accounts found');
      return;
    }

    // Group by vertical
    const byVertical: Record<string, any[]> = {
      storage: [],
      marine: [],
      other: []
    };

    accounts.forEach(account => {
      if (account.vertical === 'storage') {
        byVertical.storage.push(account);
      } else if (account.vertical === 'marine') {
        byVertical.marine.push(account);
      } else {
        byVertical.other.push(account);
      }
    });

    // Display summary
    console.log('='.repeat(80));
    console.log('TOP 25 ACCOUNTS - ADDRESS SUMMARY');
    console.log('='.repeat(80));
    console.log(`Storage: ${byVertical.storage.length} accounts`);
    console.log(`Marine: ${byVertical.marine.length} accounts`);
    console.log(`Other: ${byVertical.other.length} accounts`);
    console.log(`Total: ${accounts.length} accounts\n`);

    // Count geocoded accounts
    const geocoded = accounts.filter(a => a.latitude && a.longitude);
    const withPropertyAddress = accounts.filter(a =>
      a.property_address_street || a.property_address_city || a.property_address_state
    );
    const withBillingAddress = accounts.filter(a =>
      a.billing_address_street || a.billing_address_city || a.billing_address_state
    );

    console.log('Address Status:');
    console.log(`✓ ${geocoded.length}/${accounts.length} have coordinates (lat/lng)`);
    console.log(`✓ ${withPropertyAddress.length}/${accounts.length} have property address data`);
    console.log(`✓ ${withBillingAddress.length}/${accounts.length} have billing address data`);
    console.log('');

    // Display each vertical's accounts
    ['storage', 'marine', 'other'].forEach(vertical => {
      if (byVertical[vertical].length === 0) return;

      console.log('='.repeat(80));
      console.log(`${vertical.toUpperCase()} ACCOUNTS (${byVertical[vertical].length})`);
      console.log('='.repeat(80));

      byVertical[vertical].forEach((account, idx) => {
        console.log(`\n${idx + 1}. ${account.name}`);
        console.log(`   ARR: $${account.arr?.toLocaleString() || '0'}`);

        // Property Address
        if (account.property_address_street || account.property_address_city) {
          console.log(`   Property Address:`);
          if (account.property_address_street) {
            console.log(`     ${account.property_address_street}`);
          }
          if (account.property_address_city || account.property_address_state) {
            const cityState = [
              account.property_address_city,
              account.property_address_state,
              account.property_address_postal_code
            ].filter(Boolean).join(', ');
            console.log(`     ${cityState}`);
          }
        } else {
          console.log(`   Property Address: (none)`);
        }

        // Billing Address (if different)
        const hasDifferentBilling =
          account.billing_address_street !== account.property_address_street ||
          account.billing_address_city !== account.property_address_city;

        if (hasDifferentBilling && (account.billing_address_street || account.billing_address_city)) {
          console.log(`   Billing Address:`);
          if (account.billing_address_street) {
            console.log(`     ${account.billing_address_street}`);
          }
          if (account.billing_address_city || account.billing_address_state) {
            const cityState = [
              account.billing_address_city,
              account.billing_address_state,
              account.billing_address_postal_code
            ].filter(Boolean).join(', ');
            console.log(`     ${cityState}`);
          }
        }

        // Coordinates
        if (account.latitude && account.longitude) {
          console.log(`   Coordinates: ${account.latitude}, ${account.longitude} ✓`);
        } else {
          console.log(`   Coordinates: (not geocoded) ⚠️`);
        }
      });
      console.log('');
    });

    // Show accounts missing addresses
    console.log('='.repeat(80));
    console.log('ACCOUNTS NEEDING GEOCODING');
    console.log('='.repeat(80));

    const needsGeocode = accounts.filter(a => !a.latitude || !a.longitude);

    if (needsGeocode.length === 0) {
      console.log('✓ All Top 25 accounts have coordinates!');
    } else {
      console.log(`${needsGeocode.length} accounts need geocoding:\n`);
      needsGeocode.forEach(account => {
        console.log(`- ${account.name}`);
        if (account.property_address_city && account.property_address_state) {
          console.log(`  Has address: ${account.property_address_city}, ${account.property_address_state}`);
          console.log(`  → Run geocode script to add coordinates`);
        } else {
          console.log(`  ⚠️ Missing address data in Salesforce`);
        }
      });
    }

  } catch (err) {
    console.error('Fatal error:', err);
    process.exit(1);
  }
}

showTop25Addresses();
