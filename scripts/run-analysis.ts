import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

async function runAnalysis(numAccounts: number = 3) {
  const baseUrl = 'https://friction-intelligence.vercel.app';
  const results = [];

  console.log(`\n🔄 Running friction analysis for ${numAccounts} accounts...\n`);

  for (let i = 0; i < numAccounts; i++) {
    console.log(`\n--- Analysis ${i + 1}/${numAccounts} ---`);

    try {
      const response = await fetch(`${baseUrl}/api/cron/analyze-portfolio`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        console.error(`❌ Request failed with status ${response.status}`);
        const text = await response.text();
        console.error('Response:', text.substring(0, 500));
        continue;
      }

      const data = await response.json();

      if (data.results && data.results.length > 0) {
        const result = data.results[0];
        results.push(result);

        const statusEmoji = result.status === 'success' ? '✅' :
                          result.status === 'skipped' ? '⏭️' :
                          result.status === 'no_cases' ? '📭' : '❌';

        console.log(`${statusEmoji} ${result.account || 'Unknown Account'}`);
        console.log(`   Status: ${result.status}`);
        if (result.ofi !== undefined) console.log(`   OFI Score: ${result.ofi}`);
        if (result.cases !== undefined) console.log(`   Cases Analyzed: ${result.cases}`);
        if (result.analyzed !== undefined) console.log(`   Friction Cards: ${result.analyzed}`);
        if (result.reason) console.log(`   Reason: ${result.reason}`);
      }

      // Wait 2 seconds between requests to avoid overwhelming the API
      if (i < numAccounts - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

    } catch (error) {
      console.error(`❌ Error during analysis ${i + 1}:`, error);
    }
  }

  console.log('\n\n=== ANALYSIS COMPLETE ===\n');
  console.log(`Total accounts processed: ${results.length}`);

  const successful = results.filter(r => r.status === 'success');
  const skipped = results.filter(r => r.status === 'skipped');
  const noCases = results.filter(r => r.status === 'no_cases');
  const failed = results.filter(r => r.status === 'failed' || r.status === 'error');

  console.log(`✅ Successful: ${successful.length}`);
  console.log(`⏭️  Skipped (already analyzed today): ${skipped.length}`);
  console.log(`📭 No cases: ${noCases.length}`);
  console.log(`❌ Failed: ${failed.length}`);

  if (successful.length > 0) {
    console.log('\n📊 Successfully Analyzed Accounts:');
    successful.forEach(r => {
      console.log(`   • ${r.account}: OFI ${r.ofi} (${r.analyzed} friction cards from ${r.cases} cases)`);
    });
  }

  console.log('\n');
}

// Run for 3 accounts
runAnalysis(3).catch(console.error);
