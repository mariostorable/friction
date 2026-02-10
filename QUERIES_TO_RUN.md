# 🔍 Queries to Run - Copy/Paste These

## Query 1: Find Storage Accounts WITH Addresses
**Purpose**: See which storage accounts actually have address data

**Copy this entire query:**
```sql
SELECT
  name,
  arr,
  property_address_city || ', ' || property_address_state as property_addr,
  billing_address_city || ', ' || billing_address_state as billing_addr,
  latitude,
  longitude,
  products
FROM accounts
WHERE vertical = 'storage'
  AND status = 'active'
  AND (
    property_address_city IS NOT NULL
    OR billing_address_city IS NOT NULL
    OR latitude IS NOT NULL
  )
ORDER BY arr DESC NULLS LAST
LIMIT 25;
```

---

## Query 2: Address Coverage Summary
**Purpose**: See how many storage accounts have NO addresses

**Copy this entire query:**
```sql
SELECT
  COUNT(*) as total_storage_accounts,
  COUNT(CASE WHEN property_address_city IS NOT NULL THEN 1 END) as has_property_address,
  COUNT(CASE WHEN billing_address_city IS NOT NULL THEN 1 END) as has_billing_address,
  COUNT(CASE WHEN latitude IS NOT NULL THEN 1 END) as has_geocode,
  COUNT(CASE WHEN property_address_city IS NULL AND billing_address_city IS NULL THEN 1 END) as no_address_at_all,
  COUNT(CASE WHEN name LIKE '%CORP%' THEN 1 END) as corporate_parent_accounts
FROM accounts
WHERE vertical = 'storage'
  AND status = 'active';
```

---

## Query 3: Check Salesforce for Child Locations
**Purpose**: See if there are child accounts (individual facilities) we should sync instead

**Copy this entire query:**
```sql
SELECT
  COUNT(*) as total_accounts,
  COUNT(CASE WHEN ultimate_parent_id IS NOT NULL THEN 1 END) as child_accounts,
  COUNT(CASE WHEN ultimate_parent_id IS NULL THEN 1 END) as parent_accounts
FROM accounts
WHERE vertical = 'storage'
  AND status = 'active';
```

---

## Next Step: Find the Corporate Address Field in Salesforce

Since all your parent accounts have **NULL for both ShippingAddress and BillingAddress**, we need to find the corporate/headquarters address field.

### Option 1: Check Salesforce UI (Fastest)
1. Open Salesforce
2. Go to any Account record (like "Public Storage - CORP.")
3. Look for address fields with names like:
   - Corporate Address
   - Headquarters Address
   - HQ Address
   - Main Office Address
   - Parent Address
4. Write down the field name (will end with `__c` if custom)

### Option 2: Ask Your Salesforce Admin
"What field stores the corporate headquarters address for parent accounts?"

### Once You Know the Field Name

Tell me the field names (example: `Corporate_Street__c`, `HQ_City__c`, etc.) and I'll:
1. Add them to the Salesforce sync query
2. Update the sync to prioritize that address
3. Re-sync to populate the addresses

Then your top 500 storage accounts will show up in Visit Planner!
