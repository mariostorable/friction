// =====================================================================
// DISCOVER: Find all address-related fields in Salesforce Account object
// =====================================================================
// Run this in your browser console on a Salesforce page, or we can add
// it as an API endpoint
// =====================================================================

// This will query Salesforce to find all address/location fields
const discoverAddressFields = async () => {
  // You'll need to provide your Salesforce session ID
  const sessionId = 'YOUR_SESSION_ID_HERE'; // Get from cookies or login
  const instanceUrl = 'https://your-instance.salesforce.com';

  const response = await fetch(`${instanceUrl}/services/data/v59.0/sobjects/Account/describe`, {
    headers: {
      'Authorization': `Bearer ${sessionId}`,
      'Content-Type': 'application/json'
    }
  });

  const metadata = await response.json();

  // Filter for address-related fields
  const addressFields = metadata.fields.filter(field => {
    const name = field.name.toLowerCase();
    return name.includes('address') ||
           name.includes('street') ||
           name.includes('city') ||
           name.includes('state') ||
           name.includes('zip') ||
           name.includes('postal') ||
           name.includes('country') ||
           name.includes('latitude') ||
           name.includes('longitude') ||
           name.includes('location') ||
           name.includes('corporate') ||
           name.includes('headquarters');
  });

  console.log('Address-related fields found:');
  addressFields.forEach(field => {
    console.log(`${field.name} (${field.type}) - ${field.label}`);
  });

  return addressFields;
};
