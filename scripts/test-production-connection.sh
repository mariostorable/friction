#!/bin/bash

# Get your session cookie from browser and set it here
# Or this script will help you test the production API

echo "🔍 Testing Production Salesforce Connection"
echo ""
echo "Option 1: Visit in browser (recommended):"
echo "https://friction-intelligence.vercel.app/api/salesforce/test-connection"
echo ""
echo "Option 2: Check token status:"
echo ""

# Check token encryption status
if [ -z "$CRON_SECRET" ]; then
  echo "⚠️  CRON_SECRET not set in environment"
  echo "Set it with: export CRON_SECRET=your-secret"
  echo ""
else
  echo "Checking token encryption status..."
  curl -s -X GET https://friction-intelligence.vercel.app/api/debug/check-tokens \
    -H "Authorization: Bearer $CRON_SECRET" | jq '.'
  echo ""
fi

echo "Option 3: Check production logs:"
echo "Visit: https://vercel.com/your-team/friction-intelligence/logs"
echo ""
echo "Look for errors containing:"
echo "  - 'Failed to fetch accounts'"
echo "  - 'Token decryption error'"
echo "  - 'Salesforce'"
