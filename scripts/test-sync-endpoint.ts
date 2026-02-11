/**
 * Test if the Salesforce sync endpoint is responding
 */

async function testSyncEndpoint() {
  const url = 'https://friction-intelligence.vercel.app/api/salesforce/sync';

  console.log('Testing sync endpoint:', url);
  console.log('This will attempt to sync (requires valid Salesforce connection)\n');

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    console.log('Response status:', response.status);
    console.log('Response OK:', response.ok);

    const data = await response.json();

    if (response.ok) {
      console.log('\n✓ Sync endpoint is working!');
      console.log('Synced:', data.synced, 'accounts');
      if (data.portfolios) {
        console.log('Portfolios:', JSON.stringify(data.portfolios, null, 2));
      }
    } else {
      console.log('\n✗ Sync failed:');
      console.log('Error:', data.error);
      if (data.details) {
        console.log('Details:', data.details);
      }
    }
  } catch (error) {
    console.error('\n✗ Network error:', error instanceof Error ? error.message : error);
    console.log('\nThis could mean:');
    console.log('- Vercel is still deploying');
    console.log('- The endpoint is not responding');
    console.log('- There\'s a CORS issue (shouldn\'t happen with same origin)');
  }
}

testSyncEndpoint().catch(console.error);
