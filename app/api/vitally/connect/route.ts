import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { upsertEncryptedToken } from '@/lib/encryption';

const VITALLY_API_BASE_URL = 'https://storable.rest.vitally.io';

export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { apiKey } = await request.json();

    // Validate inputs
    if (!apiKey) {
      return NextResponse.json({
        error: 'Missing required fields. Please provide your Vitally API key.'
      }, { status: 400 });
    }

    // Test connection by making a simple API call
    // Vitally uses Basic auth with API key as username and empty password (colon at the end)
    const authHeader = `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`;
    const testResponse = await fetch(`${VITALLY_API_BASE_URL}/resources/accounts?limit=1`, {
      method: 'GET',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
    });

    if (!testResponse.ok) {
      const errorText = await testResponse.text();
      console.error('Vitally connection test failed:', errorText);
      return NextResponse.json({
        error: 'Failed to connect to Vitally. Please check your API key.',
        details: errorText
      }, { status: 400 });
    }

    const testData = await testResponse.json();
    console.log('Vitally connection successful, fetched accounts:', testData.results?.length || 0);

    // Store integration
    const { data: integration, error: integrationError } = await supabase
      .from('integrations')
      .upsert({
        user_id: user.id,
        integration_type: 'vitally',
        status: 'active',
        instance_url: VITALLY_API_BASE_URL,
        metadata: {},
        connected_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,integration_type',
        ignoreDuplicates: false
      })
      .select()
      .single();

    if (integrationError) {
      console.error('Integration storage error:', integrationError);
      throw integrationError;
    }

    // Store API key in oauth_tokens table using admin client
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

    // Store encrypted API key
    try {
      const tokenId = await upsertEncryptedToken(supabaseAdmin, {
        integration_id: integration.id,
        access_token: apiKey, // Store API key as access token
        refresh_token: null,
        token_type: 'basic_auth',
        expires_at: null, // No expiration
      });

      console.log('Vitally integration and encrypted API key stored successfully:', tokenId);
    } catch (tokenError) {
      console.error('Failed to store encrypted API key:', tokenError);
      throw new Error(`Token storage failed: ${tokenError instanceof Error ? tokenError.message : 'Unknown error'}`);
    }

    return NextResponse.json({
      success: true,
      integration: {
        id: integration.id,
        instance_url: integration.instance_url,
        connected_at: integration.connected_at,
      }
    });

  } catch (err) {
    console.error('Vitally connection error:', err);
    return NextResponse.json({
      error: 'Failed to connect to Vitally',
      details: err instanceof Error ? err.message : 'Unknown error'
    }, { status: 500 });
  }
}
