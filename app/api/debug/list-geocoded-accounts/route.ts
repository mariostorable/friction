import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  try {
    const { data: accounts, error } = await supabase
      .from('accounts')
      .select('id, name, property_address_city, property_address_state, latitude, longitude, vertical')
      .eq('status', 'active')
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)
      .order('name')
      .limit(50);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      count: accounts.length,
      accounts: accounts.map(acc => ({
        name: acc.name,
        location: `${acc.property_address_city}, ${acc.property_address_state}`,
        vertical: acc.vertical
      }))
    });

  } catch (error: any) {
    console.error('Error listing accounts:', error);
    return NextResponse.json(
      { error: 'Failed to list accounts', details: error.message },
      { status: 500 }
    );
  }
}
