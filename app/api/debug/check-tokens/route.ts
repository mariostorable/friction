import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  // Simple authentication check
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Check the state of oauth_tokens table
    const { data: tokens, error } = await supabase
      .from('oauth_tokens')
      .select(`
        id,
        integration_id,
        token_type,
        created_at,
        updated_at,
        integrations!inner(user_id, integration_type)
      `);

    if (error) {
      console.error('Error fetching tokens:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Get raw token data to check if encrypted columns exist
    const { data: rawCheck, error: rawError } = await supabase.rpc('check_encryption_status');

    if (rawError) {
      console.error('Error checking encryption status:', rawError);
    }

    const encryptionStatus = Array.isArray(rawCheck) ? rawCheck[0] : rawCheck;

    // Try to query the actual column structure
    const { data: columnCheck, error: columnError } = await supabase
      .from('oauth_tokens')
      .select('*')
      .limit(1);

    return NextResponse.json({
      success: true,
      total_tokens: tokens?.length || 0,
      encryption_status: encryptionStatus || 'Could not retrieve',
      tokens: tokens?.map(t => ({
        id: t.id,
        integration_type: (t.integrations as any).integration_type,
        user_id: (t.integrations as any).user_id,
        token_type: t.token_type,
        created_at: t.created_at,
        updated_at: t.updated_at,
      })),
      sample_columns: columnCheck && columnCheck[0] ? Object.keys(columnCheck[0]) : [],
      encryption_key_configured: !!process.env.ENCRYPTION_KEY,
      encryption_key_length: process.env.ENCRYPTION_KEY?.length || 0,
    });

  } catch (error) {
    console.error('Token check failed:', error);
    return NextResponse.json({
      error: 'Failed to check tokens',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
