/**
 * Debug script to test Google OAuth - Detailed
 */

import 'dotenv/config';
import { google } from 'googleapis';

async function main() {
  console.log('=== DETAILED GOOGLE DEBUG ===\n');

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN_JOHNDEMPSEY;

  console.log('Client ID:', clientId?.substring(0, 20) + '...');
  console.log('Client Secret:', clientSecret?.substring(0, 10) + '...');
  console.log('Refresh Token:', refreshToken?.substring(0, 20) + '...');

  // Create OAuth2 client
  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    'http://localhost:3456/oauth/callback'
  );

  // Set refresh token
  oauth2Client.setCredentials({
    refresh_token: refreshToken,
  });

  console.log('\nAttempting to get access token...');
  
  try {
    const tokenResponse = await oauth2Client.getAccessToken();
    console.log('✅ Access token obtained!');
    console.log('Token:', tokenResponse.token?.substring(0, 20) + '...');
  } catch (error: any) {
    console.log('❌ Failed to get access token');
    console.log('Error message:', error.message);
    console.log('Error details:', JSON.stringify(error.response?.data, null, 2));
  }

  // Try using the client with Calendar
  console.log('\nTrying Calendar API...');
  
  try {
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    const calList = await calendar.calendarList.list({ maxResults: 1 });
    console.log('✅ Calendar access successful!');
    console.log('Calendars found:', calList.data.items?.length);
  } catch (error: any) {
    console.log('❌ Calendar API failed');
    console.log('Error message:', error.message);
    console.log('Error details:', JSON.stringify(error.response?.data, null, 2));
  }
}

main().catch(console.error);
