import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function check() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  );

  const userId = 'ab953672-7bad-4601-9289-5d766e73fec9';

  const { data: cases } = await supabase
    .from('raw_inputs')
    .select('metadata, account_id')
    .eq('user_id', userId)
    .limit(10);

  console.log('\nCase numbers in metadata:\n');
  cases?.forEach((c: any, i: number) => {
    if (c.metadata?.case_number) {
      console.log(`  Case ${i + 1}: ${c.metadata.case_number}`);
    }
  });

  const { count: withCaseNum } = await supabase
    .from('raw_inputs')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .not('metadata->case_number', 'is', null);

  console.log(`\nTotal cases with metadata.case_number: ${withCaseNum}\n`);
}

check().catch(console.error);
