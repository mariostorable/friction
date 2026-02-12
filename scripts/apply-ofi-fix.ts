/**
 * Script to apply OFI ambiguous column fix
 * Run with: npx tsx scripts/apply-ofi-fix.ts
 *
 * This script provides the SQL to run manually in Supabase SQL Editor
 */

import * as fs from 'fs';
import * as path from 'path';

async function showMigration() {
  try {
    console.log('Reading migration file...');
    const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', '20260212_fix_ofi_ambiguous_final.sql');
    const migrationSql = fs.readFileSync(migrationPath, 'utf-8');

    console.log('\n' + '='.repeat(80));
    console.log('Copy and paste the following SQL into your Supabase SQL Editor:');
    console.log('https://supabase.com/dashboard/project/_/sql');
    console.log('='.repeat(80) + '\n');
    console.log(migrationSql);
    console.log('\n' + '='.repeat(80));
    console.log('After running the SQL, test the Visit Planner to confirm the fix.');
    console.log('='.repeat(80) + '\n');

  } catch (err) {
    console.error('Error reading migration file:', err);
    process.exit(1);
  }
}

showMigration();
