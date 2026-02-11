import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function triggerJiraSync() {
  console.log('\n=== Triggering Jira Sync ===\n');

  const url = 'http://localhost:3000/api/jira/sync';
  const userId = 'ab953672-7bad-4601-9289-5d766e73fec9';

  console.log(`URL: ${url}`);
  console.log(`User ID: ${userId}\n`);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.CRON_SECRET}`,
        'x-user-id': userId,
        'Content-Type': 'application/json',
      },
    });

    console.log(`Status: ${response.status} ${response.statusText}`);

    const data = await response.json();
    console.log('\nResponse:');
    console.log(JSON.stringify(data, null, 2));

    if (data.success) {
      console.log(`\n✅ Sync completed successfully!`);
      console.log(`   Synced: ${data.synced} issues`);
      console.log(`   Theme links: ${data.links_created}`);
      console.log(`   Account links: ${data.account_links_created}`);
    } else {
      console.log(`\n❌ Sync failed:`, data.error);
    }
  } catch (error) {
    console.error('\n❌ Error triggering sync:', error);
  }
}

triggerJiraSync();
