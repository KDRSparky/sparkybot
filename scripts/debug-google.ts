/**
 * Debug script to test Google OAuth
 */

// Load env first
import 'dotenv/config';

console.log('Environment variables:');
console.log('GOOGLE_CLIENT_ID:', process.env.GOOGLE_CLIENT_ID ? 'SET' : 'NOT SET');
console.log('GOOGLE_CLIENT_SECRET:', process.env.GOOGLE_CLIENT_SECRET ? 'SET' : 'NOT SET');
console.log('GOOGLE_REFRESH_TOKEN_JOHNDEMPSEY:', process.env.GOOGLE_REFRESH_TOKEN_JOHNDEMPSEY ? 'SET' : 'NOT SET');
console.log('GOOGLE_REFRESH_TOKEN_KDRSPARKY:', process.env.GOOGLE_REFRESH_TOKEN_KDRSPARKY ? 'SET' : 'NOT SET');
console.log('SUPABASE_URL:', process.env.SUPABASE_URL ? 'SET' : 'NOT SET');
console.log('SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SET' : 'NOT SET');

// Now import google-auth
import { getAuthenticatedClient, testGoogleConnection, isGoogleConfigured } from '../src/services/google-auth.js';

async function main() {
  console.log('\nGoogle configured:', isGoogleConfigured());
  
  console.log('\nTesting authenticated client for johndempsey@johndempsey.us...');
  const client = await getAuthenticatedClient('johndempsey@johndempsey.us');
  console.log('Client result:', client ? 'SUCCESS' : 'FAILED');
  
  if (client) {
    console.log('\nTesting full Google connection...');
    const result = await testGoogleConnection('johndempsey@johndempsey.us');
    console.log('Connection result:', result);
  }
}

main().catch(err => {
  console.error('Error:', err);
});
