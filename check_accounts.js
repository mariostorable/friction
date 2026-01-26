const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkAccounts() {
  // Check the "Top 25 by MRR" portfolios
  const { data: portfolios } = await supabase
    .from('portfolios')
    .select('id, user_id, portfolio_type, account_ids')
    .eq('portfolio_type', 'top_25');

  console.log(`\nFound ${portfolios.length} "Top 25 by MRR" portfolio(s):`);
  for (let i = 0; i < portfolios.length; i++) {
    const p = portfolios[i];
    console.log(`\nPortfolio ${i + 1}:`);
    console.log(`- User ID: ${p.user_id}`);
    console.log(`- Accounts: ${p.account_ids.length}`);
    console.log(`- First 3 account IDs:`, p.account_ids.slice(0, 3));
  }

  // Check if the "successfully analyzed" accounts exist
  const newAccountIds = [
    '8e56bbe1-8c27-4ed2-ac03-9652c056ba3d',
    '9626e0ff-9c16-49ee-842b-d8cc274a61f2',
    '283314b6-8b69-4e1f-8948-d19db71acd5a',
    '40c86618-4cfa-44c0-9afd-af8b6cbc1d2f',
    '5155329f-b5b6-44b1-aecc-3b5614406333'
  ];

  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, name, user_id')
    .in('id', newAccountIds);

  console.log(`\n\nAccounts that were "successfully" analyzed:`);
  accounts.forEach(a => {
    console.log(`- ${a.name} (User: ${a.user_id})`);
  });

  // Check friction cards for these accounts
  const { data: cards } = await supabase
    .from('friction_cards')
    .select('id, account_id')
    .in('account_id', newAccountIds);

  console.log(`\nFriction cards found for these accounts: ${cards.length}`);
  const cardsByAccount = {};
  cards.forEach(c => {
    cardsByAccount[c.account_id] = (cardsByAccount[c.account_id] || 0) + 1;
  });
  Object.entries(cardsByAccount).forEach(([aid, count]) => {
    const acc = accounts.find(a => a.id === aid);
    console.log(`- ${acc?.name}: ${count} cards`);
  });
}

checkAccounts();
