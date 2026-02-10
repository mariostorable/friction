import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  try {
    const salesforceIds = ['0010y00001kPeJmAAK', '001C000001HOz9tIAD'];

    const { data: accounts, error } = await supabase
      .from('accounts')
      .select('id, salesforce_id, name, property_address_street, property_address_city, property_address_state, billing_address_street, billing_address_city, billing_address_state')
      .in('salesforce_id', salesforceIds);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      count: accounts.length,
      accounts: accounts.map(acc => ({
        name: acc.name,
        salesforce_id: acc.salesforce_id,
        property_address: acc.property_address_street
          ? `${acc.property_address_street}, ${acc.property_address_city}, ${acc.property_address_state}`
          : null,
        billing_address: acc.billing_address_street
          ? `${acc.billing_address_street}, ${acc.billing_address_city}, ${acc.billing_address_state}`
          : null,
        has_address: !!(acc.property_address_street || acc.billing_address_street)
      }))
    });

  } catch (error: any) {
    console.error('Error checking accounts:', error);
    return NextResponse.json(
      { error: 'Failed to check accounts', details: error.message },
      { status: 500 }
    );
  }
}
