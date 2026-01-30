/**
 * Sync refresh tokens from environment variables to Supabase
 * This ensures the tokens in Supabase match the working ones
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

async function main() {
  console.log('=== SYNCING TOKENS TO SUPABASE ===\n');

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.log('❌ Supabase not configured');
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Tokens to sync
  const tokens = [
    {
      email: 'johndempsey@johndempsey.us',
      refreshToken: process.env.GOOGLE_REFRESH_TOKEN_JOHNDEMPSEY,
    },
    {
      email: 'kdrsparky@gmail.com',
      refreshToken: process.env.GOOGLE_REFRESH_TOKEN_KDRSPARKY,
    },
  ];

  for (const { email, refreshToken } of tokens) {
    if (!refreshToken) {
      console.log(`❌ No token in env for ${email}`);
      continue;
    }

    console.log(`Syncing token for ${email}...`);
    console.log(`   Token length: ${refreshToken.length}`);
    console.log(`   Token preview: ${refreshToken.substring(0, 30)}...`);

    const { error } = await supabase
      .from('preferences')
      .upsert({
        category: 'google_oauth',
        key: `refresh_token_${email}`,
        value: { refresh_token: refreshToken, email },
        updated_at: new Date().toISOString(),
      }, { onConflict: 'category,key' });

    if (error) {
      console.log(`   ❌ Error: ${error.message}`);
    } else {
      console.log(`   ✅ Token synced successfully`);
    }
  }

  console.log('\n=== SYNC COMPLETE ===');
}

main().catch(console.error);
