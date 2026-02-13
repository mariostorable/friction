import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function triggerSync() {
  console.log('\n=== Triggering Jira Sync ===\n');

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  try {
    const response = await fetch(`${baseUrl}/api/jira/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('Sync failed:', error);
      console.log('\n❌ Could not trigger sync via API (authentication required)');
      console.log('\n📋 Please trigger the sync manually from the UI:');
      console.log('   1. Go to http://localhost:3000/dashboard');
      console.log('   2. Click the "Sync Jira" button in the Jira Roadmap section');
      console.log('   3. Wait for the sync to complete\n');
      return;
    }

    const result = await response.json();
    console.log('✅ Sync completed successfully!');
    console.log(`   Issues synced: ${result.synced}`);
    console.log(`   Account links created: ${result.account_links_created}`);
    console.log(`   Theme links created: ${result.links_created}\n`);

  } catch (error) {
    console.error('Error triggering sync:', error);
    console.log('\n📋 Please trigger the sync manually from the UI:');
    console.log('   1. Go to http://localhost:3000/dashboard');
    console.log('   2. Click the "Sync Jira" button in the Jira Roadmap section');
    console.log('   3. Wait for the sync to complete\n');
  }
}

triggerSync();
