/**
 * Cloudflare Worker for Scheduled Market Reports
 * 
 * Cron Schedule (using America/Chicago timezone logic):
 * - 8:00 AM CT: Morning Report
 * - 12:00 PM CT: Midday Report
 * - 3:15 PM CT: Afternoon Report
 * - 5:00 AM CT: Overnight Analysis
 * 
 * This worker triggers the bot to send reports via Telegram
 * 
 * Note: Cron times are in UTC. We use two sets of crons to handle DST:
 * - CST (Nov-Mar): UTC-6
 * - CDT (Mar-Nov): UTC-5
 */

export interface Env {
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_CHAT_ID: string;
  BOT_WEBHOOK_URL: string;
}

// Target times in Central Time
const TARGET_TIMES = {
  morning: { hour: 8, minute: 0 },
  midday: { hour: 12, minute: 0 },
  afternoon: { hour: 15, minute: 15 },
  overnight: { hour: 5, minute: 0 },
};

/**
 * Check if a given date is in US Daylight Saving Time
 * DST starts: Second Sunday of March at 2am
 * DST ends: First Sunday of November at 2am
 */
function isDST(date: Date): boolean {
  const year = date.getUTCFullYear();
  
  // Find second Sunday of March
  const marchFirst = new Date(Date.UTC(year, 2, 1)); // March 1
  const marchFirstDay = marchFirst.getUTCDay();
  const secondSundayMarch = new Date(Date.UTC(year, 2, 8 + (7 - marchFirstDay) % 7));
  secondSundayMarch.setUTCHours(8); // 2am CT = 8am UTC (during CST)
  
  // Find first Sunday of November
  const novFirst = new Date(Date.UTC(year, 10, 1)); // November 1
  const novFirstDay = novFirst.getUTCDay();
  const firstSundayNov = new Date(Date.UTC(year, 10, 1 + (7 - novFirstDay) % 7));
  firstSundayNov.setUTCHours(7); // 2am CT = 7am UTC (during CDT)
  
  return date >= secondSundayMarch && date < firstSundayNov;
}

/**
 * Get the UTC offset for Central Time (handles DST)
 */
function getCentralOffset(): number {
  return isDST(new Date()) ? -5 : -6;
}

/**
 * Determine report type based on current Central Time
 */
function getReportTypeForCurrentTime(): string | null {
  const now = new Date();
  const offset = getCentralOffset();
  
  // Convert to Central Time
  const centralHour = (now.getUTCHours() + offset + 24) % 24;
  const centralMinute = now.getUTCMinutes();
  
  // Check each target time (within 5 minute window)
  for (const [type, target] of Object.entries(TARGET_TIMES)) {
    if (centralHour === target.hour && Math.abs(centralMinute - target.minute) <= 5) {
      return type;
    }
  }
  
  return null;
}

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
      const offset = getCentralOffset();
      const now = new Date();
      const centralTime = new Date(now.getTime() + offset * 60 * 60 * 1000);
      return new Response(JSON.stringify({
        status: 'OK',
        utcTime: now.toISOString(),
        centralTime: centralTime.toISOString(),
        isDST: isDST(now),
        offset: offset,
      }), { 
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (url.pathname === '/debug') {
      const reportType = getReportTypeForCurrentTime();
      return new Response(JSON.stringify({
        currentReportType: reportType,
        isDST: isDST(new Date()),
        offset: getCentralOffset(),
        targetTimes: TARGET_TIMES,
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response('SparkyBot Scheduler - DST Aware', { status: 200 });
  },

  // Scheduled handler for cron triggers
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    // Determine report type based on current Central Time
    const reportType = getReportTypeForCurrentTime();
    
    if (reportType) {
      ctx.waitUntil(triggerReport(env, reportType));
    } else {
      // Log that we couldn't match a report type (shouldn't happen if crons are correct)
      console.log(`Cron fired but no matching report type. Cron: ${event.cron}`);
    }
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
