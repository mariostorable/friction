import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function searchTickets() {
  const userId = 'ab953672-7bad-4601-9289-5d766e73fec9';

  // Search for surcharge tickets
  const { data: surchargeTickets } = await supabase
    .from('jira_issues')
    .select('jira_key, summary, metadata')
    .eq('user_id', userId)
    .ilike('summary', '%surcharge%');

  console.log('\n=== Surcharge Tickets ===');
  console.log(`Found ${surchargeTickets?.length || 0} tickets with "surcharge"`);
  surchargeTickets?.forEach(t => {
    console.log(`\n${t.jira_key}: ${t.summary}`);
    const customFields = t.metadata?.custom_fields || {};
    const fieldCount = Object.keys(customFields).length;
    console.log(`  Has ${fieldCount} custom fields`);

    // Show fields that might contain client names
    Object.entries(customFields).forEach(([key, value]) => {
      if (value && typeof value === 'string' && value.length < 200) {
        console.log(`    ${key}: ${value}`);
      }
    });
  });

  // Check if EDGE-4200 exists at all
  const { data: edge4200 } = await supabase
    .from('jira_issues')
    .select('jira_key, summary, created_date, updated_date')
    .eq('user_id', userId)
    .eq('jira_key', 'EDGE-4200');

  console.log('\n\n=== EDGE-4200 Status ===');
  if (edge4200 && edge4200.length > 0) {
    console.log('✅ Found EDGE-4200');
    console.log(edge4200[0]);
  } else {
    console.log('❌ EDGE-4200 not found in database');
    console.log('This could mean:');
    console.log('  - Ticket is older than 90 days (current sync window)');
    console.log('  - Ticket hasn\'t been synced yet');
    console.log('  - Ticket key might be different');
  }
}

searchTickets().catch(console.error);
