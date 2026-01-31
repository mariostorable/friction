#!/bin/bash
# Test the analysis endpoint directly to see what's happening

echo "Testing analysis endpoint directly..."
echo ""

# Replace with your actual deployment URL
DEPLOYMENT_URL="https://friction-intelligence.vercel.app"

echo "Calling: ${DEPLOYMENT_URL}/api/cron/analyze-portfolio"
echo ""

# Call the endpoint and show response
curl -v \
  -X GET \
  "${DEPLOYMENT_URL}/api/cron/analyze-portfolio" \
  -H "Content-Type: application/json" \
  2>&1 | tee analysis-response.log

echo ""
echo ""
echo "Response saved to analysis-response.log"
echo ""
echo "Check the response above for:"
echo "  - HTTP status code (should be 200)"
echo "  - 'success: true' in JSON response"
echo "  - 'summary' with analyzed/skipped counts"
echo ""
echo "If you see errors, check Vercel logs for more details"
