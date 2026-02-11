/**
 * Direct Jira sync using Supabase client
 * This mimics what the API route does but runs directly
 */
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

async function syncJira() {
  const userId = 'ab953672-7bad-4601-9289-5d766e73fec9';

  console.log('\n=== Direct Jira Sync ===\n');

  // Get Jira integration
  const { data: integration, error: integrationError } = await supabaseAdmin
    .from('integrations')
    .select('*')
    .eq('user_id', userId)
    .eq('integration_type', 'jira')
    .eq('status', 'active')
    .single();

  if (!integration) {
    console.error('❌ No active Jira integration found');
    console.error('Error:', integrationError);
    return;
  }

  console.log(`✅ Found Jira integration: ${integration.instance_url}`);

  // Get existing Jira issues to update
  const { data: existingIssues } = await supabaseAdmin
    .from('jira_issues')
    .select('id, jira_key, metadata')
    .eq('user_id', userId)
    .not('metadata->custom_fields->customfield_12184', 'is', null)
    .limit(100);

  console.log(`\n📋 Found ${existingIssues?.length || 0} existing issues with Client field`);

  // Get all active accounts for matching
  const { data: accounts } = await supabaseAdmin
    .from('accounts')
    .select('id, name')
    .eq('user_id', userId)
    .eq('status', 'active');

  console.log(`📊 Found ${accounts?.length || 0} active accounts\n`);

  // Process Client field linking for existing issues
  const accountLinksToCreate: any[] = [];
  let matchCount = 0;

  for (const issue of existingIssues || []) {
    const customFields = issue.metadata?.custom_fields || {};
    const clientFieldValue = customFields['customfield_12184'];

    if (clientFieldValue && typeof clientFieldValue === 'string') {
      const clientNames = clientFieldValue.split(',').map((name: string) => name.trim()).filter((name: string) => name.length > 0);

      console.log(`\n${issue.jira_key}: ${clientNames.join(', ')}`);

      for (const clientName of clientNames) {
        const matchingAccounts = accounts?.filter(acc => {
          const accNameLower = acc.name.toLowerCase();
          const clientNameLower = clientName.toLowerCase();
          return accNameLower.includes(clientNameLower) || clientNameLower.includes(accNameLower);
        });

        if (matchingAccounts && matchingAccounts.length > 0) {
          for (const account of matchingAccounts) {
            accountLinksToCreate.push({
              user_id: userId,
              account_id: account.id,
              jira_issue_id: issue.id,
              match_type: 'client_field',
              match_confidence: 0.95
            });
            console.log(`  ✓ "${clientName}" → ${account.name}`);
            matchCount++;
          }
        } else {
          console.log(`  ✗ No match for "${clientName}"`);
        }
      }
    }
  }

  console.log(`\n\n=== Creating Account Links ===`);
  console.log(`Total links to create: ${accountLinksToCreate.length}`);

  if (accountLinksToCreate.length > 0) {
    const { data: createdLinks, error: linkError } = await supabaseAdmin
      .from('account_jira_links')
      .upsert(accountLinksToCreate, {
        onConflict: 'account_id,jira_issue_id',
        ignoreDuplicates: true
      })
      .select();

    if (linkError) {
      console.error('❌ Error creating links:', linkError);
    } else {
      console.log(`✅ Successfully created ${createdLinks?.length || 0} account links`);
    }
  }

  // Show West Coast specific results
  const westCoastAccount = accounts?.find(a => a.name.includes('West Coast Self-Storage'));
  if (westCoastAccount) {
    const { data: westCoastLinks, count } = await supabaseAdmin
      .from('account_jira_links')
      .select('id, match_type, match_confidence', { count: 'exact' })
      .eq('account_id', westCoastAccount.id);

    console.log(`\n\n=== West Coast Self-Storage Results ===`);
    console.log(`Total links: ${count || 0}`);

    const byMatchType = westCoastLinks?.reduce((acc: any, link: any) => {
      acc[link.match_type] = (acc[link.match_type] || 0) + 1;
      return acc;
    }, {});

    console.log(`By match type:`, byMatchType);
  }

  console.log('\n✅ Sync complete!');
}

syncJira().catch(console.error);
