import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkThemes() {
  console.log('\n📊 THEME ANALYSIS\n');
  console.log('='.repeat(60));

  // Check available themes in database
  const { data: themes } = await supabase
    .from('themes')
    .select('theme_key, label, is_active')
    .eq('is_active', true)
    .order('label');

  console.log('\n✅ AVAILABLE THEMES IN DATABASE:\n');
  themes?.forEach(theme => {
    const isNew = ['data_quality', 'reporting_issues', 'access_permissions',
                   'configuration_problems', 'notification_issues', 'workflow_inefficiency',
                   'mobile_issues', 'documentation_gaps'].includes(theme.theme_key);
    const label = isNew ? '🆕' : '  ';
    console.log(`  ${label} ${theme.theme_key.padEnd(25)} → ${theme.label}`);
  });

  // Get all friction cards across all accounts
  const { data: cards } = await supabase
    .from('friction_cards')
    .select('theme_key, severity, created_at')
    .order('created_at', { ascending: false });

  if (!cards || cards.length === 0) {
    console.log('\n⚠️  No friction cards found. Run analysis first.\n');
    return;
  }

  console.log(`\n📈 THEME USAGE (from ${cards.length} total friction cards):\n`);

  // Count by theme
  const themeCounts: Record<string, number> = {};
  cards.forEach(card => {
    themeCounts[card.theme_key] = (themeCounts[card.theme_key] || 0) + 1;
  });

  // Sort by count descending
  const sortedThemes = Object.entries(themeCounts)
    .sort((a, b) => b[1] - a[1]);

  sortedThemes.forEach(([theme, count]) => {
    const pct = ((count / cards.length) * 100).toFixed(1);
    const bar = '█'.repeat(Math.round(parseFloat(pct) / 2));
    const isOther = theme === 'other';
    const color = isOther ? '🔴' : count > cards.length * 0.1 ? '🟢' : '🟡';

    console.log(`  ${color} ${theme.padEnd(25)} ${count.toString().padStart(3)} (${pct.padStart(5)}%) ${bar}`);
  });

  const otherCount = themeCounts['other'] || 0;
  const otherPct = ((otherCount / cards.length) * 100);

  console.log('\n' + '='.repeat(60));

  if (otherPct > 30) {
    console.log('\n🔴 HIGH "OTHER" USAGE:');
    console.log(`   ${otherPct.toFixed(1)}% of cases are classified as "other"`);
    console.log(`   Recommendation: Review "other" cases and add more specific themes`);
  } else if (otherPct > 15) {
    console.log('\n🟡 MODERATE "OTHER" USAGE:');
    console.log(`   ${otherPct.toFixed(1)}% of cases are classified as "other"`);
    console.log(`   Consider reviewing if patterns emerge`);
  } else {
    console.log('\n🟢 GOOD THEME DISTRIBUTION:');
    console.log(`   Only ${otherPct.toFixed(1)}% of cases are classified as "other"`);
    console.log(`   Themes are working well!`);
  }

  // Check if new themes are being used
  const newThemeKeys = ['data_quality', 'reporting_issues', 'access_permissions',
                        'configuration_problems', 'notification_issues', 'workflow_inefficiency',
                        'mobile_issues', 'documentation_gaps'];

  const newThemesUsed = sortedThemes.filter(([theme]) => newThemeKeys.includes(theme));

  if (newThemesUsed.length > 0) {
    console.log('\n🎉 NEW THEMES BEING USED:');
    newThemesUsed.forEach(([theme, count]) => {
      console.log(`   ✅ ${theme}: ${count} cases`);
    });
  } else {
    console.log('\n⚠️  NEW THEMES NOT YET USED:');
    console.log('   Run a fresh analysis after adding themes to database');
  }

  console.log('\n');
}

checkThemes().catch(console.error);
