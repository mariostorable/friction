# How to Discover Salesforce Address Fields

Since localhost isn't working, here are alternative approaches:

## Option 1: Check in Salesforce UI (Quickest)

1. Go to your Salesforce org
2. Open any Account record (preferably a storage account)
3. Look for address fields that contain:
   - Corporate address
   - Headquarters address
   - Parent company address
   - Main office address
4. Note the **API field names** (they'll end with `__c` for custom fields)

Common patterns:
- `Corporate_Street__c`, `Corporate_City__c`, `Corporate_State__c`, etc.
- `Headquarters_Address__c`
- `Parent_Address__c`
- `HQ_Street__c`, `HQ_City__c`, etc.

## Option 2: Ask Your Salesforce Admin

Your Salesforce admin can quickly tell you:
- What field stores the corporate/headquarters address
- Whether it's a compound address field or separate fields
- Which accounts have this field populated

## Option 3: Temporary Logging in Sync

I can add temporary logging to the sync to dump all field names. Here's what to do:

### Step 1: Add this to the sync code

At line 157 in `/app/api/salesforce/sync/route.ts`, add:

```typescript
const accountsData = await accountsResponse.json();

// DEBUG: Log ALL field names from first account
if (accountsData.records && accountsData.records.length > 0) {
  console.log('🔍 ALL SALESFORCE FIELDS:');
  console.log(Object.keys(accountsData.records[0]));

  // Look for address-related fields
  const addressFields = Object.keys(accountsData.records[0]).filter(key => {
    const lower = key.toLowerCase();
    return lower.includes('address') || lower.includes('street') ||
           lower.includes('city') || lower.includes('corporate') ||
           lower.includes('headquarters') || lower.includes('hq');
  });
  console.log('📍 ADDRESS-RELATED FIELDS:', addressFields);
}
```

### Step 2: Run Salesforce sync

Trigger a sync from the dashboard, then check your server logs (Vercel logs or terminal).

### Step 3: Share the output

Look for the lines starting with `🔍` and `📍` and share what you see.

## Option 4: Just Tell Me the Field Name

If you know what the corporate address field is called in your Salesforce (like `Corporate_Address__c` or `HQ_City__c`), just tell me and I'll add it to the sync immediately!

## Most Likely Field Names for Storage Companies

Based on common Salesforce implementations:
- `Corporate_Street__c`
- `Corporate_City__c`
- `Corporate_State__c`
- `Corporate_Postal_Code__c`
- `Corporate_Country__c`

Or sometimes:
- `Headquarters_Street__c`
- `Headquarters_City__c`
- etc.

Once we know the field name(s), I'll:
1. Add them to the SOQL query
2. Update the sync to prefer corporate > shipping > billing
3. Your top storage accounts will show up in Visit Planner!
