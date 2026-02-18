import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function checkProjectCodes() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  );

  const userId = 'ab953672-7bad-4601-9289-5d766e73fec9';

  console.log('\n=== Jira Project Codes Analysis ===\n');

  // Get all jira issues and extract project codes
  const { data: issues } = await supabase
    .from('jira_issues')
    .select('jira_key')
    .eq('user_id', userId);

  if (!issues) {
    console.log('No issues found');
    return;
  }

  // Extract project codes
  const projectCodes = new Map<string, number>();
  issues.forEach(issue => {
    const projectCode = issue.jira_key.split('-')[0];
    projectCodes.set(projectCode, (projectCodes.get(projectCode) || 0) + 1);
  });

  // Sort by count descending
  const sorted = Array.from(projectCodes.entries())
    .sort((a, b) => b[1] - a[1]);

  console.log('Project codes by ticket count:\n');
  sorted.forEach(([code, count]) => {
    console.log(`  ${code.padEnd(10)} ${count.toString().padStart(4)} tickets`);
  });

  console.log('\n--- Project Code Classification ---\n');

  const KNOWN_MARINE = ['MREQ', 'TOPS', 'BZD', 'EASY', 'NBK', 'MDEV', 'ESST'];
  const KNOWN_STORAGE = ['EDGE', 'SL', 'SLT', 'PAY', 'CRM', 'DATA', 'BUGS'];
  const KNOWN_SHARED = ['CPBUG', 'POL', 'SFT', 'WA'];

  console.log('Marine/RV Projects:');
  sorted.filter(([code]) => KNOWN_MARINE.includes(code)).forEach(([code, count]) => {
    console.log(`  ${code}: ${count} tickets`);
  });

  console.log('\nStorage Projects:');
  sorted.filter(([code]) => KNOWN_STORAGE.includes(code)).forEach(([code, count]) => {
    console.log(`  ${code}: ${count} tickets`);
  });

  console.log('\nShared/Platform Projects (affects both):');
  sorted.filter(([code]) => KNOWN_SHARED.includes(code)).forEach(([code, count]) => {
    console.log(`  ${code}: ${count} tickets`);
  });

  console.log('\nUnclassified Projects:');
  sorted.filter(([code]) =>
    !KNOWN_MARINE.includes(code) &&
    !KNOWN_STORAGE.includes(code) &&
    !KNOWN_SHARED.includes(code)
  ).forEach(([code, count]) => {
    console.log(`  ${code}: ${count} tickets (NEEDS CLASSIFICATION)`);
  });
}

checkProjectCodes().catch(console.error);
