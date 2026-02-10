import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  try {
    const { data: integrations, error } = await supabase
      .from('integrations')
      .select('id, user_id, integration_type, status, instance_url')
      .eq('integration_type', 'salesforce');

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ integrations });

  } catch (error: any) {
    console.error('Error getting Salesforce user:', error);
    return NextResponse.json(
      { error: 'Failed to get Salesforce user', details: error.message },
      { status: 500 }
    );
  }
}
