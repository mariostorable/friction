import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function findClientField() {
  const userId = 'ab953672-7bad-4601-9289-5d766e73fec9';

  console.log('\n=== Finding Client(s) Custom Field ===\n');

  // First, try to get EDGE-4200 specifically
  const { data: edge4200Data } = await supabase
    .from('jira_issues')
    .select('jira_key, summary, metadata')
    .eq('user_id', userId)
    .eq('jira_key', 'EDGE-4200')
    .single();

  // Then get a sample of other EDGE tickets
  const { data: otherIssues } = await supabase
    .from('jira_issues')
    .select('jira_key, summary, metadata')
    .eq('user_id', userId)
    .like('jira_key', 'EDGE-%')
    .limit(20);

  const issues = edge4200Data ? [edge4200Data, ...(otherIssues || [])] : (otherIssues || []);

  console.log(`Examining ${issues?.length || 0} Jira tickets:\n`);

  // Collect all custom field keys
  const allFieldKeys = new Set<string>();
  const fieldSamples: Record<string, any[]> = {};

  issues?.forEach((issue) => {
    const customFields = issue.metadata?.custom_fields || {};

    Object.entries(customFields).forEach(([key, value]) => {
      allFieldKeys.add(key);

      // Collect samples of values
      if (!fieldSamples[key]) {
        fieldSamples[key] = [];
      }

      if (fieldSamples[key].length < 3 && value) {
        fieldSamples[key].push({
          jira_key: issue.jira_key,
          value: typeof value === 'string' ? value.substring(0, 100) : JSON.stringify(value).substring(0, 100)
        });
      }
    });
  });

  console.log(`Found ${allFieldKeys.size} unique custom field keys\n`);

  // Look for fields that might contain client/account names
  console.log('=== Searching for Client/Account Name Fields ===\n');

  const accountKeywords = ['white label', 'storagemart', 'west coast', 'marine', 'client', 'account', 'spartan', 'elite'];
  const potentialClientFields: string[] = [];

  for (const fieldKey of Array.from(allFieldKeys).sort()) {
    const samples = fieldSamples[fieldKey] || [];

    // Check if any samples contain account keywords
    const hasAccountKeyword = samples.some(sample => {
      const valueStr = sample.value.toLowerCase();
      return accountKeywords.some(keyword => valueStr.includes(keyword));
    });

    if (hasAccountKeyword) {
      potentialClientFields.push(fieldKey);
      console.log(`\n📍 ${fieldKey}:`);
      samples.forEach(sample => {
        console.log(`   ${sample.jira_key}: ${sample.value}`);
      });
    }
  }

  if (potentialClientFields.length === 0) {
    console.log('\n❌ No custom fields found containing account keywords');
    console.log('\nAll custom field keys:');
    Array.from(allFieldKeys).sort().forEach(key => {
      console.log(`  - ${key}`);
      if (fieldSamples[key] && fieldSamples[key].length > 0) {
        console.log(`    Sample: ${fieldSamples[key][0].value}`);
      }
    });
  } else {
    console.log(`\n\n✅ Found ${potentialClientFields.length} potential Client field(s):`);
    potentialClientFields.forEach(field => console.log(`  - ${field}`));
  }

  // Specifically check EDGE-4200 if available
  const edge4200 = issues?.find(i => i.jira_key === 'EDGE-4200');
  if (edge4200) {
    console.log('\n\n=== EDGE-4200 Specific Analysis ===');
    console.log('Summary:', edge4200.summary);
    const customFields = edge4200.metadata?.custom_fields || {};
    console.log('\nAll custom fields:');
    Object.entries(customFields).forEach(([key, value]) => {
      const valueStr = typeof value === 'string' ? value : JSON.stringify(value);
      console.log(`  ${key}: ${valueStr.substring(0, 150)}`);
    });
  } else {
    console.log('\n\n⚠️  EDGE-4200 not found in recent tickets');
  }
}

findClientField().catch(console.error);
