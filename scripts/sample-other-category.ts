import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const { data } = await supabase
    .from('friction_cards')
    .select('summary, severity, sentiment, theme_key')
    .eq('theme_key', 'other')
    .order('created_at', { ascending: false })
    .limit(50);

  console.log('📋 Sample of "Other" category (recent 50):\n');
  data?.forEach((card, i) => {
    console.log(`${i + 1}. [Severity ${card.severity}] ${card.summary}`);
  });
}

main();
