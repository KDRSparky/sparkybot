/**
 * Test Google API Connection
 * 
 * Run with: npx tsx tests/test-google.ts
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { 
  testGoogleConnection, 
  isGoogleConfigured,
  getCalendarService,
  getGmailService,
  PRIMARY_EMAIL 
} from '../src/services/google-auth.js';

async function main() {
  console.log('🧪 Google API Connection Test\n');
  console.log('═'.repeat(60));

  // Check if configured
  if (!isGoogleConfigured()) {
    console.error('❌ Google credentials not configured!');
    console.error('   Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env');
    process.exit(1);
  }

  console.log('✅ Google credentials configured');
  console.log(`📧 Primary email: ${PRIMARY_EMAIL}\n`);

  // Test connection
  console.log('Testing API access...\n');
  
  const result = await testGoogleConnection();
  
  console.log('─'.repeat(60));
  console.log(`\n📧 Account: ${result.email}`);
  console.log(`📅 Calendar API: ${result.services.calendar ? '✅ Connected' : '❌ Failed'}`);
  console.log(`📬 Gmail API: ${result.services.gmail ? '✅ Connected' : '❌ Failed'}`);
  console.log(`📁 Drive API: ${result.services.drive ? '✅ Connected' : '❌ Failed'}`);
  
  if (result.error) {
    console.log(`\n⚠️ Error: ${result.error}`);
  }

  // If Calendar works, show upcoming events
  if (result.services.calendar) {
    console.log('\n─'.repeat(60));
    console.log('\n📅 Upcoming Calendar Events:\n');
    
    const calendar = await getCalendarService();
    if (calendar) {
      const now = new Date();
      const endOfWeek = new Date(now);
      endOfWeek.setDate(now.getDate() + 7);
      
      const events = await calendar.events.list({
        calendarId: 'primary',
        timeMin: now.toISOString(),
        timeMax: endOfWeek.toISOString(),
        maxResults: 5,
        singleEvents: true,
        orderBy: 'startTime',
      });

      if (events.data.items && events.data.items.length > 0) {
        events.data.items.forEach((event, i) => {
          const start = event.start?.dateTime || event.start?.date;
          console.log(`   ${i + 1}. ${event.summary} (${start})`);
        });
      } else {
        console.log('   No upcoming events in the next 7 days.');
      }
    }
  }

  // If Gmail works, show recent emails
  if (result.services.gmail) {
    console.log('\n─'.repeat(60));
    console.log('\n📬 Recent Emails (last 5):\n');
    
    const gmail = await getGmailService();
    if (gmail) {
      const messages = await gmail.users.messages.list({
        userId: 'me',
        maxResults: 5,
        q: 'is:inbox',
      });

      if (messages.data.messages && messages.data.messages.length > 0) {
        for (const msg of messages.data.messages) {
          const full = await gmail.users.messages.get({
            userId: 'me',
            id: msg.id!,
            format: 'metadata',
            metadataHeaders: ['From', 'Subject'],
          });
          
          const from = full.data.payload?.headers?.find(h => h.name === 'From')?.value || 'Unknown';
          const subject = full.data.payload?.headers?.find(h => h.name === 'Subject')?.value || '(no subject)';
          
          console.log(`   • ${subject}`);
          console.log(`     From: ${from.substring(0, 50)}${from.length > 50 ? '...' : ''}\n`);
        }
      } else {
        console.log('   No recent emails.');
      }
    }
  }

  console.log('\n' + '═'.repeat(60));
  console.log(`\n${result.success ? '🎉 Google API test PASSED!' : '❌ Google API test FAILED'}\n`);
}

main().catch(console.error);
