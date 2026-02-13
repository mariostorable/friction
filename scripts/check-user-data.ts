import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function checkUserData() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  );

  console.log('\n=== User Data Check ===\n');

  // Get all users
  const { data: { users } } = await supabase.auth.admin.listUsers();
  console.log(`Total users: ${users?.length || 0}\n`);

  for (const user of users || []) {
    console.log(`User: ${user.email}`);
    console.log(`  ID: ${user.id}`);

    // Check their data
    const { count: accountCount } = await supabase
      .from('accounts')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);

    const { count: caseCount } = await supabase
      .from('raw_inputs')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);

    const { count: jiraCount } = await supabase
      .from('jira_issues')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);

    const { count: linkCount } = await supabase
      .from('account_jira_links')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);

    console.log(`  Accounts: ${accountCount}`);
    console.log(`  Cases: ${caseCount}`);
    console.log(`  Jira issues: ${jiraCount}`);
    console.log(`  Account-Jira links: ${linkCount}\n`);
  }
}

checkUserData().catch(console.error);
