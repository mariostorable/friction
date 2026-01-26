import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const error = requestUrl.searchParams.get('error');

  if (error) {
    return NextResponse.redirect(`${requestUrl.origin}/dashboard?error=salesforce_auth_failed`);
  }

  if (!code) {
    return NextResponse.redirect(`${requestUrl.origin}/dashboard?error=no_code`);
  }

  try {
    console.log('=== Salesforce OAuth Callback Started ===');
    
    const supabase = createRouteHandlerClient({ cookies });
    
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    console.log('User authentication:', user ? 'SUCCESS' : 'FAILED', userError);
    
    if (!user) {
      throw new Error('Not authenticated');
    }

    // Use admin client for operations that bypass RLS
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

    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('id', user.id)
      .single();

    if (!existingProfile) {
      console.log('Profile missing, creating one...');
      const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .insert({
          id: user.id,
          email: user.email!,
          full_name: user.user_metadata?.full_name || user.user_metadata?.name || null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      
      if (profileError) {
        console.error('Profile creation error:', profileError);
        throw new Error(`Failed to create profile: ${profileError.message}`);
      }
      console.log('Profile created successfully');
    }

    const tokenParams: Record<string, string> = {
      grant_type: 'authorization_code',
      code: code,
      client_id: process.env.SALESFORCE_CLIENT_ID!,
      client_secret: process.env.SALESFORCE_CLIENT_SECRET!,
      redirect_uri: process.env.SALESFORCE_REDIRECT_URI!,
    };

    console.log('Exchanging code for tokens...');

    const tokenResponse = await fetch('https://storable.my.salesforce.com/services/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(tokenParams),
    });

    console.log('Token response status:', tokenResponse.status);

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('Salesforce token exchange failed:', errorText);
      throw new Error(`Salesforce API error: ${errorText}`);
    }

    const tokenData = await tokenResponse.json();
    console.log('Token exchange successful! Instance URL:', tokenData.instance_url);

    // Use regular client for integration (user owns this)
    const { data: integration, error: integrationError } = await supabase
      .from('integrations')
      .upsert({
        user_id: user.id,
        integration_type: 'salesforce',
        status: 'active',
        instance_url: tokenData.instance_url || null,
        metadata: {},
        connected_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (integrationError) {
      console.error('Integration storage error:', integrationError);
      throw integrationError;
    }

    console.log('Integration stored:', integration.id);

    // Use ADMIN client for tokens (RLS blocks direct access)
    const { data: tokenRecord, error: tokenError } = await supabaseAdmin
      .from('oauth_tokens')
      .upsert({
        integration_id: integration.id,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token || null,
        token_type: 'Bearer',
        expires_at: tokenData.issued_at 
          ? new Date(parseInt(tokenData.issued_at) + 7200000).toISOString()
          : new Date(Date.now() + 7200000).toISOString(),
      })
      .select()
      .single();

    if (tokenError) {
      console.error('Failed to store tokens:', tokenError);
      throw new Error(`Token storage failed: ${tokenError.message}`);
    }

    console.log('Tokens stored successfully!', tokenRecord.id);
    console.log('=== Salesforce OAuth Callback Complete ===');

    return NextResponse.redirect(`${requestUrl.origin}/dashboard?salesforce=connected`);

  } catch (err) {
    console.error('Salesforce OAuth error:', err);
    return NextResponse.redirect(
      `${requestUrl.origin}/dashboard?error=salesforce_connection_failed&details=${encodeURIComponent(
        err instanceof Error ? err.message : 'Unknown error'
      )}`
    );
  }
}
