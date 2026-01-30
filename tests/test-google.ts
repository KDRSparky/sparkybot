/**
 * Test Google API Connection
 * 
 * Run with: npx tsx tests/test-google.ts
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { testGoogleConnection, PRIMARY_EMAIL, isGoogleConfigured } from '../src/services/google-auth.js';

async function main() {
  console.log('🧪 Google API Connection Test\n');
  console.log('═'.repeat(60));

  if (!isGoogleConfigured()) {
    console.error('❌ Google credentials not configured!');
    console.error('   Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env');
    process.exit(1);
  }

  console.log(`\n📋 Primary Email: ${PRIMARY_EMAIL}`);
  console.log(`📋 Client ID: ${process.env.GOOGLE_CLIENT_ID?.substring(0, 20)}...`);
  
  // Test primary account
  console.log(`\n\n🔍 Testing: johndempsey@johndempsey.us`);
  console.log('─'.repeat(60));
  
  const result1 = await testGoogleConnection('johndempsey@johndempsey.us');
  console.log(`   Calendar: ${result1.services.calendar ? '✅' : '❌'}`);
  console.log(`   Gmail:    ${result1.services.gmail ? '✅' : '❌'}`);
  console.log(`   Drive:    ${result1.services.drive ? '✅' : '❌'}`);
  if (result1.error) {
    console.log(`   Error: ${result1.error}`);
  }

  // Test secondary account
  console.log(`\n\n🔍 Testing: kdrsparky@gmail.com`);
  console.log('─'.repeat(60));
  
  const result2 = await testGoogleConnection('kdrsparky@gmail.com');
  console.log(`   Calendar: ${result2.services.calendar ? '✅' : '❌'}`);
  console.log(`   Gmail:    ${result2.services.gmail ? '✅' : '❌'}`);
  console.log(`   Drive:    ${result2.services.drive ? '✅' : '❌'}`);
  if (result2.error) {
    console.log(`   Error: ${result2.error}`);
  }

  console.log('\n' + '═'.repeat(60));
  
  const allPassed = result1.success && result2.success;
  if (allPassed) {
    console.log('\n🎉 ALL TESTS PASSED!\n');
  } else {
    console.log('\n⚠️ Some tests failed. Check the errors above.\n');
  }
}

main().catch(console.error);
