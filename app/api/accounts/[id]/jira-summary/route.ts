import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

/**
 * Get Jira ticket summary for an account
 * Returns recent fixes (resolved in last 90 days) and upcoming features (in progress/open)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // First authenticate the user
    const supabaseAuth = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabaseAuth.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Use service role client for queries that need to bypass RLS for joins
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

    const accountId = params.id;

    // Get all Jira tickets linked to this account
    const { data: accountJiraLinks } = await supabase
      .from('account_jira_links')
      .select(`
        match_type,
        match_confidence,
        jira_issues!inner(
          id,
          jira_key,
          summary,
          status,
          priority,
          issue_type,
          components,
          resolution_date,
          updated_date,
          created_date,
          issue_url
        )
      `)
      .eq('account_id', accountId)
      .eq('user_id', user.id);

    if (!accountJiraLinks || accountJiraLinks.length === 0) {
      return NextResponse.json({
        recentFixes: [],
        upcoming: {
          inProgress: [],
          open: [],
        },
        total: 0,
      });
    }

    // Deduplicate tickets (account may be linked via multiple strategies)
    const uniqueTickets = new Map();
    accountJiraLinks.forEach((link: any) => {
      const ticket = link.jira_issues;
      if (!uniqueTickets.has(ticket.id)) {
        uniqueTickets.set(ticket.id, {
          ...ticket,
          match_type: link.match_type,
          match_confidence: link.match_confidence,
        });
      }
    });

    const tickets = Array.from(uniqueTickets.values());

    // Classify tickets
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const recentFixes = tickets
      .filter((t: any) => {
        if (!t.resolution_date) return false;
        const resolvedDate = new Date(t.resolution_date);
        return resolvedDate >= ninetyDaysAgo;
      })
      .sort((a: any, b: any) => {
        const dateA = new Date(a.resolution_date);
        const dateB = new Date(b.resolution_date);
        return dateB.getTime() - dateA.getTime();
      })
      .map((t: any) => ({
        jira_key: t.jira_key,
        summary: t.summary,
        status: t.status,
        priority: t.priority,
        issue_type: t.issue_type,
        components: t.components || [],
        resolution_date: t.resolution_date,
        issue_url: t.issue_url,
        match_type: t.match_type,
      }));

    const activeTickets = tickets.filter((t: any) => !t.resolution_date);

    const inProgress = activeTickets
      .filter((t: any) => {
        const statusLower = t.status?.toLowerCase() || '';
        return (
          statusLower.includes('progress') ||
          statusLower.includes('development') ||
          statusLower.includes('review') ||
          statusLower.includes('testing')
        );
      })
      .sort((a: any, b: any) => {
        const priorityOrder: any = { Critical: 0, High: 1, Major: 2, Medium: 3, Low: 4, Minor: 5 };
        const aPriority = priorityOrder[a.priority] ?? 10;
        const bPriority = priorityOrder[b.priority] ?? 10;
        return aPriority - bPriority;
      })
      .map((t: any) => ({
        jira_key: t.jira_key,
        summary: t.summary,
        status: t.status,
        priority: t.priority,
        issue_type: t.issue_type,
        components: t.components || [],
        updated_date: t.updated_date,
        issue_url: t.issue_url,
        match_type: t.match_type,
      }));

    const open = activeTickets
      .filter((t: any) => {
        const statusLower = t.status?.toLowerCase() || '';
        return !(
          statusLower.includes('progress') ||
          statusLower.includes('development') ||
          statusLower.includes('review') ||
          statusLower.includes('testing')
        );
      })
      .sort((a: any, b: any) => {
        const priorityOrder: any = { Critical: 0, High: 1, Major: 2, Medium: 3, Low: 4, Minor: 5 };
        const aPriority = priorityOrder[a.priority] ?? 10;
        const bPriority = priorityOrder[b.priority] ?? 10;
        return aPriority - bPriority;
      })
      .map((t: any) => ({
        jira_key: t.jira_key,
        summary: t.summary,
        status: t.status,
        priority: t.priority,
        issue_type: t.issue_type,
        components: t.components || [],
        created_date: t.created_date,
        issue_url: t.issue_url,
        match_type: t.match_type,
      }));

    return NextResponse.json({
      recentFixes,
      upcoming: {
        inProgress,
        open,
      },
      total: tickets.length,
      summary: {
        recentFixesCount: recentFixes.length,
        inProgressCount: inProgress.length,
        openCount: open.length,
      },
    });
  } catch (error) {
    console.error('Error fetching account Jira summary:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch Jira summary',
        details: error instanceof Error ? error.message : 'Unknown',
      },
      { status: 500 }
    );
  }
}
