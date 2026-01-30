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
  storeConversationMessage, 
  clearConversation, 
  checkDatabaseConnection,
  buildMemoryContext,
  storeMarketReport,
  getGeminiHistory 
} from './core/memory.js';
import { isSupabaseConfigured } from './core/supabase.js';
import { 
  generateMarketReport, 
  getQuickQuote, 
  getPortfolioOverview,
  getPortfolioPosition,
  loadPortfolio,
  generateOvernightAnalysis,
  takePortfolioSnapshot,
  formatPortfolioPerformance,
} from './skills/market/index.js';
import {
  getUnreadEmails,
  getRecentEmails,
  getEmailThread,
  formatEmailsSummary,
  formatEmailDetail,
  getVipEmails,
  checkVipStatus,
  addVipContact,
  removeVipContact,
  listVipContacts,
  VipContact,
} from './skills/email/index.js';
import {
  getUpcomingEvents,
  formatEventsSummary,
} from './skills/calendar/index.js';
import { 
  routeMessage, 
  initializeSkillRegistry, 
  getSkill,
  classifyIntentKeyword 
} from './core/router.js';
import { uploadAsGoogleDoc } from './services/google-drive.js';

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
    const dbConnected = await checkDatabaseConnection();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      status: 'ok', 
      service: 'SparkyBot',
      uptime: process.uptime(),
      database: dbConnected ? 'connected' : 'not configured',
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
          const reportType = data.type || 'morning';
          
          // Handle overnight analysis differently - save to Google Drive
          if (reportType === 'overnight') {
            try {
              console.log('🌙 Generating overnight analysis...');
              
              // Take portfolio snapshot first
              const snapshot = await takePortfolioSnapshot();
              if (snapshot.success) {
                console.log(`📸 Portfolio snapshot saved: ${snapshot.totalValue?.toLocaleString()}`);
              } else {
                console.warn('⚠️ Failed to save portfolio snapshot:', snapshot.error);
              }
              
              const analysis = await generateOvernightAnalysis();
              
              // Upload to Google Drive
              const dateStr = new Date().toISOString().split('T')[0];
              const fileName = `Market Analysis - ${dateStr}`;
              const uploadResult = await uploadAsGoogleDoc(fileName, analysis.content);
              
              if (uploadResult) {
                // Send summary to Telegram with Drive link
                const message = `${analysis.summary}\n\n📄 [Open full report](${uploadResult.webViewLink})`;
                await sendTelegramMessage(message);
                
                // Store in database with Drive file ID
                await storeMarketReport('overnight', { text: analysis.summary }, 'telegram', uploadResult.fileId);
                
                console.log(`✅ Overnight analysis saved to Drive: ${uploadResult.fileId}`);
              } else {
                // Fallback: send summary only
                await sendTelegramMessage(analysis.summary + '\n\n⚠️ _Could not save to Google Drive_');
                await storeMarketReport('overnight', { text: analysis.summary }, 'telegram');
              }
              
              res.writeHead(200);
              res.end('Overnight analysis sent');
            } catch (error: any) {
              console.error('Overnight analysis error:', error);
              await sendTelegramMessage(`⚠️ Overnight analysis failed: ${error.message}`);
              res.writeHead(500);
              res.end('Error generating overnight analysis');
            }
          } else {
            // Regular market reports (morning, midday, afternoon)
            const report = await generateMarketReport(reportType);
            await sendTelegramMessage(report);
            
            // Store in database
            await storeMarketReport(reportType, { text: report }, 'telegram');
            
            res.writeHead(200);
            res.end('Report sent');
          }
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

// Conversation history (in-memory for Gemini sessions)
const chatSessions: Map<number, ReturnType<typeof model.startChat>> = new Map();

// Get or create chat session with persistent history from Supabase
async function getChatSession(chatId: number) {
  if (!chatSessions.has(chatId)) {
    // Load conversation history from Supabase
    const history = await getGeminiHistory(chatId.toString(), 10);
    console.log(`📚 Loaded ${history.length} messages from history for chat ${chatId}`);
    
    chatSessions.set(chatId, model.startChat({
      history: history,
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
    `/help - All commands\n` +
    `/clear - Clear conversation\n\n` +
    `Or just talk to me naturally—I'll figure out what you need.\n\n` +
    `${getRandomDadJoke()}`
  , { parse_mode: 'Markdown' });
});

// Command: /help - Show available commands (no AI needed)
bot.command('help', async (ctx) => {
  await ctx.reply(
    `📚 *SparkyBot Commands*\n\n` +
    `*Market & Portfolio*\n` +
    `/portfolio - View your portfolio summary\n` +
    `/quote SYMBOL - Get stock quote (e.g. /quote NVDA)\n` +
    `/market - Full market report with indices\n\n` +
    `*General*\n` +
    `/status - Check bot status\n` +
    `/clear - Clear conversation history\n` +
    `/help - Show this help message\n\n` +
    `*Natural Language*\n` +
    `You can also just chat naturally:\n` +
    `• "How's my portfolio?"\n` +
    `• "What's the price of Tesla?"\n` +
    `• "Give me a market update"\n\n` +
    `_Tip: Commands like /portfolio and /quote work even when the AI is busy!_`,
    { parse_mode: 'Markdown' }
  );
});

// Command: /status
bot.command('status', async (ctx) => {
  const uptime = process.uptime();
  const hours = Math.floor(uptime / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  const dbConnected = await checkDatabaseConnection();
  
  await ctx.reply(
    `📊 *SparkyBot Status*\n\n` +
    `✅ Online and ready\n` +
    `⏱ Uptime: ${hours}h ${minutes}m\n` +
    `🧠 Brain: Gemini 2.0 Flash\n` +
    `📈 Market Intel: Active\n` +
    `💾 Database: ${dbConnected ? '✅ Connected' : '⚠️ Not configured'}\n` +
    `🔒 Secured to your account\n\n` +
    `_Scheduled reports: 8am, 12pm, 3:15pm CT_`,
    { parse_mode: 'Markdown' }
  );
});

// Command: /clear - Clear conversation history
bot.command('clear', async (ctx) => {
  chatSessions.delete(ctx.chat.id);
  await clearConversation(ctx.chat.id.toString());
  await ctx.reply(`🧹 Conversation cleared! Fresh start. What's on your mind?`);
});

// Command: /portfolio - Get portfolio overview
bot.command('portfolio', async (ctx) => {
  await ctx.replyWithChatAction('typing');
  
  try {
    const overview = await getPortfolioOverview();
    await ctx.reply(overview, { parse_mode: 'Markdown' });
    
    // Log the query
    await storeConversationMessage(ctx.chat.id.toString(), 'user', '/portfolio', 'market');
    await storeConversationMessage(ctx.chat.id.toString(), 'assistant', overview, 'market');
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
    
    // Log the query
    await storeConversationMessage(ctx.chat.id.toString(), 'user', `/quote ${symbol}`, 'market');
    await storeConversationMessage(ctx.chat.id.toString(), 'assistant', quote, 'market');
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
    
    // Log and store report
    await storeConversationMessage(ctx.chat.id.toString(), 'user', '/market', 'market');
    await storeMarketReport('morning', { text: report }, 'telegram');
  } catch (error) {
    console.error('Market report error:', error);
    await ctx.reply('Had some trouble generating the market report. Markets might be closed or data unavailable.');
  }
});

// Command: /performance - Get portfolio performance history
bot.command('performance', async (ctx) => {
  await ctx.replyWithChatAction('typing');
  
  try {
    // Check for optional days parameter: /performance 7 or /performance 90
    const args = ctx.message?.text.split(' ') || [];
    const days = args[1] ? parseInt(args[1], 10) : 30;
    
    if (isNaN(days) || days < 1 || days > 365) {
      await ctx.reply('Usage: /performance [days]\n\nExamples:\n/performance - Last 30 days\n/performance 7 - Last week\n/performance 90 - Last quarter');
      return;
    }
    
    const performance = await formatPortfolioPerformance(days);
    await ctx.reply(performance, { parse_mode: 'Markdown' });
    
    await storeConversationMessage(ctx.chat.id.toString(), 'user', `/performance ${days}`, 'market');
  } catch (error: any) {
    console.error('Performance error:', error);
    await ctx.reply(`Had trouble loading performance data: ${error.message}`);
  }
});

// Main message handler - Natural language processing
bot.on('message:text', async (ctx) => {
  if (!ctx.message) return;
  const message = ctx.message.text.toLowerCase();
  const originalMessage = ctx.message.text;
  const chatId = ctx.chat.id;
  
  // Quick intent detection for market queries
  if (message.includes('portfolio') || message.includes('holdings') || message.includes('positions')) {
    await ctx.replyWithChatAction('typing');
    const overview = await getPortfolioOverview();
    await ctx.reply(overview, { parse_mode: 'Markdown' });
    await storeConversationMessage(chatId.toString(), 'user', originalMessage, 'market');
    await storeConversationMessage(chatId.toString(), 'assistant', overview, 'market');
    return;
  }
  
  if (message.includes('market') && (message.includes('report') || message.includes('how') || message.includes('doing'))) {
    await ctx.reply('Let me check the markets for you...');
    await ctx.replyWithChatAction('typing');
    const report = await generateMarketReport('morning');
    await ctx.reply(report, { parse_mode: 'Markdown' });
    await storeConversationMessage(chatId.toString(), 'user', originalMessage, 'market');
    await storeConversationMessage(chatId.toString(), 'assistant', report, 'market');
    return;
  }
  
  // Check for stock quote requests
  const quoteMatch = message.match(/(?:price|quote|how(?:'s| is)?)\s+(\w{1,5})(?:\s+doing)?/i);
  if (quoteMatch) {
    await ctx.replyWithChatAction('typing');
    const quote = await getQuickQuote(quoteMatch[1]);
    await ctx.reply(quote, { parse_mode: 'Markdown' });
    await storeConversationMessage(chatId.toString(), 'user', originalMessage, 'market');
    await storeConversationMessage(chatId.toString(), 'assistant', quote, 'market');
    return;
  }
  
  // Portfolio performance queries
  if ((message.includes('portfolio') || message.includes('performance')) && 
      (message.includes('perform') || message.includes('month') || message.includes('week') || message.includes('history'))) {
    await ctx.replyWithChatAction('typing');
    
    // Try to extract time period
    let days = 30;
    if (message.includes('week')) days = 7;
    else if (message.includes('quarter')) days = 90;
    else if (message.includes('year')) days = 365;
    
    const performance = await formatPortfolioPerformance(days);
    await ctx.reply(performance, { parse_mode: 'Markdown' });
    await storeConversationMessage(chatId.toString(), 'user', originalMessage, 'market');
    return;
  }
  
  // VIP Management - Add, Remove, List
  if (message.includes('vip')) {
    await ctx.replyWithChatAction('typing');
    
    try {
      // Add VIP: "add [name] as vip" or "add [name], [email] as vip"
      const addVipMatch = originalMessage.match(/add\s+(.+?)(?:,\s*([\w.+-]+@[\w.-]+))?\s+as\s+vip/i);
      if (addVipMatch) {
        const name = addVipMatch[1].trim();
        const email = addVipMatch[2]?.trim();
        
        if (!email) {
          await ctx.reply(`To add a VIP, I need their email address.\n\nTry: "add ${name}, email@example.com as VIP"`);
          return;
        }
        
        await addVipContact({ name, email });
        await ctx.reply(`⭐ Added **${name}** (${email}) to your VIP list!\n\nTheir emails will now be highlighted and prioritized.`, { parse_mode: 'Markdown' });
        await storeConversationMessage(chatId.toString(), 'user', originalMessage, 'email');
        return;
      }
      
      // Remove VIP: "remove [email] from vip" or "remove vip [email]"
      const removeVipMatch = originalMessage.match(/remove\s+(?:vip\s+)?([\w.+-]+@[\w.-]+)(?:\s+from\s+vip)?/i);
      if (removeVipMatch) {
        const email = removeVipMatch[1].trim();
        const removed = await removeVipContact(email);
        
        if (removed) {
          await ctx.reply(`✅ Removed ${email} from your VIP list.`);
        } else {
          await ctx.reply(`Couldn't find ${email} in your VIP list.`);
        }
        await storeConversationMessage(chatId.toString(), 'user', originalMessage, 'email');
        return;
      }
      
      // List VIPs: "list vips" or "show vips" or "my vips"
      if (message.includes('list') || message.includes('show') || message.includes('my vip')) {
        const vips = await listVipContacts();
        
        if (vips.length === 0) {
          await ctx.reply(`📋 No VIP contacts yet.\n\nAdd one with: "add John Smith, john@example.com as VIP"`);
        } else {
          const vipList = vips.map(v => `• **${v.name}** - ${v.email || 'no email'}`).join('\n');
          await ctx.reply(`⭐ *Your VIP Contacts (${vips.length})*\n\n${vipList}`, { parse_mode: 'Markdown' });
        }
        await storeConversationMessage(chatId.toString(), 'user', originalMessage, 'email');
        return;
      }
      
      // Check VIP emails
      if (message.includes('email') || message.includes('mail') || message.includes('inbox')) {
        const vipEmails = await getVipEmails(10);
        if (vipEmails.length === 0) {
          await ctx.reply('📭 No unread emails from VIPs right now. Your important contacts are quiet!');
        } else {
          const summary = formatEmailsSummary(vipEmails);
          await ctx.reply(`⭐ *VIP Emails (${vipEmails.length})*\n\n${summary}`, { parse_mode: 'Markdown' });
        }
        await storeConversationMessage(chatId.toString(), 'user', originalMessage, 'email');
        return;
      }
      
      // Generic VIP query - show help
      await ctx.reply(
        `⭐ *VIP Contact Management*\n\n` +
        `**Add a VIP:**\n` +
        `"add John Smith, john@example.com as VIP"\n\n` +
        `**Remove a VIP:**\n` +
        `"remove john@example.com from VIP"\n\n` +
        `**List VIPs:**\n` +
        `"show my VIPs"\n\n` +
        `**Check VIP emails:**\n` +
        `"check VIP emails"`,
        { parse_mode: 'Markdown' }
      );
      return;
      
    } catch (error: any) {
      console.error('VIP management error:', error);
      await ctx.reply(`Had trouble with VIP management: ${error.message}`);
    }
    return;
  }
  
  // Email queries
  if (message.includes('email') || message.includes('inbox') || message.includes('mail')) {
    await ctx.replyWithChatAction('typing');
    
    try {
      // Get unread emails
      const emails = await getUnreadEmails(15);
      if (emails.length === 0) {
        await ctx.reply('📭 Inbox zero! No unread emails right now.');
      } else {
        const vipCount = emails.filter(e => e.isVip).length;
        const summary = formatEmailsSummary(emails);
        let header = `📬 *Unread Emails (${emails.length})*`;
        if (vipCount > 0) {
          header += `\n⭐ _${vipCount} from VIPs_`;
        }
        await ctx.reply(`${header}\n\n${summary}`, { parse_mode: 'Markdown' });
      }
      
      await storeConversationMessage(chatId.toString(), 'user', originalMessage, 'email');
    } catch (error: any) {
      console.error('Email error:', error);
      await ctx.reply(`📧 Had trouble checking your email: ${error.message}\n\nMake sure Google is connected.`);
    }
    return;
  }
  
  // Calendar queries
  if (message.includes('calendar') || message.includes('schedule') || message.includes('meeting') || message.includes('events')) {
    await ctx.replyWithChatAction('typing');
    
    try {
      const events = await getUpcomingEvents(7); // Next 7 days
      if (events.length === 0) {
        await ctx.reply('📅 Your calendar is clear for the next week!');
      } else {
        const summary = formatEventsSummary(events);
        await ctx.reply(`📅 *Upcoming Events*\n\n${summary}`, { parse_mode: 'Markdown' });
      }
      
      await storeConversationMessage(chatId.toString(), 'user', originalMessage, 'calendar');
    } catch (error: any) {
      console.error('Calendar error:', error);
      await ctx.reply(`📅 Had trouble checking your calendar: ${error.message}\n\nMake sure Google is connected.`);
    }
    return;
  }
  
  // Check for help/commands queries (avoid hitting AI)
  if (message.includes('command') || message.includes('help') || message.includes('what can you do')) {
    await ctx.reply(
      `📚 *SparkyBot Commands*\n\n` +
      `*Market & Portfolio*\n` +
      `/portfolio - View your portfolio summary\n` +
      `/quote SYMBOL - Get stock quote (e.g. /quote NVDA)\n` +
      `/market - Full market report with indices\n\n` +
      `*General*\n` +
      `/status - Check bot status\n` +
      `/clear - Clear conversation history\n` +
      `/help - Show this help message\n\n` +
      `Or just chat naturally - I understand questions about stocks, markets, and can help with general tasks!`,
      { parse_mode: 'Markdown' }
    );
    return;
  }
  
  // Fall through to AI chat
  await ctx.replyWithChatAction('typing');
  
  try {
    // Store user message
    await storeConversationMessage(chatId.toString(), 'user', originalMessage, 'general');
    
    const chat = await getChatSession(chatId);
    const result = await chat.sendMessage(originalMessage);
    const response = result.response.text();
    
    // Store assistant response
    await storeConversationMessage(chatId.toString(), 'assistant', response, 'general');
    
    // Send response (split if too long for Telegram)
    if (response.length > 4000) {
      const chunks = response.match(/.{1,4000}/gs) || [response];
      for (const chunk of chunks) {
        await ctx.reply(chunk);
      }
    } else {
      await ctx.reply(response);
    }
    
  } catch (error: any) {
    console.error('Gemini API error:', error);
    
    // Check for rate limit error (429)
    const isRateLimit = error?.status === 429 || 
                        error?.message?.includes('429') || 
                        error?.message?.includes('Resource exhausted') ||
                        error?.message?.includes('Too Many Requests');
    
    if (isRateLimit) {
      await ctx.reply(
        `⏳ I'm a bit overwhelmed right now (AI rate limit hit).\n\n` +
        `Please wait a minute and try again, or use these commands that work instantly:\n` +
        `• /portfolio - Your holdings\n` +
        `• /quote NVDA - Stock quotes\n` +
        `• /market - Market report\n` +
        `• /help - All commands`
      );
    } else {
      await ctx.reply(
        `Oops, I hit a snag processing that. Let me try again in a moment.\n\n` +
        `_Error logged for review._`,
        { parse_mode: 'Markdown' }
      );
    }
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

// ============================================
// Startup
// ============================================
async function startup() {
  console.log('🤖 SparkyBot starting up...');
  console.log(`📱 Telegram: Restricted to user ID ${config.telegram.ownerUserId}`);
  console.log(`🧠 AI: Gemini 2.0 Flash connected`);
  console.log(`📈 Market Intel: Loaded`);
  
  // Check database
  const dbConnected = await checkDatabaseConnection();
  if (dbConnected) {
    console.log(`💾 Database: Connected to Supabase`);
  } else if (isSupabaseConfigured) {
    console.log(`⚠️ Database: Supabase configured but connection failed`);
  } else {
    console.log(`⚠️ Database: Not configured, using in-memory storage`);
  }
  
  // Initialize skill registry
  await initializeSkillRegistry();
  console.log(`🎯 Skill Router: Initialized`);
  
  bot.start({
    onStart: (botInfo) => {
      console.log(`✅ Bot running as @${botInfo.username}`);
      console.log(`💬 Ready to assist!`);
    },
  }).catch(console.error);
}

startup();
