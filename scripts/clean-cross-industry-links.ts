import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function cleanCrossIndustryLinks() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  );

  const userId = 'ab953672-7bad-4601-9289-5d766e73fec9';

  console.log('\n=== Cleaning Cross-Industry Jira Links ===\n');

  // Get all account_jira_links with theme_association (these are the ones that need filtering)
  const { data: links } = await supabase
    .from('account_jira_links')
    .select('id, account_id, jira_issue_id, match_type, accounts(id, products), jira_issues(id, jira_key)')
    .eq('user_id', userId)
    .eq('match_type', 'theme_association');

  console.log(`Found ${links?.length || 0} theme_association links to check\n`);

  if (!links || links.length === 0) {
    console.log('No links to clean');
    return;
  }

  const linksToDelete: string[] = [];

  links.forEach((link: any) => {
    const account = link.accounts;
    const issue = link.jira_issues;

    if (!account || !issue) return;

    const accountProducts = (account.products || '').toLowerCase();
    const jiraProject = issue.jira_key.split('-')[0].toLowerCase();

    // Marine projects
    const isMarineProject = ['mreq', 'tops', 'bzd', 'easy'].includes(jiraProject);
    const isMarineAccount = accountProducts.includes('dockwa') || accountProducts.includes('marina');

    // Storage projects
    const isStorageProject = ['edge', 'sl', 'slt', 'pay', 'crm', 'data', 'bugs', 'nbk', 'esst', 'mdev', 'cpbug', 'pol', 'sft', 'wa'].includes(jiraProject);
    const isStorageAccount = accountProducts.includes('edge') || accountProducts.includes('sitelink') || accountProducts.includes('storable');

    // Check for cross-industry mismatch
    const isCrossIndustry = (isMarineProject && isStorageAccount) || (isStorageProject && isMarineAccount);

    if (isCrossIndustry) {
      linksToDelete.push(link.id);
      console.log(`  ❌ Cross-industry: ${issue.jira_key} (${isMarineProject ? 'marine' : 'storage'}) → Account ${account.id.substring(0, 8)} (${isStorageAccount ? 'storage' : 'marine'})`);
    }
  });

  if (linksToDelete.length === 0) {
    console.log('✓ No cross-industry links found!');
    return;
  }

  console.log(`\n⚠️  Found ${linksToDelete.length} cross-industry links to delete`);
  console.log('\nDeleting bad links...');

  // Delete in batches of 100
  for (let i = 0; i < linksToDelete.length; i += 100) {
    const batch = linksToDelete.slice(i, i + 100);
    const { error } = await supabase
      .from('account_jira_links')
      .delete()
      .in('id', batch);

    if (error) {
      console.error(`Error deleting batch ${i / 100 + 1}:`, error.message);
    } else {
      console.log(`  Deleted batch ${i / 100 + 1} (${batch.length} links)`);
    }
  }

  console.log(`\n✅ Deleted ${linksToDelete.length} cross-industry links`);
  console.log('\nNext steps:');
  console.log('1. Wait for Vercel to finish deploying');
  console.log('2. Run Jira sync again from the dashboard');
  console.log('3. The sync will recreate links with proper filtering');
}

cleanCrossIndustryLinks().catch(console.error);
