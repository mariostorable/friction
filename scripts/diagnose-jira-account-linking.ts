/**
 * Diagnose why only 9/1000 Jira tickets are linked to accounts
 *
 * This script checks:
 * 1. How many Jira tickets have custom fields
 * 2. Which custom fields might contain Case IDs or Account info
 * 3. Whether the Case IDs match our Salesforce case format
 */

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config({ path: '.env.local' });

async function main() {
  console.log('🔍 Diagnosing Jira-Account linking...\n');

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Get current user (assumes you're the only user for now)
  const { data: { users } } = await supabase.auth.admin.listUsers();
  const userId = users?.[0]?.id;

  if (!userId) {
    console.error('No user found');
    return;
  }

  console.log(`Using user ID: ${userId}\n`);

  // 1. Check total Jira issues
  const { count: totalJira } = await supabase
    .from('jira_issues')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);

  console.log(`📊 Total Jira issues: ${totalJira}`);

  // 2. Check how many have custom_fields
  const { data: issuesWithCustomFields } = await supabase
    .from('jira_issues')
    .select('jira_key, metadata')
    .eq('user_id', userId)
    .not('metadata->custom_fields', 'is', null)
    .limit(100);

  console.log(`📊 Issues with custom_fields: ${issuesWithCustomFields?.length || 0}`);

  // 3. Sample some custom fields to see what's there
  console.log('\n📋 Sample custom fields from 5 tickets:\n');
  const sample = issuesWithCustomFields?.slice(0, 5) || [];

  for (const issue of sample) {
    const customFields = issue.metadata?.custom_fields || {};
    console.log(`\n${issue.jira_key}:`);
    console.log(`  Custom field keys: ${Object.keys(customFields).length}`);

    // Look for fields that might contain Case IDs (start with 500)
    const potentialCaseFields = Object.entries(customFields).filter(([key, value]) => {
      if (!value) return false;
      const valueStr = String(value);
      return valueStr.includes('500') ||
             valueStr.match(/^500[a-zA-Z0-9]{12,15}$/) ||
             key.toLowerCase().includes('case') ||
             key.toLowerCase().includes('salesforce');
    });

    if (potentialCaseFields.length > 0) {
      console.log('  Potential Case ID fields:');
      potentialCaseFields.forEach(([key, value]) => {
        console.log(`    ${key}: ${String(value).substring(0, 100)}`);
      });
    } else {
      console.log('  No obvious Case ID fields found');
      // Show first 3 fields as examples
      const sampleFields = Object.entries(customFields).slice(0, 3);
      if (sampleFields.length > 0) {
        console.log('  Sample fields:');
        sampleFields.forEach(([key, value]) => {
          console.log(`    ${key}: ${String(value).substring(0, 50)}...`);
        });
      }
    }
  }

  // 4. Check account_jira_links
  const { data: accountLinks } = await supabase
    .from('account_jira_links')
    .select('*')
    .eq('user_id', userId);

  console.log(`\n\n📊 Account-Jira links: ${accountLinks?.length || 0}`);

  if (accountLinks && accountLinks.length > 0) {
    console.log('\nSample account links:');
    accountLinks.slice(0, 5).forEach((link: any) => {
      console.log(`  ${link.jira_key} → Account ${link.account_id} (confidence: ${link.match_confidence})`);
    });
  }

  // 5. Check how many Salesforce cases we have with account_id
  const { data: casesWithAccounts } = await supabase
    .from('raw_inputs')
    .select('source_id, account_id')
    .eq('user_id', userId)
    .eq('source_type', 'salesforce')
    .not('source_id', 'is', null)
    .not('account_id', 'is', null)
    .limit(5);

  console.log(`\n\n📊 Sample Salesforce Cases with Account IDs:\n`);
  casesWithAccounts?.forEach((caseData: any) => {
    console.log(`  Case ${caseData.source_id} → Account ${caseData.account_id}`);
  });

  console.log('\n\n💡 Summary:');
  console.log(`  • ${totalJira} Jira tickets synced`);
  console.log(`  • ${issuesWithCustomFields?.length || 0} have custom fields`);
  console.log(`  • ${accountLinks?.length || 0} are linked to accounts`);
  console.log(`  • Link rate: ${((accountLinks?.length || 0) / (totalJira || 1) * 100).toFixed(1)}%`);

  if ((accountLinks?.length || 0) < (totalJira || 0) * 0.1) {
    console.log('\n⚠️  Link rate is very low (<10%)');
    console.log('   Possible causes:');
    console.log('   1. Most Jira tickets don\'t have Salesforce Case IDs in custom fields');
    console.log('   2. Case ID format doesn\'t match (expected: 500XXXXXXXXXXXXX)');
    console.log('   3. Case IDs in Jira don\'t match Case IDs in Salesforce raw_inputs');
    console.log('\n   Check the sample custom fields above to see what\'s available.');
  }
}

main().catch(console.error);
