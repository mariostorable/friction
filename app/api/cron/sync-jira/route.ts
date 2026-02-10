/**
 * DEPRECATED: This Vercel Cron endpoint is no longer used.
 *
 * The Jira sync cron job has been migrated to Supabase pg_cron for better
 * cost efficiency and centralized database management.
 *
 * See: scripts/setup-jira-sync-cron.sql for the new implementation
 * See: scripts/SUPABASE_CRON_SETUP.md for setup instructions
 *
 * This file is kept for reference/backup purposes only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    // Verify the request is from Vercel Cron
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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

    // Get all active Jira integrations
    const { data: integrations, error: integrationsError } = await supabaseAdmin
      .from('integrations')
      .select('id, user_id, instance_url, metadata')
      .eq('integration_type', 'jira')
      .eq('status', 'active');

    if (integrationsError) {
      console.error('Failed to fetch Jira integrations:', integrationsError);
      return NextResponse.json({ error: 'Failed to fetch integrations' }, { status: 500 });
    }

    if (!integrations || integrations.length === 0) {
      console.log('No active Jira integrations found');
      return NextResponse.json({ message: 'No Jira integrations to sync' });
    }

    console.log(`Found ${integrations.length} active Jira integration(s) to sync`);

    // Sync each integration
    const results = [];
    for (const integration of integrations) {
      try {
        console.log(`Syncing Jira for user ${integration.user_id}`);

        // Call the sync endpoint for this user
        const baseUrl = process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : 'http://localhost:3000';

        const response = await fetch(`${baseUrl}/api/jira/sync`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            // Pass user context for auth
            'x-user-id': integration.user_id,
          },
        });

        const result = await response.json();

        if (response.ok) {
          console.log(`Successfully synced ${result.synced} issues for user ${integration.user_id}`);
          results.push({
            user_id: integration.user_id,
            success: true,
            synced: result.synced,
            links_created: result.links_created,
          });
        } else {
          console.error(`Failed to sync for user ${integration.user_id}:`, result.error);
          results.push({
            user_id: integration.user_id,
            success: false,
            error: result.error,
          });
        }
      } catch (error) {
        console.error(`Error syncing for user ${integration.user_id}:`, error);
        results.push({
          user_id: integration.user_id,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return NextResponse.json({
      success: true,
      integrations_processed: integrations.length,
      results,
    });

  } catch (error) {
    console.error('Cron job error:', error);
    return NextResponse.json({
      error: 'Cron job failed',
      details: error instanceof Error ? error.message : 'Unknown'
    }, { status: 500 });
  }
}
