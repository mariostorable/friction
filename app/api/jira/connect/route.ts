import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { upsertEncryptedToken } from '@/lib/encryption';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { jiraUrl, email, apiToken } = await request.json();

    // Validate inputs
    if (!jiraUrl || !email || !apiToken) {
      return NextResponse.json({
        error: 'Missing required fields. Please provide Jira URL, email, and API token.'
      }, { status: 400 });
    }

    // Clean URL (remove https:// if present, ensure proper format)
    const cleanUrl = jiraUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const baseUrl = `https://${cleanUrl}`;

    // Test connection by fetching user info
    const testResponse = await fetch(`${baseUrl}/rest/api/3/myself`, {
      headers: {
        'Authorization': `Basic ${Buffer.from(`${email}:${apiToken}`).toString('base64')}`,
        'Accept': 'application/json',
      },
    });

    if (!testResponse.ok) {
      const errorText = await testResponse.text();
      console.error('Jira connection test failed:', errorText);
      return NextResponse.json({
        error: 'Failed to connect to Jira. Please check your URL, email, and API token.',
        details: errorText
      }, { status: 400 });
    }

    const jiraUser = await testResponse.json();
    console.log('Jira connection successful:', jiraUser.displayName);

    // Store integration
    const { data: integration, error: integrationError } = await supabase
      .from('integrations')
      .upsert({
        user_id: user.id,
        integration_type: 'jira',
        status: 'active',
        instance_url: baseUrl,
        metadata: {
          email: email,
          jira_user_name: jiraUser.displayName,
          jira_account_id: jiraUser.accountId,
        },
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

    // Store API token in oauth_tokens table (admin-only access)
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

    // Store encrypted API token
    try {
      const tokenId = await upsertEncryptedToken(supabaseAdmin, {
        integration_id: integration.id,
        access_token: apiToken, // Store API token
        refresh_token: null, // Jira tokens don't expire
        token_type: 'api_token',
        expires_at: null, // No expiration
      });

      console.log('Jira integration and encrypted token stored successfully:', tokenId);
    } catch (tokenError) {
      console.error('Failed to store encrypted API token:', tokenError);
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
    console.error('Jira connection error:', err);
    return NextResponse.json({
      error: 'Failed to connect to Jira',
      details: err instanceof Error ? err.message : 'Unknown error'
    }, { status: 500 });
  }
}
