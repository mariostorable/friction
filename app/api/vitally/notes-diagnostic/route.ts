import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { getDecryptedToken } from '@/lib/encryption';

export const dynamic = 'force-dynamic';

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

    // Get all matched Vitally accounts
    const { data: matchedAccounts } = await supabaseAdmin
      .from('vitally_accounts')
      .select('*')
      .eq('user_id', user.id)
      .not('account_id', 'is', null);

    if (!matchedAccounts || matchedAccounts.length === 0) {
      return NextResponse.json({
        error: 'No matched Vitally accounts found'
      }, { status: 404 });
    }

    // Get Vitally integration
    const { data: integration } = await supabaseAdmin
      .from('integrations')
      .select('*')
      .eq('user_id', user.id)
      .eq('integration_type', 'vitally')
      .eq('status', 'active')
      .single();

    if (!integration) {
      return NextResponse.json({ error: 'Vitally not connected' }, { status: 400 });
    }

    // Get decrypted API key
    const tokenData = await getDecryptedToken(supabaseAdmin, integration.id);
    if (!tokenData?.access_token) {
      return NextResponse.json({ error: 'Vitally credentials not found' }, { status: 400 });
    }

    const apiKey = tokenData.access_token;
    const authHeader = `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`;

    // Check notes in database
    const { data: existingNotes } = await supabaseAdmin
      .from('raw_inputs')
      .select('*')
      .eq('user_id', user.id)
      .eq('source_type', 'vitally_note');

    console.log(`Found ${existingNotes?.length || 0} Vitally notes in database`);

    // Check first 3 matched accounts for notes in Vitally API
    const notesSamples = [];
    for (let i = 0; i < Math.min(3, matchedAccounts.length); i++) {
      const account = matchedAccounts[i];
      const facilities = account.traits?.facilities || [{ id: account.vitally_account_id }];

      console.log(`Checking notes for account: ${account.account_name} (${facilities.length} facilities)`);

      for (const facility of facilities.slice(0, 2)) { // Check first 2 facilities
        try {
          const notesUrl = `${integration.instance_url}/resources/notes?accountId=${facility.id}&limit=10`;
          console.log(`Fetching from: ${notesUrl}`);

          const notesResponse = await fetch(notesUrl, {
            method: 'GET',
            headers: {
              'Authorization': authHeader,
              'Content-Type': 'application/json',
            },
          });

          if (notesResponse.ok) {
            const notesData = await notesResponse.json();
            const notes = notesData.results || [];

            notesSamples.push({
              account_name: account.account_name,
              facility_id: facility.id,
              facility_name: facility.name || 'Unknown',
              notes_found: notes.length,
              sample_note: notes[0] ? {
                title: notes[0].title,
                has_body: !!notes[0].body,
                created_at: notes[0].createdAt,
                author: notes[0].authorName
              } : null
            });
          } else {
            const errorText = await notesResponse.text();
            notesSamples.push({
              account_name: account.account_name,
              facility_id: facility.id,
              error: `API error: ${notesResponse.status} - ${errorText}`
            });
          }
        } catch (error) {
          notesSamples.push({
            account_name: account.account_name,
            facility_id: facility.id,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      summary: {
        matched_accounts: matchedAccounts.length,
        notes_in_database: existingNotes?.length || 0,
        accounts_sampled: Math.min(3, matchedAccounts.length),
      },
      sample_accounts: matchedAccounts.slice(0, 3).map(acc => ({
        account_name: acc.account_name,
        salesforce_account_id: acc.salesforce_account_id,
        matched_to: acc.account_id,
        facility_count: acc.traits?.facilityCount || 1,
        facilities: acc.traits?.facilities?.slice(0, 3) || []
      })),
      notes_api_samples: notesSamples,
      database_notes_sample: existingNotes?.slice(0, 5).map(note => ({
        account_id: note.account_id,
        source_id: note.source_id,
        created_at: note.created_at,
        text_preview: note.text_content?.slice(0, 100) + '...',
        metadata: note.metadata
      }))
    });

  } catch (error) {
    console.error('Notes diagnostic error:', error);
    return NextResponse.json({
      error: 'Diagnostic failed',
      details: error instanceof Error ? error.message : 'Unknown',
    }, { status: 500 });
  }
}
