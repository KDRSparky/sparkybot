/**
 * Test Email Integration
 * 
 * Verifies Gmail API access for both accounts
 */

import 'dotenv/config';
import { testGoogleConnection, PRIMARY_EMAIL } from '../src/services/google-auth.js';
import { 
  getUnreadEmails, 
  getRecentEmails, 
  searchEmails,
  formatEmailsSummary 
} from '../src/skills/email/index.js';

async function testEmail() {
  console.log('🧪 Testing Email Integration\n');
  console.log('='.repeat(50));

  // Test connection for primary account
  console.log(`\n📧 Testing connection for ${PRIMARY_EMAIL}...`);
  const result = await testGoogleConnection(PRIMARY_EMAIL);
  console.log('   Gmail:', result.services.gmail ? '✅' : '❌');
  if (result.error) {
    console.log('   Error:', result.error);
    return;
  }

  // Test fetching unread emails
  console.log('\n📬 Fetching unread emails...');
  try {
    const unreadEmails = await getUnreadEmails(5, PRIMARY_EMAIL);
    console.log(`   Found ${unreadEmails.length} unread email(s)`);
    if (unreadEmails.length > 0) {
      console.log('\n' + formatEmailsSummary(unreadEmails));
    }
  } catch (error: any) {
    console.log('   Error:', error.message);
  }

  // Test fetching recent emails
  console.log('\n📥 Fetching recent emails (last 5)...');
  try {
    const recentEmails = await getRecentEmails(5, PRIMARY_EMAIL);
    console.log(`   Found ${recentEmails.length} recent email(s)`);
    if (recentEmails.length > 0) {
      console.log('\n' + formatEmailsSummary(recentEmails));
    }
  } catch (error: any) {
    console.log('   Error:', error.message);
  }

  // Test searching emails
  console.log('\n🔍 Searching for emails from today...');
  try {
    const todayEmails = await searchEmails('newer_than:1d', 5, PRIMARY_EMAIL);
    console.log(`   Found ${todayEmails.length} email(s) from today`);
  } catch (error: any) {
    console.log('   Error:', error.message);
  }

  // Test secondary account
  const secondaryEmail = 'kdrsparky@gmail.com';
  console.log(`\n📧 Testing connection for ${secondaryEmail}...`);
  const secondaryResult = await testGoogleConnection(secondaryEmail);
  console.log('   Gmail:', secondaryResult.services.gmail ? '✅' : '❌');

  if (secondaryResult.services.gmail) {
    console.log('\n📬 Fetching unread emails from secondary account...');
    try {
      const unreadEmails = await getUnreadEmails(3, secondaryEmail);
      console.log(`   Found ${unreadEmails.length} unread email(s)`);
    } catch (error: any) {
      console.log('   Error:', error.message);
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log('✅ Email integration test complete!');
}

testEmail().catch(console.error);
