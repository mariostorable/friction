import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Get actual theme keys from friction_theme_summaries
    const { data: themeSummaries } = await supabaseAdmin
      .from('friction_theme_summaries')
      .select('theme_key, case_count')
      .eq('user_id', user.id);

    // Get theme keys being used in theme_jira_links
    const { data: linkThemes } = await supabaseAdmin
      .from('theme_jira_links')
      .select('theme_key')
      .eq('user_id', user.id);

    const actualThemes = Array.from(new Set(themeSummaries?.map((t: any) => t.theme_key) || []));
    const linkedThemes = Array.from(new Set(linkThemes?.map((t: any) => t.theme_key) || []));

    const HARDCODED_THEMES = [
      'billing_confusion',
      'integration_failures',
      'ui_confusion',
      'performance_issues',
      'missing_features',
      'training_gaps',
      'support_response_time',
      'data_quality',
      'reporting_issues',
      'access_permissions',
      'configuration_problems',
      'notification_issues',
      'workflow_inefficiency',
      'mobile_issues',
    ];

    return NextResponse.json({
      actual_themes_from_cases: actualThemes,
      themes_in_jira_links: linkedThemes,
      hardcoded_themes: HARDCODED_THEMES,
      mismatch: linkedThemes.filter(t => !actualThemes.includes(t)),
      diagnosis: linkedThemes.length > 0 && actualThemes.length > 0 && linkedThemes.filter(t => actualThemes.includes(t)).length === 0
        ? 'MISMATCH! Jira links use different theme keys than your actual friction themes'
        : 'Theme keys match',
    });
  } catch (error) {
    console.error('Check themes error:', error);
    return NextResponse.json({
      error: 'Failed to check themes',
      details: error instanceof Error ? error.message : 'Unknown',
    }, { status: 500 });
  }
}
