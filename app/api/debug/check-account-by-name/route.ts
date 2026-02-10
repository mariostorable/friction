import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const name = searchParams.get('name');

    if (!name) {
      return NextResponse.json({ error: 'name parameter required' }, { status: 400 });
    }

    const { data: accounts, error } = await supabase
      .from('accounts')
      .select('id, salesforce_id, name, property_address_street, property_address_city, property_address_state, latitude, longitude, arr, vertical')
      .ilike('name', `%${name}%`)
      .order('name');

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      count: accounts.length,
      accounts: accounts.map(acc => ({
        name: acc.name,
        salesforce_id: acc.salesforce_id,
        address: acc.property_address_street
          ? `${acc.property_address_street}, ${acc.property_address_city}, ${acc.property_address_state}`
          : null,
        has_address: !!acc.property_address_street,
        has_coordinates: !!(acc.latitude && acc.longitude),
        coordinates: acc.latitude && acc.longitude ? `${acc.latitude}, ${acc.longitude}` : null,
        arr: acc.arr,
        vertical: acc.vertical
      }))
    });

  } catch (error: any) {
    console.error('Error checking account:', error);
    return NextResponse.json(
      { error: 'Failed to check account', details: error.message },
      { status: 500 }
    );
  }
}
