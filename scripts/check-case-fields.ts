import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function checkCaseFields() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  );

  const userId = 'ab953672-7bad-4601-9289-5d766e73fec9';

  console.log('\n=== Case Field Analysis ===\n');

  // Get sample cases
  const { data: cases } = await supabase
    .from('raw_inputs')
    .select('*')
    .eq('user_id', userId)
    .limit(5);

  console.log('Sample case data:\n');
  cases?.forEach((c: any, i: number) => {
    console.log(`Case #${i + 1}:`);
    console.log(`  ID: ${c.id}`);
    console.log(`  case_number: ${c.case_number || 'NULL'}`);
    console.log(`  account_id: ${c.account_id || 'NULL'}`);
    console.log(`  source_url: ${c.source_url?.slice(0, 80) || 'NULL'}`);
    console.log(`  metadata keys: ${Object.keys(c.metadata || {}).join(', ')}`);
    if (c.metadata?.CaseNumber) {
      console.log(`  metadata.CaseNumber: ${c.metadata.CaseNumber}`);
    }
    if (c.metadata?.Id) {
      console.log(`  metadata.Id: ${c.metadata.Id}`);
    }
    console.log();
  });

  // Check if metadata has CaseNumber
  const { count: withMetadataCaseNumber } = await supabase
    .from('raw_inputs')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .not('metadata->CaseNumber', 'is', null);

  console.log(`Cases with metadata.CaseNumber: ${withMetadataCaseNumber}`);
}

checkCaseFields().catch(console.error);
