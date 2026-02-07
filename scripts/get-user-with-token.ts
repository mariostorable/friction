import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config({ path: '.env.local' });
config({ path: '.env' });

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data } = await supabase
    .from('oauth_tokens')
    .select('integration_id, integrations!inner(user_id, integration_type)')
    .eq('integrations.integration_type', 'salesforce')
    .limit(1)
    .single();

  if (data) {
    const userId = (data.integrations as any).user_id;
    console.log(userId);
  }
}

main().catch(console.error);
