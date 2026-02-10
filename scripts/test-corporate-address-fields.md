# Test Corporate Address Fields

## Currently Syncing These Address Fields:
From the Salesforce sync query (line 99), we're pulling:

**Standard Address Fields:**
- ShippingStreet, ShippingCity, ShippingState, ShippingPostalCode, ShippingCountry
- BillingStreet, BillingCity, BillingState, BillingPostalCode, BillingCountry

**SmartyStreets Geocode Fields:**
- smartystreets__Shipping_Latitude__c
- smartystreets__Shipping_Longitude__c
- smartystreets__Billing_Latitude__c
- smartystreets__Billing_Longitude__c

**Result**: All NULL for parent accounts (you confirmed this)

---

## Corporate Address Fields We Should Try Adding:

Based on common Salesforce implementations for storage companies, the corporate HQ address is usually in one of these field patterns:

### Option 1: Corporate_* Fields
```
Corporate_Street__c
Corporate_City__c
Corporate_State__c
Corporate_Postal_Code__c
Corporate_Country__c
Corporate_Latitude__c (might exist)
Corporate_Longitude__c (might exist)
```

### Option 2: Headquarters_* or HQ_* Fields
```
Headquarters_Street__c
Headquarters_City__c
Headquarters_State__c

OR

HQ_Street__c
HQ_City__c
HQ_State__c
```

### Option 3: Parent_Address (Compound Field)
```
Parent_Address__c (contains full address)
Parent_Street__c
Parent_City__c
Parent_State__c
```

### Option 4: Main_Office_* Fields
```
Main_Office_Street__c
Main_Office_City__c
Main_Office_State__c
```

---

## Let's Test This!

I'll add ALL these field names to the Salesforce query. If a field doesn't exist, Salesforce will just ignore it (won't break anything). Then we'll see which ones return data!

**Should I proceed with adding these fields to test?**

This way we can discover which fields actually exist in your Salesforce without you having to manually check.
