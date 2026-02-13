import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function triggerJiraResync() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  );

  // Get the user ID (assuming first user)
  const { data: { users } } = await supabase.auth.admin.listUsers();
  const userId = users?.[0]?.id;

  if (!userId) {
    console.error('No user found');
    return;
  }

  console.log('\n🔄 Triggering Jira Re-sync...\n');
  console.log('This will use the improved matching logic:');
  console.log('  ✓ Salesforce Case ID matching (primary method)');
  console.log('  ✓ Semicolon-separated client names (if available)');
  console.log('  ✓ Better account name word matching\n');

  // Trigger the sync
  const response = await fetch('http://localhost:3000/api/jira/sync', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.CRON_SECRET}`,
      'x-user-id': userId
    }
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('❌ Sync failed:', error);
    return;
  }

  const result = await response.json();
  console.log('✅ Sync completed successfully!\n');
  console.log('Results:');
  console.log(`  Issues synced: ${result.synced || 0}`);
  console.log(`  Theme links created: ${result.themeLinks || 0}`);
  console.log(`  Account links created: ${result.accountLinks || 0}`);

  if (result.directLinks) {
    console.log(`  Direct Case ID links: ${result.directLinks}`);
  }
  if (result.clientFieldLinks) {
    console.log(`  Client field links: ${result.clientFieldLinks}`);
  }
}

triggerJiraResync().catch(console.error);
