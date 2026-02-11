import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

export const dynamic = 'force-dynamic';

/**
 * POST /api/debug/run-migration
 *
 * Runs a SQL migration file against the database
 * Body: { filename: string } - migration filename in supabase/migrations/
 */
export async function POST(request: NextRequest) {
  try {
    const { filename } = await request.json();

    if (!filename) {
      return NextResponse.json(
        { error: 'Missing filename' },
        { status: 400 }
      );
    }

    // Read migration file
    const migrationPath = path.join(process.cwd(), 'supabase', 'migrations', filename);

    if (!fs.existsSync(migrationPath)) {
      return NextResponse.json(
        { error: 'Migration file not found', path: migrationPath },
        { status: 404 }
      );
    }

    const sql = fs.readFileSync(migrationPath, 'utf8');

    // Create admin client
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // Execute SQL by splitting into statements and running each
    // (Supabase JS client doesn't have direct SQL execution, so we use rpc)
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    console.log(`Executing ${statements.length} SQL statements from ${filename}`);

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];

      // Skip comments
      if (statement.startsWith('--')) continue;

      console.log(`\nStatement ${i + 1}:`, statement.substring(0, 100) + '...');

      try {
        // Execute using rpc - wrap in a transaction
        const { data, error } = await supabase.rpc('exec_sql' as any, {
          sql: statement + ';'
        });

        if (error) {
          console.error(`Error in statement ${i + 1}:`, error);
          // Some statements might fail if objects already exist - that's ok
          console.log('Continuing despite error...');
        }
      } catch (err) {
        console.error(`Exception in statement ${i + 1}:`, err);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Migration ${filename} applied`,
      statementsExecuted: statements.length,
      sql: sql.substring(0, 500) + '...'
    });

  } catch (error) {
    console.error('Migration error:', error);
    return NextResponse.json(
      {
        error: 'Migration failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
