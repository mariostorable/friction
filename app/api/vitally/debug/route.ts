import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { getDecryptedToken } from '@/lib/encryption';

export const dynamic = 'force-dynamic';

export async function GET() {
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

    // Build Basic Auth header
    const apiKey = tokenData.access_token;
    const authHeader = `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`;

    // Fetch accounts from Vitally with limit to see structure
    const response = await fetch(`${integration.instance_url}/resources/accounts?limit=5`, {
      method: 'GET',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json({
        error: 'Vitally API request failed',
        status: response.status,
        details: errorText,
      }, { status: response.status });
    }

    const data = await response.json();

    // Check how many records exist in vitally_accounts table
    const { count } = await supabaseAdmin
      .from('vitally_accounts')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);

    // Analyze all accounts to find patterns
    const accounts = data.results || [];
    const fieldAnalysis: any = {
      topLevelFields: new Set<string>(),
      traitsFields: new Set<string>(),
      sampleAccountsWithStructure: []
    };

    accounts.forEach((acc: any, idx: number) => {
      // Collect all top-level keys
      Object.keys(acc).forEach(key => fieldAnalysis.topLevelFields.add(key));

      // Collect all traits keys
      if (acc.traits && typeof acc.traits === 'object') {
        Object.keys(acc.traits).forEach(key => fieldAnalysis.traitsFields.add(key));
      }

      // Store first 3 accounts with their full structure
      if (idx < 3) {
        fieldAnalysis.sampleAccountsWithStructure.push({
          name: acc.name,
          id: acc.id,
          topLevelKeys: Object.keys(acc),
          traitsKeys: acc.traits ? Object.keys(acc.traits) : [],
          fullAccount: acc // Include complete account object
        });
      }
    });

    return NextResponse.json({
      success: true,
      accountsReturned: accounts.length,
      fieldAnalysis: {
        allTopLevelFields: Array.from(fieldAnalysis.topLevelFields).sort(),
        allTraitsFields: Array.from(fieldAnalysis.traitsFields).sort(),
        sampleAccounts: fieldAnalysis.sampleAccountsWithStructure
      },
      database_records: {
        vitally_accounts_count: count,
      },
      integration_info: {
        instance_url: integration.instance_url,
        connected_at: integration.connected_at,
        last_synced_at: integration.last_synced_at,
      }
    });

  } catch (error) {
    console.error('Vitally debug error:', error);
    return NextResponse.json({
      error: 'Debug failed',
      details: error instanceof Error ? error.message : 'Unknown',
    }, { status: 500 });
  }
}
