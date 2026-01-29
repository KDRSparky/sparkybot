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
import { 
  generateMarketReport, 
  getQuickQuote, 
  getPortfolioOverview,
  getPortfolioPosition,
  loadPortfolio 
} from './skills/market/index.js';

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
// HTTP Health Server & Webhook Handler
// ============================================
const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  console.log(`📡 HTTP ${req.method} ${req.url}`);
  
  if (req.url === '/' || req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      status: 'ok', 
      service: 'SparkyBot',
      uptime: process.uptime()
    }));
    return;
  }

  // Webhook endpoint for scheduled tasks
  if (req.url === '/webhook' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        
        if (data.action === 'market_report') {
          const report = await generateMarketReport(data.type || 'morning');
          await sendTelegramMessage(report);
          res.writeHead(200);
          res.end('Report sent');
        } else {
          res.writeHead(400);
          res.end('Unknown action');
        }
      } catch (error) {
        console.error('Webhook error:', error);
        res.writeHead(500);
        res.end('Error');
      }
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
});

// Helper to send Telegram messages
async function sendTelegramMessage(text: string) {
  const url = `https://api.telegram.org/bot${config.telegram.token}/sendMessage`;
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: config.telegram.ownerUserId,
      text,
      parse_mode: 'Markdown',
    }),
  });
}

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

// Build system prompt with portfolio context
function buildEnhancedSystemPrompt(): string {
  const basePrompt = buildSystemPrompt();
  
  // Add portfolio context
  let portfolioContext = '';
  try {
    const positions = loadPortfolio();
    const symbols = positions.map(p => p.symbol).join(', ');
    const totalValue = positions.reduce((sum, p) => sum + (p.currentValue || 0), 0);
    
    portfolioContext = `\n\n## User's Portfolio Context
The user has a stock portfolio worth approximately $${totalValue.toLocaleString()}.
Key holdings include: ${symbols.slice(0, 200)}...

When discussing markets or stocks, you can reference their portfolio.
For specific portfolio queries, use the /portfolio or /quote commands.`;
  } catch (e) {
    // Portfolio not loaded, skip context
  }

  return basePrompt + portfolioContext;
}

const model = genAI.getGenerativeModel({ 
  model: 'gemini-2.0-flash',
  systemInstruction: buildEnhancedSystemPrompt(),
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
    `**Commands:**\n` +
    `/portfolio - View portfolio summary\n` +
    `/quote SYMBOL - Get stock quote\n` +
    `/market - Morning market report\n` +
    `/status - Bot status\n` +
    `/clear - Clear conversation\n\n` +
    `Or just talk to me naturally—I'll figure out what you need.\n\n` +
    `${getRandomDadJoke()}`
  , { parse_mode: 'Markdown' });
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
    `📈 Market Intel: Active\n` +
    `🔒 Secured to your account\n\n` +
    `_Scheduled reports: 8am, 12pm, 3:15pm CT_`,
    { parse_mode: 'Markdown' }
  );
});

// Command: /clear - Clear conversation history
bot.command('clear', async (ctx) => {
  chatSessions.delete(ctx.chat.id);
  await ctx.reply(`🧹 Conversation cleared! Fresh start. What's on your mind?`);
});

// Command: /portfolio - Get portfolio overview
bot.command('portfolio', async (ctx) => {
  await ctx.replyWithChatAction('typing');
  
  try {
    const overview = await getPortfolioOverview();
    await ctx.reply(overview, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error('Portfolio error:', error);
    await ctx.reply('Had trouble loading the portfolio. Let me check on that.');
  }
});

// Command: /quote SYMBOL - Get stock quote
bot.command('quote', async (ctx) => {
  if (!ctx.message) return;
  const symbol = ctx.message.text.split(' ')[1];
  
  if (!symbol) {
    await ctx.reply('Usage: /quote AAPL\n\nGive me a ticker symbol and I\'ll fetch the quote.');
    return;
  }
  
  await ctx.replyWithChatAction('typing');
  
  try {
    const quote = await getQuickQuote(symbol);
    await ctx.reply(quote, { parse_mode: 'Markdown' });
    
    // Check if user owns this stock
    const position = getPortfolioPosition(symbol);
    if (position) {
      const gain = position.currentValue - (position.quantity * position.costBasis);
      const gainPct = (gain / (position.quantity * position.costBasis)) * 100;
      await ctx.reply(
        `📌 You own ${position.quantity.toFixed(2)} shares\n` +
        `Cost basis: $${position.costBasis.toFixed(2)}\n` +
        `Position value: $${position.currentValue.toLocaleString()}\n` +
        `Total gain: ${gain >= 0 ? '+' : ''}$${gain.toFixed(2)} (${gainPct.toFixed(1)}%)`
      );
    }
  } catch (error) {
    console.error('Quote error:', error);
    await ctx.reply(`Couldn't fetch quote for ${symbol}. Make sure it's a valid ticker.`);
  }
});

// Command: /market - Get market report
bot.command('market', async (ctx) => {
  await ctx.reply('📊 Generating market report... This takes a moment.');
  await ctx.replyWithChatAction('typing');
  
  try {
    const report = await generateMarketReport('morning');
    
    // Split if too long
    if (report.length > 4000) {
      const chunks = report.match(/.{1,4000}/gs) || [report];
      for (const chunk of chunks) {
        await ctx.reply(chunk, { parse_mode: 'Markdown' });
      }
    } else {
      await ctx.reply(report, { parse_mode: 'Markdown' });
    }
  } catch (error) {
    console.error('Market report error:', error);
    await ctx.reply('Had some trouble generating the market report. Markets might be closed or data unavailable.');
  }
});

// Main message handler - Natural language processing
bot.on('message:text', async (ctx) => {
  if (!ctx.message) return;
  const message = ctx.message.text.toLowerCase();
  const chatId = ctx.chat.id;
  
  // Quick intent detection for market queries
  if (message.includes('portfolio') || message.includes('holdings') || message.includes('positions')) {
    await ctx.replyWithChatAction('typing');
    const overview = await getPortfolioOverview();
    await ctx.reply(overview, { parse_mode: 'Markdown' });
    return;
  }
  
  if (message.includes('market') && (message.includes('report') || message.includes('how') || message.includes('doing'))) {
    await ctx.reply('Let me check the markets for you...');
    await ctx.replyWithChatAction('typing');
    const report = await generateMarketReport('morning');
    await ctx.reply(report, { parse_mode: 'Markdown' });
    return;
  }
  
  // Check for stock quote requests
  const quoteMatch = message.match(/(?:price|quote|how(?:'s| is)?)\s+(\w{1,5})(?:\s+doing)?/i);
  if (quoteMatch) {
    await ctx.replyWithChatAction('typing');
    const quote = await getQuickQuote(quoteMatch[1]);
    await ctx.reply(quote, { parse_mode: 'Markdown' });
    return;
  }
  
  // Fall through to AI chat
  await ctx.replyWithChatAction('typing');
  
  try {
    const chat = getChatSession(chatId);
    const result = await chat.sendMessage(ctx.message.text);
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
console.log(`📈 Market Intel: Loaded`);

bot.start({
  onStart: (botInfo) => {
    console.log(`✅ Bot running as @${botInfo.username}`);
    console.log(`💬 Ready to assist!`);
  },
}).catch(console.error);
