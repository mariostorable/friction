/**
 * Analyze "Other" Category
 *
 * Identifies patterns in the "Other" theme to see if we need new categories
 * or if some issues are just normal support (not friction)
 */

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config({ path: '.env.local' });
config({ path: '.env' });

async function main() {
  console.log('🔍 Analyzing "Other" Category\n');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing environment variables');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Get all themes
  const { data: themes } = await supabase
    .from('themes')
    .select('*')
    .order('theme_key');

  console.log('📋 Current Themes:');
  themes?.forEach(theme => {
    console.log(`  - ${theme.theme_key}: ${theme.label}`);
    console.log(`    Description: ${theme.description}`);
    console.log(`    Active: ${theme.is_active}`);
    console.log('');
  });

  // Get friction cards in "Other" category
  const { data: otherCards } = await supabase
    .from('friction_cards')
    .select('id, summary, severity, sentiment, theme_key, confidence_score')
    .eq('theme_key', 'other')
    .order('created_at', { ascending: false })
    .limit(100);

  console.log(`\n📊 Analyzing ${otherCards?.length || 0} "Other" friction cards:\n`);

  if (!otherCards || otherCards.length === 0) {
    console.log('No cards in "Other" category');
    return;
  }

  // Group by common keywords
  const keywordGroups: Record<string, { count: number; examples: string[] }> = {};

  // Common support keywords (not friction)
  const normalSupportKeywords = [
    'how to', 'how do i', 'question about', 'can you', 'help with',
    'looking for', 'need to know', 'what is', 'where is', 'setup',
    'training', 'tutorial', 'guide', 'explain'
  ];

  // Potential friction patterns
  const frictionPatterns = [
    { key: 'reporting', terms: ['report', 'reporting', 'dashboard', 'analytics', 'export data'], label: 'Reporting/Analytics Issues' },
    { key: 'permissions', terms: ['permission', 'access', 'role', 'user management', 'cant access'], label: 'Permissions/Access Control' },
    { key: 'mobile', terms: ['mobile', 'ios', 'android', 'app', 'phone'], label: 'Mobile App Issues' },
    { key: 'notifications', terms: ['notification', 'alert', 'email', 'reminder', 'sms'], label: 'Notification Issues' },
    { key: 'data_sync', terms: ['sync', 'syncing', 'synchronization', 'data not updating'], label: 'Data Sync Issues' },
    { key: 'payment', terms: ['payment', 'autopay', 'credit card', 'billing', 'charge'], label: 'Payment Processing' },
    { key: 'automation', terms: ['automation', 'workflow', 'rule', 'trigger'], label: 'Automation Issues' },
    { key: 'search', terms: ['search', 'find', 'filter', 'cant locate'], label: 'Search/Navigation' },
  ];

  let normalSupportCount = 0;
  const patternCounts: Record<string, { count: number; examples: string[] }> = {};

  otherCards.forEach(card => {
    const summary = card.summary.toLowerCase();

    // Check if it's normal support
    const isNormalSupport = normalSupportKeywords.some(kw => summary.includes(kw));
    if (isNormalSupport) {
      normalSupportCount++;
      return;
    }

    // Check against friction patterns
    let matched = false;
    for (const pattern of frictionPatterns) {
      if (pattern.terms.some(term => summary.includes(term))) {
        if (!patternCounts[pattern.key]) {
          patternCounts[pattern.key] = { count: 0, examples: [] };
        }
        patternCounts[pattern.key].count++;
        if (patternCounts[pattern.key].examples.length < 3) {
          patternCounts[pattern.key].examples.push(card.summary);
        }
        matched = true;
        break;
      }
    }

    if (!matched) {
      if (!keywordGroups['uncategorized']) {
        keywordGroups['uncategorized'] = { count: 0, examples: [] };
      }
      keywordGroups['uncategorized'].count++;
      if (keywordGroups['uncategorized'].examples.length < 5) {
        keywordGroups['uncategorized'].examples.push(card.summary);
      }
    }
  });

  console.log('🔹 Normal Support (not friction):');
  console.log(`  ${normalSupportCount} issues (${((normalSupportCount / otherCards.length) * 100).toFixed(1)}%)`);
  console.log('  These are likely how-to questions or setup help\n');

  console.log('🔸 Potential New Theme Categories:');
  const sortedPatterns = Object.entries(patternCounts)
    .sort(([, a], [, b]) => b.count - a.count);

  sortedPatterns.forEach(([key, data]) => {
    const pattern = frictionPatterns.find(p => p.key === key);
    console.log(`\n  ${pattern?.label} (${data.count} issues, ${((data.count / otherCards.length) * 100).toFixed(1)}%)`);
    console.log('  Examples:');
    data.examples.forEach(ex => console.log(`    - ${ex}`));
  });

  console.log('\n\n🔹 Still Uncategorized:');
  if (keywordGroups['uncategorized']) {
    console.log(`  ${keywordGroups['uncategorized'].count} issues`);
    console.log('  Examples:');
    keywordGroups['uncategorized'].examples.forEach(ex => console.log(`    - ${ex}`));
  }

  console.log('\n\n💡 Recommendations:');
  console.log(`  1. Create ${sortedPatterns.filter(([, data]) => data.count >= 10).length} new theme categories`);
  console.log(`  2. ${normalSupportCount} issues should be tagged as "normal_support" not "friction"`);
  console.log(`  3. Review remaining ${keywordGroups['uncategorized']?.count || 0} for additional patterns\n`);
}

main().catch(console.error);
