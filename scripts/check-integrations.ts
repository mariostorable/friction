import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkIntegrations() {
  const { data, error } = await supabase.from('integrations').select('*');
  
  if (error) {
    console.log('Error:', error);
    return;
  }
  
  console.log('Integrations found:', data?.length || 0);
  
  data?.forEach(integration => {
    console.log('\n---');
    console.log('Type:', integration.integration_type);
    console.log('Status:', integration.status);
    console.log('Instance URL:', integration.instance_url);
    console.log('Has metadata:', !!integration.metadata);
    console.log('Has access_token:', !!integration.metadata?.access_token);
    console.log('Token preview:', integration.metadata?.access_token?.substring(0, 20) + '...');
  });
}

checkIntegrations();
