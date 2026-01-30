import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function storeTokens() {
  const tokens = [
    {
      category: 'google_oauth',
      key: 'refresh_token_johndempsey@johndempsey.us',
      value: { 
        refresh_token: '1//0ffUkoDSqRgRgCgYIARAGA8SNwF-L9IrFQpnoPnwuQBFgxQFSaYXII4aPmvZ28jN98PYsaALFMrXVsOAQFLvPHrpKhcRyajNdCM',
        email: 'johndempsey@johndempsey.us'
      }
    },
    {
      category: 'google_oauth', 
      key: 'refresh_token_kdrsparky@gmail.com',
      value: {
        refresh_token: '1//0fmzet5qeoopMCgYIARAGA8SNwF-L9IrSt1qY4CvOM5aZSTnfr99c9S5PZtXUWEpfuZf06UIYLZoXICfXqkigq4xAfhb--u3AgQ',
        email: 'kdrsparky@gmail.com'
      }
    }
  ];

  for (const token of tokens) {
    const { error } = await supabase
      .from('preferences')
      .upsert(token, { onConflict: 'category,key' });
    
    if (error) {
      console.error(`Failed to store token for ${token.value.email}:`, error);
    } else {
      console.log(`✅ Stored token for ${token.value.email}`);
    }
  }
}

storeTokens();
