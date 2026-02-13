import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function investigate() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  );

  const userId = 'ab953672-7bad-4601-9289-5d766e73fec9';

  console.log('\n=== Investigating MREQ-7606 ===\n');

  // Get the ticket
  const { data: ticket } = await supabase
    .from('jira_issues')
    .select('*')
    .eq('user_id', userId)
    .eq('jira_key', 'MREQ-7606')
    .single();

  if (!ticket) {
    console.log('Ticket not found');
    return;
  }

  console.log(`Ticket: ${ticket.jira_key}`);
  console.log(`Summary: ${ticket.summary}`);
  console.log(`Project: ${ticket.jira_key.split('-')[0]}`);
  console.log(`Issue Type: ${ticket.issue_type}`);
  console.log(`Components: ${ticket.components?.join(', ') || 'None'}`);
  console.log(`Labels: ${ticket.labels?.join(', ') || 'None'}\n`);

  // Get theme links
  const { data: themeLinks } = await supabase
    .from('theme_jira_links')
    .select('theme_key, match_type, match_confidence')
    .eq('user_id', userId)
    .eq('jira_issue_id', ticket.id);

  console.log(`Linked to ${themeLinks?.length || 0} themes:`);
  themeLinks?.forEach(link => {
    console.log(`  - ${link.theme_key} (${link.match_type}, confidence: ${link.match_confidence})`);
  });

  // Get account links
  const { data: accountLinks } = await supabase
    .from('account_jira_links')
    .select('account_id, match_type, match_confidence')
    .eq('user_id', userId)
    .eq('jira_issue_id', ticket.id);

  console.log(`\nLinked to ${accountLinks?.length || 0} accounts\n`);

  // Get account details
  if (accountLinks && accountLinks.length > 0) {
    const accountIds = accountLinks.map(l => l.account_id);
    const { data: accounts } = await supabase
      .from('accounts')
      .select('id, name, products')
      .in('id', accountIds);

    console.log('Accounts linked to this MARINE ticket:');
    accountLinks.forEach(link => {
      const account = accounts?.find(a => a.id === link.account_id);
      console.log(`  ${account?.name || 'Unknown'}`);
      console.log(`    Products: ${account?.products || 'N/A'}`);
      console.log(`    Match type: ${link.match_type} (confidence: ${link.match_confidence})`);
      console.log('');
    });

    // Count by product
    const byProduct = new Map<string, number>();
    accountLinks.forEach(link => {
      const account = accounts?.find(a => a.id === link.account_id);
      const product = account?.products || 'unknown';
      byProduct.set(product, (byProduct.get(product) || 0) + 1);
    });

    console.log('Breakdown by product:');
    Array.from(byProduct.entries()).forEach(([product, count]) => {
      console.log(`  ${product}: ${count} accounts`);
    });

    // Check if this is part of the problem
    const storageAccountsList = accountLinks.filter(link => {
      const account = accounts?.find(a => a.id === link.account_id);
      return account?.products?.toLowerCase().includes('edge') ||
             account?.products?.toLowerCase().includes('sitelink');
    });

    if (storageAccountsList.length > 0) {
      console.log(`\n⚠️  PROBLEM: Marine ticket (MREQ) linked to ${storageAccountsList.length} STORAGE accounts!`);
    }
  }
}

investigate().catch(console.error);
