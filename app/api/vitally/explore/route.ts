import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

// This endpoint helps explore what fields are available in Vitally accounts
export async function GET() {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get a sample of Vitally accounts with their full traits
    const { data: sampleAccounts, error } = await supabase
      .from('vitally_accounts')
      .select('account_name, traits')
      .eq('user_id', user.id)
      .limit(5);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!sampleAccounts || sampleAccounts.length === 0) {
      return NextResponse.json({
        message: 'No Vitally accounts found. Run a sync first.',
        sample: []
      });
    }

    // Extract all unique field names from the traits
    const allFields = new Set<string>();
    const sampleData: any[] = [];

    sampleAccounts.forEach(account => {
      if (account.traits && typeof account.traits === 'object') {
        // Get top-level fields
        Object.keys(account.traits).forEach(key => allFields.add(key));

        // Get nested fields
        if (account.traits.traits && typeof account.traits.traits === 'object') {
          Object.keys(account.traits.traits).forEach(key => allFields.add(`traits.${key}`));
        }
        if (account.traits.health && typeof account.traits.health === 'object') {
          Object.keys(account.traits.health).forEach(key => allFields.add(`health.${key}`));
        }

        sampleData.push({
          accountName: account.account_name,
          sampleData: account.traits
        });
      }
    });

    return NextResponse.json({
      totalAccounts: sampleAccounts.length,
      availableFields: Array.from(allFields).sort(),
      sampleAccounts: sampleData,
    });

  } catch (error) {
    console.error('Vitally explore error:', error);
    return NextResponse.json({
      error: 'Failed to explore Vitally data',
      details: error instanceof Error ? error.message : 'Unknown',
    }, { status: 500 });
  }
}
