/**
 * Manual Jira Resync
 *
 * This script triggers a full Jira sync to re-link tickets with the new
 * direct Case ID matching logic.
 *
 * Run: npx tsx scripts/manual-jira-resync.ts
 */

import { config } from 'dotenv';

config({ path: '.env.local' });

async function main() {
  console.log('🔄 Triggering manual Jira resync...\n');

  // You need to be logged in - use the app's session
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

  console.log(`Calling: ${baseUrl}/api/jira/sync\n`);
  console.log('⚠️  This requires an active session. Please run this from the browser console instead:\n');
  console.log('```javascript');
  console.log('fetch("/api/jira/sync", { method: "POST" })');
  console.log('  .then(r => r.json())');
  console.log('  .then(data => console.log(data));');
  console.log('```\n');
  console.log('Or visit your app and manually click "Sync Jira" if you have a sync button.\n');
}

main().catch(console.error);
