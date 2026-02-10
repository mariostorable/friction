import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

/**
 * Test endpoint to verify vitally_note source_type is allowed
 * This will attempt to insert a test record with source_type='vitally_note'
 * If it fails, you need to run the migration SQL in Supabase dashboard
 */
export async function GET() {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get admin client
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    console.log('Testing vitally_note source_type...');

    // Try to insert a test record with vitally_note source_type
    const testRecord = {
      user_id: user.id,
      account_id: null,
      source_type: 'vitally_note',
      source_id: 'migration-test-' + Date.now(),
      source_url: 'https://test.com',
      text_content: 'Test migration record',
      metadata: { test: true },
      processed: true
    };

    const { data: testInsert, error: testError } = await supabaseAdmin
      .from('raw_inputs')
      .insert(testRecord)
      .select();

    if (testError) {
      console.error('Test insert failed:', testError);
      return NextResponse.json({
        success: false,
        error: 'vitally_note source_type is NOT allowed',
        details: testError.message,
        code: testError.code,
        hint: testError.hint,
        instructions: 'Run the SQL migration in Supabase Dashboard → SQL Editor. Check supabase/migrations/20260207_add_vitally_note_source_type.sql'
      }, { status: 200 }); // Return 200 so we can see the error details
    }

    // Clean up test record
    if (testInsert && testInsert.length > 0) {
      await supabaseAdmin
        .from('raw_inputs')
        .delete()
        .eq('id', testInsert[0].id);

      console.log('Test record inserted and deleted successfully');
    }

    return NextResponse.json({
      success: true,
      message: 'vitally_note source_type is working! You can now sync Vitally notes.'
    });

  } catch (error) {
    console.error('Test error:', error);
    return NextResponse.json({
      error: 'Test failed',
      details: error instanceof Error ? error.message : 'Unknown'
    }, { status: 500 });
  }
}
