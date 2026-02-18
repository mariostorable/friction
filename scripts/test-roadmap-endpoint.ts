import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function testEndpoint() {
  console.log('\n=== Testing Roadmap API Endpoint ===\n');

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  try {
    // This will use the deployed code
    const response = await fetch(`${baseUrl}/api/jira/roadmap-by-account`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        // Note: This will fail auth since we don't have cookies, but we can see if the endpoint exists
      },
    });

    console.log(`Status: ${response.status}`);
    const data = await response.json();

    if (response.status === 401) {
      console.log('✓ Endpoint exists and requires authentication (expected)');
      console.log('  Error:', data.error);
    } else if (response.ok) {
      console.log('✓ Success!');
      console.log(`  Accounts found: ${data.accounts?.length || 0}`);
      console.log(`  Total accounts: ${data.total_accounts || 0}`);

      if (data.accounts && data.accounts.length > 0) {
        console.log('\nTop 5 accounts:');
        data.accounts.slice(0, 5).forEach((acc: any) => {
          console.log(`  - ${acc.account_name}: ${acc.total_issues} tickets`);
        });
      }
    } else {
      console.log('✗ Error');
      console.log('  Response:', JSON.stringify(data, null, 2));
    }
  } catch (error) {
    console.error('Failed to test endpoint:', error);
  }

  // Also check if the fix is deployed by checking the timestamp
  console.log('\n--- Checking Deployment ---');
  console.log('Latest commits:');
  console.log('  037221b2 - Fix account detail page Jira roadmap RLS issue');
  console.log('  038fae2 - Fix roadmap by account RLS issue preventing joins');
  console.log('\nIf the page is still empty, try:');
  console.log('  1. Hard refresh (Ctrl+Shift+R / Cmd+Shift+R)');
  console.log('  2. Check Vercel deployment status');
  console.log('  3. Open browser DevTools Network tab and look for /api/jira/roadmap-by-account request');
}

testEndpoint().catch(console.error);
