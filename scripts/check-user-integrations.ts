import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkUser() {
  const { data: profiles } = await supabase.from('profiles').select('id, email');
  console.log('Users found:', profiles?.length || 0);

  if (profiles && profiles.length > 0) {
    const user = profiles[0];
    console.log('User:', user.email);
    console.log('User ID:', user.id);

    console.log('\nChecking Salesforce integrations for this user...');

    const { data: integrations } = await supabase
      .from('integrations')
      .select('*')
      .eq('user_id', user.id)
      .eq('integration_type', 'salesforce')
      .eq('status', 'active')
      .order('connected_at', { ascending: false });

    console.log('Salesforce integrations:', integrations?.length || 0);

    if (integrations && integrations.length > 0) {
      integrations.forEach((i, index) => {
        console.log(`\n${index + 1}. Integration ID: ${i.id}`);
        console.log(`   Connected: ${i.connected_at}`);
        console.log(`   Last Synced: ${i.last_synced_at || 'never'}`);
        console.log(`   Instance: ${i.instance_url}`);
      });

      // Check for encrypted tokens
      console.log('\nChecking for encrypted tokens...');
      const { data: tokens } = await supabase
        .from('encrypted_tokens')
        .select('id, integration_id')
        .in('integration_id', integrations.map(i => i.id));

      console.log('Encrypted token records:', tokens?.length || 0);
      tokens?.forEach(t => {
        console.log(`  Token for integration ${t.integration_id}: exists`);
      });
    } else {
      console.log('\nNo Salesforce integrations found for this user!');
      console.log('The user needs to connect Salesforce from Settings.');
    }
  }
}

checkUser().catch(console.error);
