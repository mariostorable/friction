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
    .select('source_id, metadata')
    .eq('user_id', userId)
    .eq('source_type', 'salesforce')
    .limit(10);

  console.log('\nComparing source_id vs metadata.case_number:\n');
  cases?.forEach((c: any, i: number) => {
    console.log(`Case number ${i + 1}:`);
    console.log(`  source_id: ${c.source_id || 'NULL'}`);
    console.log(`  metadata.case_number: ${c.metadata?.case_number || 'NULL'}`);
    console.log();
  });

  const { count: withSourceId } = await supabase
    .from('raw_inputs')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('source_type', 'salesforce')
    .not('source_id', 'is', null);

  const { count: withMetadataCaseNum } = await supabase
    .from('raw_inputs')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('source_type', 'salesforce')
    .filter('metadata->>case_number', 'not.is', null);

  console.log(`Cases with source_id: ${withSourceId}`);
  console.log(`Cases with metadata.case_number: ${withMetadataCaseNum}\n`);
}

check().catch(console.error);
