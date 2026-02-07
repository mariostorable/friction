import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
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

    // Delete all existing theme links (they were created with wrong theme_keys)
    const { error: deleteError, count } = await supabaseAdmin
      .from('theme_jira_links')
      .delete({ count: 'exact' })
      .eq('user_id', user.id);

    if (deleteError) {
      return NextResponse.json({
        error: 'Failed to delete old theme links',
        details: deleteError.message
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      deleted_links: count,
      message: `Deleted ${count} old theme links. Run sync again to create new links with correct theme_keys.`
    });
  } catch (error) {
    console.error('Cleanup error:', error);
    return NextResponse.json({
      error: 'Failed to cleanup theme links',
      details: error instanceof Error ? error.message : 'Unknown',
    }, { status: 500 });
  }
}
