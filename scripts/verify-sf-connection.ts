import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function verifyConnection() {
  const { data: integrations } = await supabase
    .from('integrations')
    .select('*')
    .eq('integration_type', 'salesforce')
    .eq('status', 'active')
    .order('connected_at', { ascending: false })
    .limit(1);

  if (!integrations || integrations.length === 0) {
    console.log('❌ No Salesforce integration found');
    return;
  }

  const integration = integrations[0];
  console.log('Integration:', integration.id);
  console.log('Connected:', integration.connected_at);

  // Check for tokens
  const { data: tokens } = await supabase
    .from('encrypted_tokens')
    .select('id')
    .eq('integration_id', integration.id);

  if (tokens && tokens.length > 0) {
    console.log('✅ OAuth tokens stored!');
    console.log('   Token ID:', tokens[0].id);
    console.log('\nYou can now sync Salesforce from Settings');
  } else {
    console.log('❌ No OAuth tokens found');
    console.log('   You need to reconnect Salesforce from Settings');
  }
}

verifyConnection();
