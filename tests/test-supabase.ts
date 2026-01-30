/**
 * Supabase Connection Test Script
 * 
 * Run with: npx tsx tests/test-supabase.ts
 * 
 * Tests:
 * 1. Connection to Supabase
 * 2. Insert test row into conversations
 * 3. Query test row back
 * 4. Delete test row
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('🧪 Supabase Connection Test\n');
console.log('═'.repeat(50));

// Check environment variables
console.log('\n📋 Step 1: Checking environment variables...');

if (!supabaseUrl) {
  console.error('❌ SUPABASE_URL is not set!');
  console.log('\n💡 To fix this:');
  console.log('   1. Go to https://supabase.com/dashboard/project/efcgtoyhamxxtpkpaqij/settings/api');
  console.log('   2. Copy the "Project URL" value');
  console.log('   3. Add to .env: SUPABASE_URL=<your-url>');
  process.exit(1);
}

if (!supabaseKey) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY is not set!');
  console.log('\n💡 To fix this:');
  console.log('   1. Go to https://supabase.com/dashboard/project/efcgtoyhamxxtpkpaqij/settings/api');
  console.log('   2. Under "Project API keys", copy the "service_role" key (click "Reveal")');
  console.log('   3. Add to .env: SUPABASE_SERVICE_ROLE_KEY=<your-key>');
  process.exit(1);
}

console.log('✅ SUPABASE_URL is set');
console.log('✅ SUPABASE_SERVICE_ROLE_KEY is set');
console.log(`   URL: ${supabaseUrl.substring(0, 30)}...`);

// Create client
const supabase = createClient(supabaseUrl, supabaseKey);

async function runTests() {
  // Test 2: Connection test - query skills table
  console.log('\n📋 Step 2: Testing connection...');
  
  try {
    const { data: skills, error: skillsError } = await supabase
      .from('skills')
      .select('id, name')
      .limit(3);
    
    if (skillsError) {
      console.error('❌ Connection failed:', skillsError.message);
      process.exit(1);
    }
    
    console.log('✅ Successfully connected to Supabase!');
    console.log(`   Found ${skills?.length || 0} skills in database:`);
    skills?.forEach(s => console.log(`   - ${s.id}: ${s.name}`));
  } catch (err: any) {
    console.error('❌ Connection error:', err.message);
    process.exit(1);
  }

  // Test 3: Insert test row
  console.log('\n📋 Step 3: Inserting test row into conversations...');
  
  const testChatId = 9999999999; // Test chat ID
  const testMessage = `[TEST] Connection test at ${new Date().toISOString()}`;
  
  try {
    const { error: insertError } = await supabase
      .from('conversations')
      .insert({
        telegram_chat_id: testChatId,
        message_text: testMessage,
        message_type: 'user',
        skill_used: 'test',
      });
    
    if (insertError) {
      console.error('❌ Insert failed:', insertError.message);
      process.exit(1);
    }
    
    console.log('✅ Test row inserted successfully');
  } catch (err: any) {
    console.error('❌ Insert error:', err.message);
    process.exit(1);
  }

  // Test 4: Query test row back
  console.log('\n📋 Step 4: Querying test row...');
  
  try {
    const { data: rows, error: queryError } = await supabase
      .from('conversations')
      .select('*')
      .eq('telegram_chat_id', testChatId)
      .order('created_at', { ascending: false })
      .limit(1);
    
    if (queryError) {
      console.error('❌ Query failed:', queryError.message);
      process.exit(1);
    }
    
    if (!rows || rows.length === 0) {
      console.error('❌ Test row not found after insert!');
      process.exit(1);
    }
    
    console.log('✅ Test row retrieved successfully');
    console.log(`   ID: ${rows[0].id}`);
    console.log(`   Message: ${rows[0].message_text}`);
    console.log(`   Created: ${rows[0].created_at}`);
  } catch (err: any) {
    console.error('❌ Query error:', err.message);
    process.exit(1);
  }

  // Test 5: Delete test row
  console.log('\n📋 Step 5: Cleaning up test row...');
  
  try {
    const { error: deleteError } = await supabase
      .from('conversations')
      .delete()
      .eq('telegram_chat_id', testChatId);
    
    if (deleteError) {
      console.error('❌ Delete failed:', deleteError.message);
      process.exit(1);
    }
    
    console.log('✅ Test row deleted successfully');
  } catch (err: any) {
    console.error('❌ Delete error:', err.message);
    process.exit(1);
  }

  // Success!
  console.log('\n' + '═'.repeat(50));
  console.log('🎉 ALL TESTS PASSED!');
  console.log('═'.repeat(50));
  console.log('\n✅ Supabase connection is working correctly.');
  console.log('✅ Tasks 2.1.1 - 2.1.5 are COMPLETE.\n');
}

runTests().catch(console.error);
