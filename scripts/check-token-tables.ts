import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkTables() {
  console.log('Checking for token storage tables...\n');

  // Check for encrypted_tokens table
  const { data: encryptedTokens, error: e1 } = await supabase
    .from('encrypted_tokens')
    .select('count')
    .limit(1);

  console.log('encrypted_tokens table:', e1 ? `ERROR: ${e1.message}` : 'EXISTS');

  // Check for oauth_tokens table
  const { data: oauthTokens, error: e2 } = await supabase
    .from('oauth_tokens')
    .select('count')
    .limit(1);

  console.log('oauth_tokens table:', e2 ? `ERROR: ${e2.message}` : 'EXISTS');

  // Check for insert_encrypted_token function
  const { data: func, error: e3 } = await supabase.rpc('insert_encrypted_token', {
    p_integration_id: '00000000-0000-0000-0000-000000000000',
    p_access_token: 'test',
    p_refresh_token: 'test',
    p_token_type: 'Bearer',
    p_expires_at: new Date().toISOString(),
    p_encryption_key: 'test_key_at_least_32_characters_long'
  });

  console.log('insert_encrypted_token function:', e3 ? `ERROR: ${e3.message}` : 'EXISTS');
}

checkTables().catch(console.error);
