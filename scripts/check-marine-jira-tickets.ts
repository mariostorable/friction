import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkMarineJiraTickets() {
  const userId = 'ab953672-7bad-4601-9289-5d766e73fec9';

  console.log('\n=== Checking Jira Tickets for Marine Accounts ===\n');

  // Get all marine accounts
  const { data: marineAccounts } = await supabase
    .from('accounts')
    .select('id, name, arr, products, status')
    .eq('user_id', userId)
    .eq('vertical', 'marine')
    .eq('status', 'active')
    .order('arr', { ascending: false });

  console.log(`Found ${marineAccounts?.length || 0} active marine accounts\n`);

  if (marineAccounts && marineAccounts.length > 0) {
    console.log('Top Marine Accounts:');
    marineAccounts.slice(0, 10).forEach((acc, i) => {
      console.log(`${i + 1}. ${acc.name} - ARR: $${acc.arr?.toLocaleString() || 0}`);
      if (acc.products) console.log(`   Products: ${acc.products}`);
    });
  }

  // Check if any marine accounts have Jira ticket links
  console.log('\n\n=== Checking Jira Links for Marine Accounts ===\n');

  let totalMarineLinks = 0;
  const accountsWithLinks: any[] = [];

  for (const account of marineAccounts || []) {
    const { data: links, count } = await supabase
      .from('account_jira_links')
      .select('id, match_type, match_confidence', { count: 'exact' })
      .eq('account_id', account.id);

    if (count && count > 0) {
      totalMarineLinks += count;
      accountsWithLinks.push({
        name: account.name,
        arr: account.arr,
        link_count: count,
        links: links
      });
    }
  }

  console.log(`Total Jira links to marine accounts: ${totalMarineLinks}`);

  if (accountsWithLinks.length > 0) {
    console.log(`\n${accountsWithLinks.length} marine accounts have Jira tickets:\n`);

    accountsWithLinks
      .sort((a, b) => b.link_count - a.link_count)
      .forEach(acc => {
        console.log(`\n${acc.name}`);
        console.log(`  ARR: $${acc.arr?.toLocaleString() || 0}`);
        console.log(`  Jira tickets: ${acc.link_count}`);

        const byMatchType = acc.links?.reduce((acc: any, link: any) => {
          acc[link.match_type] = (acc[link.match_type] || 0) + 1;
          return acc;
        }, {});
        console.log(`  Match types:`, byMatchType);
      });

    // Get sample tickets for top marine account
    if (accountsWithLinks.length > 0) {
      const topAccount = accountsWithLinks[0];
      console.log(`\n\n=== Sample Tickets for ${topAccount.name} ===\n`);

      const { data: ticketLinks } = await supabase
        .from('account_jira_links')
        .select('jira_issue:jira_issues(jira_key, summary, status, priority)')
        .eq('account_id', marineAccounts?.find(a => a.name === topAccount.name)?.id)
        .limit(10);

      ticketLinks?.forEach((link: any, i: number) => {
        const ticket = link.jira_issue;
        if (ticket) {
          console.log(`${i + 1}. ${ticket.jira_key}: ${ticket.summary.substring(0, 70)}...`);
          console.log(`   Status: ${ticket.status}, Priority: ${ticket.priority || 'N/A'}`);
        }
      });
    }
  } else {
    console.log('\n❌ No marine accounts have Jira ticket links');
  }

  // Check if Client field contains any marine account names
  console.log('\n\n=== Checking Client Field for Marine Names ===\n');

  const { data: ticketsWithClientField } = await supabase
    .from('jira_issues')
    .select('jira_key, summary, metadata')
    .eq('user_id', userId)
    .not('metadata->custom_fields->customfield_12184', 'is', null);

  let marineClientMatches = 0;
  const marineAccountNames = marineAccounts?.map(a => a.name.toLowerCase()) || [];

  ticketsWithClientField?.forEach(ticket => {
    const clientField = ticket.metadata?.custom_fields?.customfield_12184;
    if (clientField && typeof clientField === 'string') {
      const clientFieldLower = clientField.toLowerCase();

      // Check if any marine account name appears in client field
      const matchingAccount = marineAccountNames.find(name =>
        clientFieldLower.includes(name) || name.includes(clientFieldLower)
      );

      if (matchingAccount) {
        marineClientMatches++;
        console.log(`${ticket.jira_key}: Client field = "${clientField}"`);
      }
    }
  });

  if (marineClientMatches === 0) {
    console.log('❌ No marine account names found in Jira Client fields');
    console.log('\nThis suggests marine accounts may not be creating Jira tickets,');
    console.log('or they are using different names in Jira that don\'t match Salesforce.');
  }

  // Check top 25 marine portfolio
  console.log('\n\n=== Top 25 Marine Portfolio ===\n');

  const { data: marinePortfolio } = await supabase
    .from('portfolios')
    .select('portfolio_type, account_ids, created_at')
    .eq('user_id', userId)
    .eq('portfolio_type', 'top_25_marine')
    .single();

  if (marinePortfolio) {
    console.log(`Portfolio exists with ${marinePortfolio.account_ids?.length || 0} accounts`);
    console.log(`Created: ${marinePortfolio.created_at}`);
  } else {
    console.log('❌ No top_25_marine portfolio found');
  }
}

checkMarineJiraTickets().catch(console.error);
