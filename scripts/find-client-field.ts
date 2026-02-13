import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function findClientField() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  );

  // Get 50 recent issues to analyze
  const { data: issues } = await supabase
    .from('jira_issues')
    .select('jira_key, summary, metadata')
    .order('created_at', { ascending: false })
    .limit(50);

  console.log('\n=== Finding Client Field ===\n');

  // Collect values for all custom fields
  const fieldValues = new Map<string, Set<string>>();

  issues?.forEach((issue: any) => {
    const customFields = issue.metadata?.custom_fields || {};

    Object.entries(customFields).forEach(([key, value]) => {
      if (typeof value === 'string' && value.length > 0 && value.length < 200) {
        if (!fieldValues.has(key)) {
          fieldValues.set(key, new Set());
        }
        fieldValues.get(key)!.add(value);
      }
    });
  });

  // Look for fields that might contain client names
  // (fields with multiple different string values, not just dates or numbers)
  const potentialClientFields: Array<{ field: string; uniqueValues: number; samples: string[] }> = [];

  fieldValues.forEach((values, field) => {
    const valueArray = Array.from(values);
    // Skip fields that look like dates, IDs, or have very few values
    const looksLikeNames = valueArray.some(v =>
      v.includes('Storage') ||
      v.includes('Management') ||
      v.includes('Properties') ||
      v.includes('LLC') ||
      v.includes('CORP') ||
      v.includes(';') || // Semicolon-separated
      v.includes('Federal') ||
      v.includes('Group')
    );

    if (looksLikeNames) {
      potentialClientFields.push({
        field,
        uniqueValues: valueArray.length,
        samples: valueArray.slice(0, 5)
      });
    }
  });

  console.log(`Found ${potentialClientFields.length} fields that might contain client names:\n`);

  potentialClientFields
    .sort((a, b) => b.uniqueValues - a.uniqueValues)
    .forEach(({ field, uniqueValues, samples }) => {
      console.log(`\n${field} (${uniqueValues} unique values):`);
      samples.forEach(sample => console.log(`  - ${sample}`));
    });
}

findClientField().catch(console.error);
