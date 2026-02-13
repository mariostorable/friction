import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function checkCustomFields() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  );

  // Get recent Jira issues
  const { data: issues } = await supabase
    .from('jira_issues')
    .select('jira_key, summary, metadata')
    .order('created_at', { ascending: false })
    .limit(10);

  console.log('\n=== Jira Custom Fields Check ===\n');

  if (!issues || issues.length === 0) {
    console.log('No Jira issues found in database');
    return;
  }

  console.log(`Analyzing ${issues.length} recent Jira tickets...\n`);

  // Collect all custom field keys
  const allCustomFields = new Set<string>();

  issues.forEach((issue: any) => {
    const customFields = issue.metadata?.custom_fields || {};
    Object.keys(customFields).forEach(key => allCustomFields.add(key));
  });

  console.log(`Found ${allCustomFields.size} unique custom fields across all issues`);
  console.log('\nCustom fields present:');
  Array.from(allCustomFields).sort().forEach(field => {
    console.log(`  - ${field}`);
  });

  // Show example values for first issue
  console.log('\n--- Example Issue ---');
  const firstIssue = issues[0];
  console.log(`Key: ${firstIssue.jira_key}`);
  console.log(`Summary: ${firstIssue.summary}`);
  console.log('\nCustom Fields:');
  const customFields = firstIssue.metadata?.custom_fields || {};

  Object.entries(customFields).forEach(([key, value]) => {
    const displayValue = JSON.stringify(value).slice(0, 100);
    console.log(`  ${key}: ${displayValue}`);
  });

  // Check if customfield_12184 exists anywhere
  const hasClientField = issues.some((issue: any) =>
    issue.metadata?.custom_fields?.['customfield_12184']
  );

  console.log(`\ncustomfield_12184 (Client field) found: ${hasClientField ? 'YES' : 'NO'}`);
}

checkCustomFields().catch(console.error);
