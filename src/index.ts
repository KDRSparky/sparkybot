/**
 * SparkyBot - Personal Executive Assistant
 * 
 * Persona: Sparky Dempsey
 * 
 * Smart, witty, factual, dad jokes, emotionally aware
 * 
 * Brain: Gemini 2.0 Flash (chat) + Claude Code CLI (complex tasks)
 */

import { Bot } from 'grammy';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createServer, IncomingMessage, ServerResponse } from 'http';
import { buildSystemPrompt, getRandomDadJoke } from './core/personality.js';

// Configuration
const config = {
  telegram: {
    token: process.env.TELEGRAM_BOT_TOKEN || '',
    ownerUserId: parseInt(process.env.TELEGRAM_OWNER_USER_ID || '0', 10),
  },
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || '',
  },
  port: parseInt(process.env.PORT || '3000', 10),
};

// Validate config
function validateConfig() {
  const missing: string[] = [];
  if (!config.telegram.token) missing.push('TELEGRAM_BOT_TOKEN');
  if (!config.telegram.ownerUserId) missing.push('TELEGRAM_OWNER_USER_ID');
  if (!config.gemini.apiKey) missing.push('GEMINI_API_KEY');
  
  if (missing.length > 0) {
    console.error(`❌ Missing environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }
}

// ============================================
// HTTP Health Server (starts FIRST for Railway)
// ============================================
const server = createServer((req: IncomingMessage, res: ServerResponse) => {
  console.log(`📡 HTTP ${req.method} ${req.url}`);
  
  if (req.url === '/' || req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      status: 'ok', 
      service: 'SparkyBot',
      uptime: process.uptime()
    }));
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }
});

// Start health server immediately
server.listen(config.port, '0.0.0.0', () => {
  console.log(`🏥 Health server listening on 0.0.0.0:${config.port}`);
});

// ============================================
// Telegram Bot Setup
// ============================================
validateConfig();

const bot = new Bot(config.telegram.token);
const genAI = new GoogleGenerativeAI(config.gemini.apiKey);
const model = genAI.getGenerativeModel({ 
  model: 'gemini-2.0-flash',
  systemInstruction: buildSystemPrompt(),
});

// Conversation history (in-memory for now, will move to Supabase)
const chatSessions: Map<number, ReturnType<typeof model.startChat>> = new Map();

// Get or create chat session
function getChatSession(chatId: number) {
  if (!chatSessions.has(chatId)) {
    chatSessions.set(chatId, model.startChat({
      history: [],
    }));
  }
  return chatSessions.get(chatId)!;
}

// Security: Only respond to owner
bot.use(async (ctx, next) => {
  if (ctx.from?.id !== config.telegram.ownerUserId) {
    console.log(`🚫 Unauthorized access attempt from user ${ctx.from?.id} (@${ctx.from?.username})`);
    return; // Silently ignore
  }
  await next();
});

// Command: /start
bot.command('start', async (ctx) => {
  await ctx.reply(
    `Hey there! I'm Sparky Dempsey, your personal executive assistant. 🤖\n\n` +
    `I'm here to help you manage your calendar, emails, projects, and keep you informed about the markets.\n\n` +
    `Just talk to me naturally—no special commands needed. I'll figure out what you need.\n\n` +
    `${getRandomDadJoke()}`
  );
});

// Command: /status
bot.command('status', async (ctx) => {
  const uptime = process.uptime();
  const hours = Math.floor(uptime / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  
  await ctx.reply(
    `📊 *SparkyBot Status*\n\n` +
    `✅ Online and ready\n` +
    `⏱ Uptime: ${hours}h ${minutes}m\n` +
    `🧠 Brain: Gemini 2.0 Flash\n` +
    `🔒 Secured to your account\n\n` +
    `_Skills coming soon: Calendar, Email, Market Intel, and more!_`,
    { parse_mode: 'Markdown' }
  );
});

// Command: /clear - Clear conversation history
bot.command('clear', async (ctx) => {
  chatSessions.delete(ctx.chat.id);
  await ctx.reply(`🧹 Conversation cleared! Fresh start. What's on your mind?`);
});

// Main message handler
bot.on('message:text', async (ctx) => {
  const message = ctx.message.text;
  const chatId = ctx.chat.id;
  
  // Show typing indicator
  await ctx.replyWithChatAction('typing');
  
  try {
    // Get chat session and send message
    const chat = getChatSession(chatId);
    const result = await chat.sendMessage(message);
    const response = result.response.text();
    
    // Send response (split if too long for Telegram)
    if (response.length > 4000) {
      const chunks = response.match(/.{1,4000}/gs) || [response];
      for (const chunk of chunks) {
        await ctx.reply(chunk);
      }
    } else {
      await ctx.reply(response);
    }
    
  } catch (error) {
    console.error('Gemini API error:', error);
    await ctx.reply(
      `Oops, I hit a snag processing that. Let me try again in a moment.\n\n` +
      `_Error logged for review._`,
      { parse_mode: 'Markdown' }
    );
  }
});

// Error handling
bot.catch((err) => {
  console.error('Bot error:', err);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down gracefully...');
  bot.stop();
  server.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n👋 Shutting down gracefully...');
  bot.stop();
  server.close();
  process.exit(0);
});

// Start Telegram bot (after health server is already running)
console.log('🤖 SparkyBot starting up...');
console.log(`📱 Telegram: Restricted to user ID ${config.telegram.ownerUserId}`);
console.log(`🧠 AI: Gemini 2.0 Flash connected`);

bot.start({
  onStart: (botInfo) => {
    console.log(`✅ Bot running as @${botInfo.username}`);
    console.log(`💬 Ready to assist!`);
  },
}).catch(console.error);
