import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkMetadata() {
  const { data } = await supabase
    .from('integrations')
    .select('*')
    .eq('integration_type', 'salesforce')
    .limit(1)
    .single();
  
  console.log('Salesforce integration metadata:');
  console.log(JSON.stringify(data?.metadata, null, 2));
}

checkMetadata();
