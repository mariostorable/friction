import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function findCommonwealth() {
  const { data: integrations } = await supabase.from('integrations').select('*');
  const integration = integrations?.find(i => i.integration_type === 'salesforce');
  
  if (!integration?.metadata?.access_token) {
    console.log('No Salesforce token');
    return;
  }

  const token = integration.metadata.access_token;
  const url = integration.instance_url;
  
  const query = 'SELECT Id, Name, MRR_MVR__c, ShippingCity, BillingCity FROM Account WHERE Name LIKE \'%Commonwealth%\'';
  const apiUrl = url + '/services/data/v59.0/query?q=' + encodeURIComponent(query);
  
  const res = await fetch(apiUrl, {
    headers: { Authorization: 'Bearer ' + token }
  });
  
  const data = await res.json();
  console.log('Commonwealth in Salesforce:', JSON.stringify(data.records, null, 2));
}

findCommonwealth();
