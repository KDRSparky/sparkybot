/**
 * Debug the complete auth flow
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { google } from 'googleapis';

async function main() {
  console.log('=== AUTH FLOW DEBUG ===\n');

  // Step 1: Check environment variables
  console.log('1. Environment Variables:');
  console.log('   GOOGLE_CLIENT_ID:', process.env.GOOGLE_CLIENT_ID ? '✅ Set' : '❌ Missing');
  console.log('   GOOGLE_CLIENT_SECRET:', process.env.GOOGLE_CLIENT_SECRET ? '✅ Set' : '❌ Missing');
  console.log('   SUPABASE_URL:', process.env.SUPABASE_URL ? '✅ Set' : '❌ Missing');
  console.log('   SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? '✅ Set' : '❌ Missing');

  // Step 2: Test Supabase connection and fetch token
  console.log('\n2. Fetching token from Supabase:');
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    console.log('   ❌ Supabase not configured');
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const email = 'johndempsey@johndempsey.us';
  
  const { data, error } = await supabase
    .from('preferences')
    .select('value')
    .eq('category', 'google_oauth')
    .eq('key', `refresh_token_${email}`)
    .single();

  if (error) {
    console.log('   ❌ Error fetching token:', error.message);
    return;
  }

  console.log('   ✅ Found record for:', email);
  console.log('   Data keys:', Object.keys(data || {}));
  console.log('   Value keys:', Object.keys(data?.value || {}));
  
  const refreshToken = data?.value?.refresh_token;
  console.log('   Refresh token:', refreshToken ? refreshToken.substring(0, 20) + '...' : '❌ Missing');

  if (!refreshToken) {
    console.log('\n   ❌ No refresh_token in value object!');
    console.log('   Full value:', JSON.stringify(data?.value, null, 2));
    return;
  }

  // Step 3: Test OAuth with the token
  console.log('\n3. Testing OAuth with Supabase token:');
  
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    'http://localhost:3456/oauth/callback'
  );

  oauth2Client.setCredentials({ refresh_token: refreshToken });

  try {
    const tokenResponse = await oauth2Client.getAccessToken();
    console.log('   ✅ Access token obtained!');
    
    // Test Calendar
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    const calList = await calendar.calendarList.list({ maxResults: 1 });
    console.log('   ✅ Calendar access works! Found', calList.data.items?.length, 'calendar(s)');
  } catch (err: any) {
    console.log('   ❌ OAuth failed:', err.message);
    if (err.response?.data) {
      console.log('   Details:', JSON.stringify(err.response.data, null, 2));
    }
  }

  console.log('\n=== DEBUG COMPLETE ===');
}

main().catch(console.error);
