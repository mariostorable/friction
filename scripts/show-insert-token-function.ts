import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function showFunction() {
  // Query pg_proc to get function definition
  const { data, error } = await supabase.rpc('exec_sql', {
    query: `
      SELECT
        pg_get_functiondef(p.oid) as definition
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public'
        AND p.proname = 'insert_encrypted_token';
    `
  });

  if (error) {
    console.log('Cannot query function (expected - exec_sql likely does not exist)');
    console.log('Checking if function exists another way...');

    // Try to call it with invalid data to see the error
    const { error: testError } = await supabase.rpc('insert_encrypted_token', {
      p_integration_id: '00000000-0000-0000-0000-000000000000',
      p_access_token: 'test',
      p_refresh_token: 'test',
      p_token_type: 'Bearer',
      p_expires_at: new Date().toISOString(),
      p_encryption_key: 'test_key_at_least_32_characters_long'
    });

    if (testError) {
      console.log('\nFunction exists but returned error (expected):');
      console.log(testError.message);

      if (testError.message.includes('oauth_tokens')) {
        console.log('\n✓ Function writes to oauth_tokens table');
      } else if (testError.message.includes('encrypted_tokens')) {
        console.log('\n✓ Function writes to encrypted_tokens table');
      }
    }
    return;
  }

  console.log('Function definition:');
  console.log(data);
}

showFunction();
