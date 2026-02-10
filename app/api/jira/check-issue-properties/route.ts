import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { getDecryptedToken } from '@/lib/encryption';

export const maxDuration = 30;
export const dynamic = 'force-dynamic';

/**
 * Check issue properties and remote links for Salesforce data
 * Jira-Salesforce connector apps often store data there instead of custom fields
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const issueKey = searchParams.get('issueKey') || 'CRM-34'; // Default to the ticket we saw

    // Use admin client
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

    const tokens = await getDecryptedToken(supabaseAdmin, integration.id);
    if (!tokens) {
      return NextResponse.json({ error: 'No API token found' }, { status: 400 });
    }

    const email = integration.metadata?.email;
    const jiraAuthHeader = `Basic ${Buffer.from(`${email}:${tokens.access_token}`).toString('base64')}`;

    // 1. Get the issue with all fields
    const issueResponse = await fetch(
      `${integration.instance_url}/rest/api/3/issue/${issueKey}?fields=*all`,
      {
        headers: {
          'Authorization': jiraAuthHeader,
          'Accept': 'application/json',
        },
      }
    );

    if (!issueResponse.ok) {
      const errorText = await issueResponse.text();
      return NextResponse.json({
        error: 'Failed to fetch issue',
        details: errorText
      }, { status: 500 });
    }

    const issue = await issueResponse.json();

    // 2. Get issue remote links
    const remoteLinksResponse = await fetch(
      `${integration.instance_url}/rest/api/3/issue/${issueKey}/remotelink`,
      {
        headers: {
          'Authorization': jiraAuthHeader,
          'Accept': 'application/json',
        },
      }
    );

    const remoteLinks = remoteLinksResponse.ok ? await remoteLinksResponse.json() : [];

    // 3. Get issue properties (app-specific metadata)
    const propertiesResponse = await fetch(
      `${integration.instance_url}/rest/api/3/issue/${issueKey}/properties`,
      {
        headers: {
          'Authorization': jiraAuthHeader,
          'Accept': 'application/json',
        },
      }
    );

    const properties = propertiesResponse.ok ? await propertiesResponse.json() : { keys: [] };

    // 4. Fetch each property's value
    const propertyValues: any = {};
    for (const prop of properties.keys || []) {
      const propResponse = await fetch(
        `${integration.instance_url}/rest/api/3/issue/${issueKey}/properties/${prop.key}`,
        {
          headers: {
            'Authorization': jiraAuthHeader,
            'Accept': 'application/json',
          },
        }
      );
      if (propResponse.ok) {
        const propData = await propResponse.json();
        propertyValues[prop.key] = propData.value;
      }
    }

    // Look for Salesforce-related data
    const salesforceRemoteLinks = remoteLinks.filter((link: any) => {
      const linkStr = JSON.stringify(link).toLowerCase();
      return linkStr.includes('salesforce') || linkStr.includes('case');
    });

    const salesforceProperties = Object.entries(propertyValues).filter(([key, value]) => {
      const str = JSON.stringify({ key, value }).toLowerCase();
      return str.includes('salesforce') || str.includes('case');
    });

    // Check all custom fields for Salesforce data
    const customFields = Object.entries(issue.fields || {})
      .filter(([key]) => key.startsWith('customfield_'))
      .map(([key, value]) => ({
        fieldId: key,
        value,
        valueStr: JSON.stringify(value),
        containsCaseNumber: /\b\d{8}\b/.test(JSON.stringify(value)),
        containsSalesforceId: /\b500[a-zA-Z0-9]{12,15}\b/.test(JSON.stringify(value))
      }))
      .filter(f => f.value !== null && f.value !== undefined && f.value !== '');

    return NextResponse.json({
      success: true,
      issueKey,
      summary: issue.fields.summary,
      // Remote links (Salesforce connections)
      totalRemoteLinks: remoteLinks.length,
      salesforceRemoteLinks,
      // Issue properties (app metadata)
      totalProperties: (properties.keys || []).length,
      propertyKeys: (properties.keys || []).map((k: any) => k.key),
      propertyValues,
      salesforceProperties,
      // Custom fields
      totalCustomFields: customFields.length,
      customFieldsWithCaseNumbers: customFields.filter(f => f.containsCaseNumber),
      customFieldsWithSalesforceIds: customFields.filter(f => f.containsSalesforceId),
      // All custom fields for debugging
      allCustomFields: customFields
    });

  } catch (error) {
    console.error('Property check error:', error);
    return NextResponse.json({
      error: 'Property check failed',
      details: error instanceof Error ? error.message : 'Unknown'
    }, { status: 500 });
  }
}
