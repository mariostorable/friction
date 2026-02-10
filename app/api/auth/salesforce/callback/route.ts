import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { upsertEncryptedToken } from '@/lib/encryption';

export const dynamic = 'force-dynamic';

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

    // CLEANUP: Delete ALL old Salesforce integrations for this user to avoid duplicates
    // Get all existing Salesforce integrations
    const { data: oldIntegrations } = await supabase
      .from('integrations')
      .select('id')
      .eq('user_id', user.id)
      .eq('integration_type', 'salesforce');

    if (oldIntegrations && oldIntegrations.length > 0) {
      const oldIntegrationIds = oldIntegrations.map(i => i.id);
      console.log(`Cleaning up ${oldIntegrationIds.length} old Salesforce integration(s):`, oldIntegrationIds);

      // Delete oauth_tokens for old integrations (using admin client)
      await supabaseAdmin
        .from('oauth_tokens')
        .delete()
        .in('integration_id', oldIntegrationIds);

      // Delete old integrations
      await supabase
        .from('integrations')
        .delete()
        .in('id', oldIntegrationIds);

      console.log('Old integrations cleaned up');
    }

    // Insert fresh new integration
    const { data: integration, error: integrationError } = await supabase
      .from('integrations')
      .insert({
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
      console.error('Integration insert error:', integrationError);
      throw integrationError;
    }

    console.log('Integration stored:', integration.id);

    // Store encrypted tokens using admin client
    try {
      const tokenId = await upsertEncryptedToken(supabaseAdmin, {
        integration_id: integration.id,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token || null,
        token_type: 'Bearer',
        expires_at: tokenData.issued_at
          ? new Date(parseInt(tokenData.issued_at) + 7200000).toISOString()
          : new Date(Date.now() + 7200000).toISOString(),
      });

      console.log('Tokens stored successfully (encrypted)!', tokenId);
    } catch (tokenError) {
      console.error('Failed to store encrypted tokens:', tokenError);
      throw new Error(`Token storage failed: ${tokenError instanceof Error ? tokenError.message : 'Unknown error'}`);
    }
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
