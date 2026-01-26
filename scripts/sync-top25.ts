import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function syncTop25() {
  const { data: profiles } = await supabase.from('profiles').select('id').limit(1);
  if (!profiles || profiles.length === 0) {
    console.error('No user found');
    return;
  }

  const userId = profiles[0].id;

  const { data: portfolio } = await supabase
    .from('portfolios')
    .select('account_ids')
    .eq('user_id', userId)
    .eq('portfolio_type', 'top_25')
    .single();

  if (!portfolio?.account_ids) {
    console.error('No Top 25 portfolio found');
    return;
  }

  console.log(`Found ${portfolio.account_ids.length} accounts to analyze`);

  for (let i = 0; i < portfolio.account_ids.length; i++) {
    const accountId = portfolio.account_ids[i];
    console.log(`\n[${i + 1}/${portfolio.account_ids.length}] Analyzing ${accountId}...`);

    try {
      const casesRes = await fetch('https://friction-intelligence.vercel.app/api/salesforce/sync-cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId }),
      });
      const casesResult = await casesRes.json();
      console.log(`  ✓ Cases: ${casesResult.synced || 0}`);

      const analyzeRes = await fetch('https://friction-intelligence.vercel.app/api/analyze-friction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId }),
      });
      const analyzeResult = await analyzeRes.json();
      console.log(`  ✓ Friction: ${analyzeResult.analyzed || 0}`);

      const ofiRes = await fetch('https://friction-intelligence.vercel.app/api/calculate-ofi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId }),
      });
      const ofiResult = await ofiRes.json();
      console.log(`  ✓ OFI: ${ofiResult.ofi_score || 0}`);

    } catch (error) {
      console.error(`  ✗ Failed:`, error);
    }
  }

  console.log('\n✅ Done!');
}

syncTop25();
