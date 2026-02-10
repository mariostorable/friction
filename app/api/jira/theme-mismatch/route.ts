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

    // Get actual theme keys from friction_cards (real Salesforce themes)
    const { data: frictionCards } = await supabaseAdmin
      .from('friction_cards')
      .select('theme_key, theme_label, case_count:id')
      .eq('user_id', user.id);

    const actualThemes = Array.from(new Set(frictionCards?.map((c: any) => c.theme_key) || []));

    // Get sample friction card to see theme structure
    const sampleTheme = frictionCards?.[0];

    // Get theme keys being used in theme_jira_links
    const { data: linkThemes } = await supabaseAdmin
      .from('theme_jira_links')
      .select('theme_key, confidence, match_type')
      .eq('user_id', user.id)
      .limit(20);

    const linkedThemeKeys = Array.from(new Set(linkThemes?.map((t: any) => t.theme_key) || []));

    // Find mismatches
    const linksWithNoTheme = linkedThemeKeys.filter(key => !actualThemes.includes(key));
    const themesWithNoLinks = actualThemes.filter(key => !linkedThemeKeys.includes(key));
    const matchingThemes = linkedThemeKeys.filter(key => actualThemes.includes(key));

    return NextResponse.json({
      actual_friction_themes: {
        count: actualThemes.length,
        sample: actualThemes.slice(0, 10),
        all: actualThemes
      },
      theme_keys_in_jira_links: {
        count: linkedThemeKeys.length,
        sample: linkedThemeKeys.slice(0, 10),
        all: linkedThemeKeys
      },
      sample_friction_card: sampleTheme,
      sample_jira_links: linkThemes?.slice(0, 5),
      mismatch_analysis: {
        matching_themes: matchingThemes.length,
        links_with_nonexistent_themes: linksWithNoTheme.length,
        themes_with_no_links: themesWithNoLinks.length,
        nonexistent_theme_keys: linksWithNoTheme,
        themes_without_links: themesWithNoLinks
      },
      diagnosis: linksWithNoTheme.length > 0
        ? `MISMATCH FOUND! ${linksWithNoTheme.length} theme keys in Jira links don't match any real friction themes.`
        : 'Theme keys match correctly'
    });
  } catch (error) {
    console.error('Theme mismatch diagnostic error:', error);
    return NextResponse.json({
      error: 'Failed to diagnose theme mismatch',
      details: error instanceof Error ? error.message : 'Unknown',
    }, { status: 500 });
  }
}
