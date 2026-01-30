/**
 * Test Calendar Integration
 * 
 * Verifies Google Calendar API access for both accounts
 */

import { testGoogleConnection, PRIMARY_EMAIL } from '../src/services/google-auth.js';
import { getUpcomingEvents, getTodaysEvents, formatEventsSummary } from '../src/skills/calendar/index.js';

async function testCalendar() {
  console.log('🧪 Testing Calendar Integration\n');
  console.log('=' .repeat(50));

  // Test connection for primary account
  console.log(`\n📧 Testing connection for ${PRIMARY_EMAIL}...`);
  const primaryResult = await testGoogleConnection(PRIMARY_EMAIL);
  console.log('   Calendar:', primaryResult.services.calendar ? '✅' : '❌');
  console.log('   Gmail:', primaryResult.services.gmail ? '✅' : '❌');
  console.log('   Drive:', primaryResult.services.drive ? '✅' : '❌');
  if (primaryResult.error) {
    console.log('   Error:', primaryResult.error);
  }

  // Test connection for secondary account
  const secondaryEmail = 'kdrsparky@gmail.com';
  console.log(`\n📧 Testing connection for ${secondaryEmail}...`);
  const secondaryResult = await testGoogleConnection(secondaryEmail);
  console.log('   Calendar:', secondaryResult.services.calendar ? '✅' : '❌');
  console.log('   Gmail:', secondaryResult.services.gmail ? '✅' : '❌');
  console.log('   Drive:', secondaryResult.services.drive ? '✅' : '❌');
  if (secondaryResult.error) {
    console.log('   Error:', secondaryResult.error);
  }

  // Test fetching events
  if (primaryResult.services.calendar) {
    console.log('\n📅 Fetching today\'s events...');
    try {
      const todayEvents = await getTodaysEvents(PRIMARY_EMAIL);
      console.log(`   Found ${todayEvents.length} event(s) today`);
      if (todayEvents.length > 0) {
        console.log('\n' + formatEventsSummary(todayEvents));
      }
    } catch (error: any) {
      console.log('   Error:', error.message);
    }

    console.log('\n📅 Fetching upcoming events (next 7 days)...');
    try {
      const upcomingEvents = await getUpcomingEvents(7, PRIMARY_EMAIL);
      console.log(`   Found ${upcomingEvents.length} event(s) in next 7 days`);
      if (upcomingEvents.length > 0 && upcomingEvents.length <= 10) {
        console.log('\n' + formatEventsSummary(upcomingEvents));
      }
    } catch (error: any) {
      console.log('   Error:', error.message);
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log('✅ Calendar integration test complete!');
}

testCalendar().catch(console.error);
