import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

/**
 * Initiates Salesforce OAuth flow
 * Redirects user to Salesforce login page
 */
export async function GET(request: NextRequest) {
  try {
    // Build Salesforce OAuth URL
    const authUrl = new URL('https://storable.my.salesforce.com/services/oauth2/authorize');
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', process.env.SALESFORCE_CLIENT_ID!);
    authUrl.searchParams.set('redirect_uri', process.env.SALESFORCE_REDIRECT_URI!);
    authUrl.searchParams.set('scope', 'api refresh_token');
    authUrl.searchParams.set('prompt', 'login'); // Force login to ensure fresh credentials

    console.log('Redirecting to Salesforce OAuth:', authUrl.toString());

    // Redirect to Salesforce (auth check happens in callback)
    return NextResponse.redirect(authUrl.toString());

  } catch (error) {
    console.error('Salesforce OAuth initiation error:', error);
    const requestUrl = new URL(request.url);
    return NextResponse.redirect(
      `${requestUrl.origin}/dashboard?error=salesforce_oauth_failed`
    );
  }
}
