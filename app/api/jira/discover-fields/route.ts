import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { getDecryptedToken } from '@/lib/encryption';

export const maxDuration = 30;
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Use admin client for database operations
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // Get Jira integration
    const { data: integration } = await supabaseAdmin
      .from('integrations')
      .select('*')
      .eq('user_id', user.id)
      .eq('integration_type', 'jira')
      .eq('status', 'active')
      .single();

    if (!integration) {
      return NextResponse.json({ error: 'Jira not connected' }, { status: 400 });
    }

    // Retrieve and decrypt API token
    let tokens;
    try {
      tokens = await getDecryptedToken(supabaseAdmin, integration.id);
    } catch (error) {
      console.error('Failed to decrypt Jira token:', error);
      return NextResponse.json({
        error: 'Failed to access credentials',
        details: 'Please reconnect Jira'
      }, { status: 500 });
    }

    if (!tokens) {
      return NextResponse.json({ error: 'No API token found' }, { status: 400 });
    }

    const email = integration.metadata?.email;
    const jiraAuthHeader = `Basic ${Buffer.from(`${email}:${tokens.access_token}`).toString('base64')}`;

    // 1. Fetch all available fields
    const fieldsResponse = await fetch(
      `${integration.instance_url}/rest/api/3/field`,
      {
        headers: {
          'Authorization': jiraAuthHeader,
          'Accept': 'application/json',
        },
      }
    );

    if (!fieldsResponse.ok) {
      const errorText = await fieldsResponse.text();
      return NextResponse.json({
        error: 'Failed to fetch Jira fields',
        details: errorText
      }, { status: 500 });
    }

    const allFields = await fieldsResponse.json();

    // Filter for potentially relevant fields
    const relevantFields = allFields.filter((f: any) => {
      const nameLower = (f.name || '').toLowerCase();
      const idLower = (f.id || '').toLowerCase();
      return nameLower.includes('account') ||
             nameLower.includes('customer') ||
             nameLower.includes('salesforce') ||
             nameLower.includes('organization') ||
             nameLower.includes('company') ||
             idLower.includes('account') ||
             idLower.includes('customer');
    });

    // 2. Fetch a sample issue to see what data is actually populated
    const jql = 'updated >= -30d ORDER BY updated DESC';
    const sampleResponse = await fetch(
      `${integration.instance_url}/rest/api/3/search/jql?jql=${encodeURIComponent(jql)}&maxResults=5`,
      {
        headers: {
          'Authorization': jiraAuthHeader,
          'Accept': 'application/json',
        },
      }
    );

    if (!sampleResponse.ok) {
      const errorText = await sampleResponse.text();
      return NextResponse.json({
        error: 'Failed to fetch sample issues',
        details: errorText
      }, { status: 500 });
    }

    const sampleData = await sampleResponse.json();
    const sampleIssues = sampleData.issues || [];

    // Analyze sample issues for populated fields
    const fieldUsage: Record<string, any> = {};

    sampleIssues.forEach((issue: any) => {
      const fields = issue.fields || {};

      // Check each relevant field to see if it has data
      relevantFields.forEach((field: any) => {
        const fieldValue = fields[field.id];

        if (fieldValue !== null && fieldValue !== undefined && fieldValue !== '') {
          if (!fieldUsage[field.id]) {
            fieldUsage[field.id] = {
              fieldName: field.name,
              fieldId: field.id,
              fieldType: field.schema?.type || 'unknown',
              custom: field.custom || false,
              exampleValues: [],
              populatedCount: 0
            };
          }

          fieldUsage[field.id].populatedCount++;

          // Add example value (limit to first 3)
          if (fieldUsage[field.id].exampleValues.length < 3) {
            let exampleValue = fieldValue;

            // Handle different field types
            if (typeof fieldValue === 'object') {
              if (fieldValue.displayName) exampleValue = fieldValue.displayName;
              else if (fieldValue.name) exampleValue = fieldValue.name;
              else if (fieldValue.value) exampleValue = fieldValue.value;
              else exampleValue = JSON.stringify(fieldValue).substring(0, 100);
            }

            fieldUsage[field.id].exampleValues.push({
              issueKey: issue.key,
              value: exampleValue
            });
          }
        }
      });

      // Also check for organization field (common in Jira Service Management)
      if (fields.organization) {
        if (!fieldUsage['organization']) {
          fieldUsage['organization'] = {
            fieldName: 'Organization',
            fieldId: 'organization',
            fieldType: 'organization',
            custom: false,
            exampleValues: [],
            populatedCount: 0
          };
        }
        fieldUsage['organization'].populatedCount++;
        if (fieldUsage['organization'].exampleValues.length < 3) {
          fieldUsage['organization'].exampleValues.push({
            issueKey: issue.key,
            value: fields.organization.name || fields.organization
          });
        }
      }
    });

    // Sort by most populated
    const sortedFieldUsage = Object.values(fieldUsage)
      .sort((a: any, b: any) => b.populatedCount - a.populatedCount);

    return NextResponse.json({
      success: true,
      totalFields: allFields.length,
      relevantFields: relevantFields.length,
      sampleIssuesAnalyzed: sampleIssues.length,
      fieldsWithData: sortedFieldUsage,
      recommendations: sortedFieldUsage.slice(0, 3).map((f: any) => ({
        fieldId: f.fieldId,
        fieldName: f.fieldName,
        reason: `Found in ${f.populatedCount}/${sampleIssues.length} sample issues`,
        examples: f.exampleValues
      }))
    });

  } catch (error) {
    console.error('Field discovery error:', error);
    return NextResponse.json({
      error: 'Field discovery failed',
      details: error instanceof Error ? error.message : 'Unknown'
    }, { status: 500 });
  }
}
