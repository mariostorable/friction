import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function testTokenStorage() {
  console.log('Testing token storage...\n');

  // Get the existing integration
  const { data: integrations } = await supabase
    .from('integrations')
    .select('*')
    .eq('integration_type', 'salesforce')
    .eq('status', 'active')
    .order('connected_at', { ascending: false })
    .limit(1);

  if (!integrations || integrations.length === 0) {
    console.log('No Salesforce integration found');
    return;
  }

  const integration = integrations[0];
  console.log('Found integration:', integration.id);
  console.log('Connected at:', integration.connected_at);
  console.log('Last synced:', integration.last_synced_at || 'never');

  // Try to store a test token
  console.log('\nAttempting to store test token...');

  const encryptionKey = process.env.ENCRYPTION_KEY!;

  if (!encryptionKey) {
    console.log('❌ ENCRYPTION_KEY not found in environment');
    return;
  }

  console.log('✓ ENCRYPTION_KEY found:', encryptionKey.substring(0, 10) + '...');

  const { data, error } = await supabase.rpc('insert_encrypted_token', {
    p_integration_id: integration.id,
    p_access_token: 'test_access_token_12345',
    p_refresh_token: 'test_refresh_token_67890',
    p_token_type: 'Bearer',
    p_expires_at: new Date(Date.now() + 7200000).toISOString(),
    p_encryption_key: encryptionKey
  });

  if (error) {
    console.log('❌ Failed to store token:', error.message);
    return;
  }

  console.log('✓ Token stored successfully! Token ID:', data);

  // Try to retrieve it
  console.log('\nAttempting to retrieve token...');

  const { data: retrievedToken, error: retrieveError } = await supabase.rpc(
    'get_decrypted_token',
    {
      p_integration_id: integration.id,
      p_encryption_key: encryptionKey
    }
  );

  if (retrieveError) {
    console.log('❌ Failed to retrieve token:', retrieveError.message);
    return;
  }

  if (!retrievedToken || retrievedToken.length === 0) {
    console.log('❌ No token found');
    return;
  }

  const token = retrievedToken[0];
  console.log('✓ Token retrieved successfully!');
  console.log('  Access token:', token.access_token);
  console.log('  Refresh token:', token.refresh_token);
  console.log('  Token type:', token.token_type);
  console.log('  Expires at:', token.expires_at);

  // Clean up test token
  console.log('\nCleaning up test token...');
  await supabase.from('encrypted_tokens').delete().eq('id', data);
  console.log('✓ Test token deleted');

  console.log('\n✅ Token storage is working correctly!');
  console.log('Next step: Reconnect Salesforce in the app');
}

testTokenStorage().catch(console.error);
