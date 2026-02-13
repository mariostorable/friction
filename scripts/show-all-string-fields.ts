import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function showAllStringFields() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  );

  // Get 30 recent issues
  const { data: issues } = await supabase
    .from('jira_issues')
    .select('jira_key, summary, metadata')
    .order('created_at', { ascending: false })
    .limit(30);

  console.log('\n=== All String Custom Fields ===\n');

  // Collect all string field values
  const fieldSamples = new Map<string, string[]>();

  issues?.forEach((issue: any) => {
    const customFields = issue.metadata?.custom_fields || {};

    Object.entries(customFields).forEach(([key, value]) => {
      if (typeof value === 'string' && value.length > 0 && value.length < 300) {
        if (!fieldSamples.has(key)) {
          fieldSamples.set(key, []);
        }
        const samples = fieldSamples.get(key)!;
        if (samples.length < 10 && !samples.includes(value)) {
          samples.push(value);
        }
      }
    });
  });

  // Show fields with their sample values
  const sortedFields = Array.from(fieldSamples.entries())
    .sort((a, b) => a[0].localeCompare(b[0]));

  sortedFields.forEach(([field, samples]) => {
    console.log(`\n${field}:`);
    samples.slice(0, 5).forEach(sample => {
      const truncated = sample.length > 100 ? sample.slice(0, 100) + '...' : sample;
      console.log(`  "${truncated}"`);
    });
  });

  console.log(`\n\nTotal string fields found: ${fieldSamples.size}`);
}

showAllStringFields().catch(console.error);
