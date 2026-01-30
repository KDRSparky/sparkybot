/**
 * Router Test Script
 * 
 * Run with: npx tsx tests/test-router.ts
 * 
 * Tests the intent classification and routing system
 */

import { 
  classifyIntentKeyword, 
  initializeSkillRegistry,
  getSkillRegistry,
  getSkill
} from '../src/core/router.js';
import * as dotenv from 'dotenv';

dotenv.config();

console.log('🧪 Router & Intent Classification Tests\n');
console.log('═'.repeat(60));

// Initialize registry
await initializeSkillRegistry();

const skills = getSkillRegistry();
console.log(`\n📚 Loaded ${skills.length} skills:`);
skills.forEach(s => console.log(`   - ${s.id}: ${s.name}`));

// Test messages
const testMessages = [
  // Market queries
  { message: "How's my portfolio doing?", expectedSkill: "market" },
  { message: "What's the price of NVDA?", expectedSkill: "market" },
  { message: "Give me a market report", expectedSkill: "market" },
  { message: "How's Bitcoin doing?", expectedSkill: "market" },
  
  // Calendar queries
  { message: "What's on my calendar today?", expectedSkill: "calendar" },
  { message: "Schedule a meeting for tomorrow", expectedSkill: "calendar" },
  { message: "When am I free next week?", expectedSkill: "calendar" },
  
  // Email queries
  { message: "Check my email", expectedSkill: "email" },
  { message: "Any important emails?", expectedSkill: "email" },
  { message: "Send an email to John", expectedSkill: "email" },
  
  // Reminder queries
  { message: "Remind me to call mom at 5pm", expectedSkill: "reminders" },
  { message: "Don't forget to submit the report", expectedSkill: "reminders" },
  
  // Task/Kanban queries
  { message: "Add a task to review code", expectedSkill: "kanban" },
  { message: "What's in my backlog?", expectedSkill: "kanban" },
  { message: "Move task to done", expectedSkill: "kanban" },
  
  // Social media
  { message: "Check my Twitter DMs", expectedSkill: "social" },
  { message: "Post a tweet about the market", expectedSkill: "social" },
  
  // Code execution
  { message: "Fix the bug in the login function", expectedSkill: "code-exec" },
  { message: "Deploy the latest changes", expectedSkill: "code-exec" },
  
  // General (should fall back)
  { message: "Hello, how are you?", expectedSkill: "general" },
  { message: "What's the meaning of life?", expectedSkill: "general" },
  { message: "Tell me a joke", expectedSkill: "general" },
];

console.log('\n\n📋 Testing Intent Classification:\n');
console.log('─'.repeat(60));

let passed = 0;
let failed = 0;

for (const test of testMessages) {
  const results = classifyIntentKeyword(test.message);
  const topResult = results[0];
  
  const isCorrect = topResult.skillId === test.expectedSkill;
  const status = isCorrect ? '✅' : '❌';
  
  if (isCorrect) {
    passed++;
  } else {
    failed++;
  }
  
  console.log(`${status} "${test.message}"`);
  console.log(`   Expected: ${test.expectedSkill} | Got: ${topResult.skillId} (${(topResult.confidence * 100).toFixed(0)}%)`);
  
  if (!isCorrect && results.length > 1) {
    console.log(`   Other matches: ${results.slice(1, 3).map(r => r.skillId).join(', ')}`);
  }
  console.log();
}

console.log('═'.repeat(60));
console.log(`\n📊 Results: ${passed} passed, ${failed} failed (${((passed / testMessages.length) * 100).toFixed(0)}% accuracy)\n`);

if (failed > 0) {
  console.log('💡 Some tests failed - this is expected with keyword matching.');
  console.log('   AI-based classification (using Gemini) will improve accuracy.\n');
}

// Test skill lookup
console.log('\n📋 Testing Skill Lookup:\n');
const testSkillIds = ['market', 'calendar', 'email', 'general', 'nonexistent'];

for (const skillId of testSkillIds) {
  const skill = getSkill(skillId);
  if (skill) {
    console.log(`✅ ${skillId}: ${skill.name} (autonomy: ${skill.autonomyLevel})`);
  } else {
    console.log(`❌ ${skillId}: Not found`);
  }
}

console.log('\n✅ Router tests complete!\n');
