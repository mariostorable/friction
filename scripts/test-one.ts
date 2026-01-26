import { config } from 'dotenv';
config({ path: '.env.local' });

async function testOne() {
  const accountId = '8fbf8ef9-c064-4db6-a88b-7b77e31c7e99';
  
  console.log('Testing sync for one account...');
  
  const res = await fetch('https://friction-intelligence.vercel.app/api/salesforce/sync-cases', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accountId }),
  });

  const result = await res.json();
  console.log('Full response:', JSON.stringify(result, null, 2));
}

testOne();
