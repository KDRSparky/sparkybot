/**
 * Cloudflare Worker for Scheduled Market Reports
 * 
 * Cron Schedule:
 * - 8:00 AM CT: Morning Report
 * - 12:00 PM CT: Midday Report
 * - 3:15 PM CT: Afternoon Report
 * - 5:00 AM CT: Overnight Analysis
 * 
 * This worker triggers the bot to send reports via Telegram
 */

export interface Env {
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_CHAT_ID: string;
  BOT_WEBHOOK_URL: string;
}

// Report types and their schedules (CT timezone = UTC-6)
const SCHEDULES = {
  '0 14 * * 1-5': 'morning',    // 8 AM CT = 14:00 UTC (weekdays)
  '0 18 * * 1-5': 'midday',     // 12 PM CT = 18:00 UTC (weekdays)
  '15 21 * * 1-5': 'afternoon', // 3:15 PM CT = 21:15 UTC (weekdays)
  '0 11 * * 1-5': 'overnight',  // 5 AM CT = 11:00 UTC (weekdays)
};

export default {
  // HTTP handler for manual triggers
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    
    if (url.pathname === '/trigger') {
      const reportType = url.searchParams.get('type') || 'morning';
      await triggerReport(env, reportType);
      return new Response(`Triggered ${reportType} report`, { status: 200 });
    }

    if (url.pathname === '/health') {
      return new Response('OK', { status: 200 });
    }

    return new Response('SparkyBot Scheduler', { status: 200 });
  },

  // Scheduled handler for cron triggers
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    // Determine which report to send based on cron
    const cronStr = event.cron;
    let reportType = 'morning';

    for (const [cron, type] of Object.entries(SCHEDULES)) {
      if (cron === cronStr) {
        reportType = type;
        break;
      }
    }

    ctx.waitUntil(triggerReport(env, reportType));
  },
};

async function triggerReport(env: Env, reportType: string): Promise<void> {
  // Option 1: Call webhook on the bot
  if (env.BOT_WEBHOOK_URL) {
    await fetch(env.BOT_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        action: 'market_report',
        type: reportType,
      }),
    });
    return;
  }

  // Option 2: Send directly via Telegram API
  // This is a backup if the bot webhook isn't available
  const message = `🔔 Scheduled ${reportType} market report triggered. Check with the bot for details.`;
  
  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: env.TELEGRAM_CHAT_ID,
      text: message,
      parse_mode: 'Markdown',
    }),
  });
}
