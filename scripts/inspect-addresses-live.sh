#!/bin/bash

# Get user_id from database
USER_ID=$(psql "$DATABASE_URL" -t -c "SELECT id FROM auth.users LIMIT 1;" | xargs)

if [ -z "$USER_ID" ]; then
  echo "❌ Could not get user_id from database"
  exit 1
fi

echo "✅ Found user_id: $USER_ID"
echo ""
echo "🔍 Inspecting Salesforce addresses..."
echo ""

# Call the endpoint
curl -s "https://friction-intelligence.vercel.app/api/salesforce/inspect-addresses?user_id=$USER_ID" | python3 -m json.tool

echo ""
echo "✅ Done!"
