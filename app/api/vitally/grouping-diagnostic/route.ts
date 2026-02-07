import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export async function GET() {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get all Vitally accounts with their organization grouping
    const { data: vitallyAccounts } = await supabase
      .from('vitally_accounts')
      .select('*')
      .eq('user_id', user.id)
      .order('account_name');

    if (!vitallyAccounts || vitallyAccounts.length === 0) {
      return NextResponse.json({
        error: 'No Vitally accounts found. Run sync first.'
      }, { status: 404 });
    }

    // Get note counts per account
    const { data: noteCounts } = await supabase
      .from('raw_inputs')
      .select('account_id')
      .eq('user_id', user.id)
      .eq('source_type', 'vitally_note');

    const noteCountByAccount: Record<string, number> = {};
    noteCounts?.forEach(note => {
      noteCountByAccount[note.account_id] = (noteCountByAccount[note.account_id] || 0) + 1;
    });

    // Group accounts for analysis
    const groupedAccounts: any[] = [];
    const unmatchedAccounts: any[] = [];

    vitallyAccounts.forEach(vAccount => {
      const record = {
        corporate_name: vAccount.account_name,
        salesforce_account_id: vAccount.salesforce_account_id,
        matched_to_salesforce: !!vAccount.account_id,
        salesforce_account_name: vAccount.account_id ? 'Matched' : 'Not matched',
        facility_count: vAccount.traits?.facilityCount || 1,
        facilities: vAccount.traits?.facilities || [],
        organization_id: vAccount.traits?.organizationId,
        vitally_notes_synced: vAccount.account_id ? (noteCountByAccount[vAccount.account_id] || 0) : 0,
        health_score: vAccount.health_score,
        nps_score: vAccount.nps_score,
      };

      if (vAccount.account_id) {
        groupedAccounts.push(record);
      } else {
        unmatchedAccounts.push(record);
      }
    });

    // Get top 10 accounts by note count
    const topAccountsByNotes = groupedAccounts
      .sort((a, b) => b.vitally_notes_synced - a.vitally_notes_synced)
      .slice(0, 10);

    return NextResponse.json({
      success: true,
      summary: {
        total_organizations: vitallyAccounts.length,
        matched_to_salesforce: groupedAccounts.length,
        unmatched: unmatchedAccounts.length,
        total_notes_synced: Object.values(noteCountByAccount).reduce((a, b) => a + b, 0),
        accounts_with_notes: Object.keys(noteCountByAccount).length,
      },
      top_accounts_by_notes: topAccountsByNotes,
      sample_matched: groupedAccounts.slice(0, 5),
      sample_unmatched: unmatchedAccounts.slice(0, 5),
    });

  } catch (error) {
    console.error('Grouping diagnostic error:', error);
    return NextResponse.json({
      error: 'Diagnostic failed',
      details: error instanceof Error ? error.message : 'Unknown',
    }, { status: 500 });
  }
}
