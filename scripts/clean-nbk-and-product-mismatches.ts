import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function cleanMismatches() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  );

  const userId = 'ab953672-7bad-4601-9289-5d766e73fec9';

  console.log('\n=== Cleaning NBK and Product Mismatch Links ===\n');

  // Get all account_jira_links
  const { data: links } = await supabase
    .from('account_jira_links')
    .select('id, account_id, jira_issue_id, match_type, accounts(id, products), jira_issues(id, jira_key)')
    .eq('user_id', userId);

  console.log(`Checking ${links?.length || 0} account-jira links\n`);

  if (!links || links.length === 0) {
    console.log('No links to check');
    return;
  }

  const linksToDelete: string[] = [];
  const reasons = new Map<string, number>();

  links.forEach((link: any) => {
    const account = link.accounts;
    const issue = link.jira_issues;

    if (!account || !issue) return;

    const accountProducts = (account.products || '').toLowerCase();
    const jiraProject = issue.jira_key.split('-')[0].toLowerCase();

    // Marine/RV projects
    const isMarineProject = ['mreq', 'tops', 'bzd', 'easy', 'nbk', 'mdev', 'esst'].includes(jiraProject);
    const isMarineAccount = accountProducts.includes('dockwa') || accountProducts.includes('marina') || accountProducts.includes('molo');

    // Storage projects
    const isStorageProject = ['edge', 'sl', 'slt', 'pay', 'crm', 'data', 'bugs'].includes(jiraProject);
    const isStorageAccount = accountProducts.includes('edge') || accountProducts.includes('sitelink') || accountProducts.includes('storable');

    // Product-specific mismatches
    const isEdgeTicket = jiraProject === 'edge';
    const isSitelinkTicket = ['sl', 'slt'].includes(jiraProject);
    const hasEdge = accountProducts.includes('edge');
    const hasSitelink = accountProducts.includes('sitelink');

    let reason = '';

    // Check cross-industry
    if (isMarineProject && isStorageAccount) {
      reason = `Marine ticket (${jiraProject.toUpperCase()}) → Storage account`;
      linksToDelete.push(link.id);
    } else if (isStorageProject && isMarineAccount) {
      reason = `Storage ticket (${jiraProject.toUpperCase()}) → Marine account`;
      linksToDelete.push(link.id);
    }
    // Check product mismatches (only for theme_association links)
    else if (link.match_type === 'theme_association' && isEdgeTicket && !hasEdge) {
      reason = `EDGE ticket → Non-EDGE account (has: ${accountProducts || 'none'})`;
      linksToDelete.push(link.id);
    } else if (link.match_type === 'theme_association' && isSitelinkTicket && !hasSitelink) {
      reason = `SiteLink ticket → Non-SiteLink account (has: ${accountProducts || 'none'})`;
      linksToDelete.push(link.id);
    }

    if (reason) {
      reasons.set(reason, (reasons.get(reason) || 0) + 1);
      if (linksToDelete.length <= 10) {
        console.log(`  ❌ ${issue.jira_key} → Account ${account.id.substring(0, 8)}: ${reason}`);
      }
    }
  });

  if (linksToDelete.length === 0) {
    console.log('✓ No mismatched links found!');
    return;
  }

  console.log(`\n⚠️  Found ${linksToDelete.length} mismatched links to delete\n`);

  console.log('Breakdown by reason:');
  Array.from(reasons.entries()).forEach(([reason, count]) => {
    console.log(`  ${reason}: ${count}`);
  });

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

  console.log(`\n✅ Deleted ${linksToDelete.length} mismatched links`);
  console.log('\nNext steps:');
  console.log('1. Wait for Vercel to deploy the updated filtering code');
  console.log('2. Run Jira sync again from the dashboard');
  console.log('3. Verify:');
  console.log('   - No NBK tickets on storage accounts');
  console.log('   - No EDGE tickets on SiteLink-only accounts');
  console.log('   - No SL tickets on EDGE-only accounts');
}

cleanMismatches().catch(console.error);
