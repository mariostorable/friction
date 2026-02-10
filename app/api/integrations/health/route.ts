import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

/**
 * Health check endpoint for integrations
 * Returns status of all connected integrations
 */
export async function GET() {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Get all integrations
    const { data: integrations, error } = await supabase
      .from('integrations')
      .select('id, integration_type, status, instance_url, credentials')
      .eq('user_id', user.id);

    if (error) {
      return NextResponse.json({
        error: 'Failed to check integrations',
        details: error.message
      }, { status: 500 });
    }

    const health = integrations?.map(integration => {
      const hasCredentials = !!integration.credentials;
      const isActive = integration.status === 'active';

      let status = 'healthy';
      let issues = [];

      if (!hasCredentials) {
        status = 'critical';
        issues.push('Missing credentials - reconnect required');
      } else if (!isActive) {
        status = 'warning';
        issues.push('Integration is not active');
      }

      return {
        type: integration.integration_type,
        status,
        issues,
        hasCredentials,
        isActive,
        instanceUrl: integration.instance_url
      };
    });

    const critical = health?.filter(h => h.status === 'critical') || [];
    const warnings = health?.filter(h => h.status === 'warning') || [];

    return NextResponse.json({
      overall: critical.length > 0 ? 'critical' : warnings.length > 0 ? 'warning' : 'healthy',
      integrations: health,
      summary: {
        total: integrations?.length || 0,
        healthy: health?.filter(h => h.status === 'healthy').length || 0,
        warnings: warnings.length,
        critical: critical.length
      }
    });

  } catch (error: any) {
    return NextResponse.json(
      { error: 'Health check failed', details: error.message },
      { status: 500 }
    );
  }
}
