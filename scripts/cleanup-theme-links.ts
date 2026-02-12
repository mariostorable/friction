/**
 * Remove old broad theme_association links before re-syncing with new logic
 */
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function cleanupThemeLinks() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  console.log('Cleaning up old broad theme_association links...\n');

  // Get current link counts
  const { data: beforeLinks } = await supabase
    .from('account_jira_links')
    .select('match_type');

  const beforeCounts: Record<string, number> = {};
  beforeLinks?.forEach(link => {
    beforeCounts[link.match_type] = (beforeCounts[link.match_type] || 0) + 1;
  });

  console.log('Links before cleanup:');
  Object.entries(beforeCounts).forEach(([type, count]) => {
    console.log(`  ${type}: ${count}`);
  });
  console.log(`  TOTAL: ${beforeLinks?.length || 0}\n`);

  // Delete all theme_association links (the old broad links)
  const { error: deleteError, count } = await supabase
    .from('account_jira_links')
    .delete()
    .eq('match_type', 'theme_association');

  if (deleteError) {
    console.error('❌ Failed to delete links:', deleteError);
    return;
  }

  console.log(`✅ Deleted ${count || 0} theme_association links\n`);

  // Get updated counts
  const { data: afterLinks } = await supabase
    .from('account_jira_links')
    .select('match_type');

  const afterCounts: Record<string, number> = {};
  afterLinks?.forEach(link => {
    afterCounts[link.match_type] = (afterCounts[link.match_type] || 0) + 1;
  });

  console.log('Links after cleanup:');
  Object.entries(afterCounts).forEach(([type, count]) => {
    console.log(`  ${type}: ${count}`);
  });
  console.log(`  TOTAL: ${afterLinks?.length || 0}\n`);

  console.log('✅ Cleanup complete!');
  console.log('\nNext steps:');
  console.log('1. Go to the dashboard');
  console.log('2. Click "Sync Jira" to create new links with improved logic');
  console.log('3. New links will require account name to appear in ticket');
}

cleanupThemeLinks().catch(console.error);
