import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function checkJiraClients() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  );

  // Get some Jira issues with their custom fields
  const { data: issues } = await supabase
    .from('jira_issues')
    .select('jira_key, metadata')
    .order('created_at', { ascending: false })
    .limit(100);

  console.log('\n=== Jira Client Field Analysis ===\n');

  const issuesWithClient: string[] = [];

  issues?.forEach((issue: any) => {
    const customFields = issue.metadata?.custom_fields || {};
    const clientField = customFields['customfield_12184'];

    if (clientField) {
      console.log(`${issue.jira_key}: "${clientField}"`);
      issuesWithClient.push(clientField);
    }
  });

  console.log(`\n${issuesWithClient.length} out of ${issues?.length || 0} issues have client field`);

  // Show unique client names
  const uniqueClients = [...new Set(issuesWithClient)];
  console.log(`\nUnique client names found: ${uniqueClients.length}`);
  console.log('\nFirst 20 unique client names:');
  uniqueClients.slice(0, 20).forEach(name => console.log(`  - ${name}`));

  // Check for semicolon-separated entries
  const multiClientIssues = issuesWithClient.filter(c => c.includes(';'));
  console.log(`\n${multiClientIssues.length} issues have semicolon-separated clients`);
  if (multiClientIssues.length > 0) {
    console.log('\nExamples:');
    multiClientIssues.slice(0, 5).forEach(c => console.log(`  - ${c}`));
  }
}

checkJiraClients().catch(console.error);
