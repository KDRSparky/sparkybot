/**
 * Market Intelligence Skill - Enhanced Report Format v2.0
 *
 * Merged format combining:
 * - Existing SparkyBot data infrastructure
 * - Executive-level briefing style from example
 * - Smart reminders and anticipatory intelligence
 *
 * Features:
 * - Dynamic time-of-day headers
 * - Narrative market headlines
 * - Personalized portfolio section with share counts
 * - Top 10 global crypto + your holdings
 * - Tomorrow's Outlook with earnings/economic data
 * - AI-generated sentiment
 * - Smart reminders (earnings within 7 days, economic events, position alerts)
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { supabase, isSupabaseConfigured } from '../../core/supabase.js';

// ============================================================================
// TYPES
// ============================================================================

export interface Position {
  symbol: string;
  description: string;
  quantity: number;
  lastPrice: number;
  currentValue: number;
  costBasis: number;
  currentPrice?: number;
  dayChange?: number;
  dayChangePct?: number;
  totalGain?: number;
  totalGainPct?: number;
}

export interface MarketData {
  symbol: string;
  price: number;
  change: number;
  changePct: number;
  volume?: number;
  high?: number;
  low?: number;
  open?: number;
  previousClose?: number;
  afterHoursPrice?: number;
  afterHoursChange?: number;
  afterHoursChangePct?: number;
}

export interface CryptoData extends MarketData {
  marketCap?: number;
  rank?: number;
}

export interface PortfolioSummary {
  totalValue: number;
  totalCost: number;
  totalGain: number;
  totalGainPct: number;
  dayChange: number;
  dayChangePct: number;
  positions: Position[];
  topGainers: Position[];
  topLosers: Position[];
  sectorBreakdown: Record<string, number>;
  lastUpdated: Date;
}

export interface EarningsEvent {
  symbol: string;
  companyName: string;
  reportDate: string;
  reportTime: 'BMO' | 'AMC' | 'TNS'; // Before Market Open, After Market Close, Time Not Specified
  estimate?: number;
  inPortfolio: boolean;
  shares?: number;
}

export interface EconomicEvent {
  name: string;
  date: string;
  time: string; // CT timezone
  impact: 'high' | 'medium' | 'low';
  previous?: string;
  forecast?: string;
}

export interface Reminder {
  type: 'earnings' | 'economic' | 'dividend' | 'position_alert' | 'custom' | 'options';
  text: string;
  priority: 'high' | 'medium' | 'low';
  date?: string;
}

export type ReportType = 'morning' | 'midday' | 'afternoon' | 'evening' | 'overnight';

// ============================================================================
// CONSTANTS
// ============================================================================

const PORTFOLIO_PATH = join(process.cwd(), 'data', 'portfolio.csv');
const USER_TIMEZONE = 'America/Chicago';

// Top 10 cryptos by market cap (IDs for CoinGecko)
const TOP_CRYPTO_IDS = [
  'bitcoin', 'ethereum', 'ripple', 'binancecoin', 'solana',
  'dogecoin', 'cardano', 'avalanche-2', 'polkadot', 'chainlink'
];

// Your crypto holdings that might not be in top 10
const USER_CRYPTO_HOLDINGS = ['world-liberty-financial']; // WLFI

// Thresholds
const MOVER_THRESHOLD_PCT = 2.0; // Show positions that moved > 2%
const EARNINGS_LOOKAHEAD_DAYS = 7;
const LARGE_POSITION_MOVE_PCT = 5.0; // Alert for single position > 5% move

// ============================================================================
// FORMATTING HELPERS
// ============================================================================

const formatCurrency = (n: number): string =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

const formatPct = (n: number): string => {
  if (isNaN(n) || !isFinite(n)) return '0.00%';
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
};

const formatCompactCurrency = (n: number): string => {
  if (n >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  return formatCurrency(n);
};

// ============================================================================
// TIME-OF-DAY DETECTION
// ============================================================================

interface ReportContext {
  type: ReportType;
  emoji: string;
  label: string;
  contextLabel: string;
  dayOfWeek: string;
  dateStr: string;
  timeStr: string;
  isMarketOpen: boolean;
  isPreMarket: boolean;
  isAfterHours: boolean;
  isWeekend: boolean;
}

function getReportContext(overrideType?: ReportType): ReportContext {
  const now = new Date();
  const centralTime = new Date(now.toLocaleString('en-US', { timeZone: USER_TIMEZONE }));
  const hour = centralTime.getHours();
  const minute = centralTime.getMinutes();
  const day = centralTime.getDay();
  const timeInMinutes = hour * 60 + minute;

  const dayOfWeek = centralTime.toLocaleDateString('en-US', {
    timeZone: USER_TIMEZONE,
    weekday: 'long'
  });

  const dateStr = centralTime.toLocaleDateString('en-US', {
    timeZone: USER_TIMEZONE,
    month: 'short',
    day: 'numeric'
  });

  const timeStr = centralTime.toLocaleTimeString('en-US', {
    timeZone: USER_TIMEZONE,
    hour: 'numeric',
    minute: '2-digit',
  });

  const isWeekend = day === 0 || day === 6;
  const isPreMarket = timeInMinutes >= 4 * 60 && timeInMinutes < 8 * 60 + 30;
  const isMarketOpen = timeInMinutes >= 8 * 60 + 30 && timeInMinutes < 15 * 60;
  const isAfterHours = timeInMinutes >= 15 * 60 && timeInMinutes < 19 * 60;

  // Determine report type based on time if not overridden
  let type: ReportType;
  if (overrideType) {
    type = overrideType;
  } else if (hour >= 5 && hour < 12) {
    type = 'morning';
  } else if (hour >= 12 && hour < 15) {
    type = 'midday';
  } else if (hour >= 15 && hour < 19) {
    type = 'afternoon';
  } else {
    type = 'evening';
  }

  const config: Record<ReportType, { emoji: string; label: string; contextLabel: string }> = {
    morning: { emoji: '☀️', label: 'MORNING MARKET REPORT', contextLabel: 'Pre-Market Brief' },
    midday: { emoji: '🌤️', label: 'MIDDAY MARKET REPORT', contextLabel: 'Midday Check-In' },
    afternoon: { emoji: '🌅', label: 'AFTERNOON MARKET REPORT', contextLabel: 'Closing Recap' },
    evening: { emoji: '🌙', label: 'EVENING MARKET REPORT', contextLabel: 'After Hours Update' },
    overnight: { emoji: '🌙', label: 'OVERNIGHT ANALYSIS', contextLabel: 'Full Analysis' },
  };

  return {
    type,
    ...config[type],
    dayOfWeek,
    dateStr,
    timeStr,
    isMarketOpen,
    isPreMarket,
    isAfterHours,
    isWeekend,
  };
}

// ============================================================================
// DATA FETCHING
// ============================================================================

export function loadPortfolio(): Position[] {
  if (!existsSync(PORTFOLIO_PATH)) {
    console.warn('Portfolio file not found:', PORTFOLIO_PATH);
    return [];
  }

  const content = readFileSync(PORTFOLIO_PATH, 'utf-8');
  const lines = content.trim().split('\n');
  const positions: Position[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    if (cols.length >= 6) {
      const symbol = cols[0].trim();
      if (symbol === 'CASH' || symbol.includes('XX')) continue;

      positions.push({
        symbol,
        description: cols[1].trim(),
        quantity: parseFloat(cols[2]) || 0,
        lastPrice: parseFloat(cols[3]) || 0,
        currentValue: parseFloat(cols[4]) || 0,
        costBasis: parseFloat(cols[5]) || 0,
      });
    }
  }

  return positions;
}

export async function getStockQuote(symbol: string): Promise<MarketData | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!response.ok) return null;

    const data: any = await response.json();
    const result = data.chart?.result?.[0];
    if (!result) return null;

    const meta = result.meta;
    const price = meta.regularMarketPrice || meta.previousClose || 0;
    const previousClose = meta.previousClose || price;
    const change = price && previousClose ? price - previousClose : 0;
    const changePct = previousClose ? (change / previousClose) * 100 : 0;

    return {
      symbol: meta.symbol,
      price,
      change: isNaN(change) ? 0 : change,
      changePct: isNaN(changePct) ? 0 : changePct,
      volume: meta.regularMarketVolume,
      previousClose,
    };
  } catch (error) {
    console.error(`Error fetching quote for ${symbol}:`, error);
    return null;
  }
}

export async function getMarketIndices(): Promise<{
  sp500: MarketData | null;
  nasdaq: MarketData | null;
  dow: MarketData | null;
}> {
  const [sp500, nasdaq, dow] = await Promise.all([
    getStockQuote('^GSPC'),
    getStockQuote('^IXIC'),
    getStockQuote('^DJI'),
  ]);

  return { sp500, nasdaq, dow };
}

export async function getCryptoPrices(): Promise<CryptoData[]> {
  try {
    const allIds = [...TOP_CRYPTO_IDS, ...USER_CRYPTO_HOLDINGS].join(',');
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${allIds}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true`;

    const response = await fetch(url);
    if (!response.ok) return [];

    const data: any = await response.json();
    const results: CryptoData[] = [];

    // Map coinId to readable symbol
    const symbolMap: Record<string, string> = {
      'bitcoin': 'BTC',
      'ethereum': 'ETH',
      'ripple': 'XRP',
      'binancecoin': 'BNB',
      'solana': 'SOL',
      'dogecoin': 'DOGE',
      'cardano': 'ADA',
      'avalanche-2': 'AVAX',
      'polkadot': 'DOT',
      'chainlink': 'LINK',
      'world-liberty-financial': 'WLFI',
    };

    for (const [coinId, coinData] of Object.entries(data)) {
      const coin = coinData as any;
      results.push({
        symbol: symbolMap[coinId] || coinId.toUpperCase(),
        price: coin.usd || 0,
        change: ((coin.usd || 0) * (coin.usd_24h_change || 0)) / 100,
        changePct: coin.usd_24h_change || 0,
        marketCap: coin.usd_market_cap,
      });
    }

    // Sort by market cap
    results.sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0));

    return results;
  } catch (error) {
    console.error('Error fetching crypto prices:', error);
    return [];
  }
}

export async function updatePortfolioPrices(positions: Position[]): Promise<Position[]> {
  const symbols = [...new Set(positions.map(p => p.symbol))];
  const quotes = new Map<string, MarketData>();

  for (const symbol of symbols) {
    if (symbol.includes('/') || symbol.length > 5) continue;

    const quote = await getStockQuote(symbol);
    if (quote) {
      quotes.set(symbol, quote);
    }

    await new Promise(resolve => setTimeout(resolve, 100));
  }

  return positions.map(pos => {
    const quote = quotes.get(pos.symbol);
    if (quote) {
      const currentValue = pos.quantity * quote.price;
      const totalCost = pos.quantity * pos.costBasis;
      return {
        ...pos,
        currentPrice: quote.price,
        currentValue,
        dayChange: quote.change * pos.quantity,
        dayChangePct: quote.changePct,
        totalGain: currentValue - totalCost,
        totalGainPct: ((currentValue - totalCost) / totalCost) * 100,
      };
    }
    return pos;
  });
}

export function calculatePortfolioSummary(positions: Position[]): PortfolioSummary {
  let totalValue = 0;
  let totalCost = 0;
  let dayChange = 0;

  for (const pos of positions) {
    totalValue += pos.currentValue || 0;
    totalCost += pos.quantity * pos.costBasis;
    dayChange += pos.dayChange || 0;
  }

  const totalGain = totalValue - totalCost;
  const totalGainPct = totalCost > 0 ? (totalGain / totalCost) * 100 : 0;
  const dayChangePct = totalValue > 0 ? (dayChange / (totalValue - dayChange)) * 100 : 0;

  const sorted = [...positions].filter(p => p.dayChangePct !== undefined);
  sorted.sort((a, b) => (b.dayChangePct || 0) - (a.dayChangePct || 0));

  const topGainers = sorted.filter(p => (p.dayChangePct || 0) > 0).slice(0, 5);
  const topLosers = sorted.filter(p => (p.dayChangePct || 0) < 0).slice(-5).reverse();

  // Sector breakdown
  const sectorBreakdown: Record<string, number> = {};
  for (const pos of positions) {
    let sector = 'Other';
    const desc = pos.description.toUpperCase();

    if (desc.includes('BITCOIN') || desc.includes('ETHEREUM') || desc.includes('CRYPTO')) {
      sector = 'Crypto';
    } else if (desc.includes('BANK') || desc.includes('FINANCIAL') || desc.includes('MORGAN') || desc.includes('GOLDMAN') || desc.includes('JPMORGAN')) {
      sector = 'Financials';
    } else if (desc.includes('TECH') || desc.includes('SOFTWARE') || desc.includes('NVIDIA') || desc.includes('MICROSOFT') || desc.includes('APPLE') || desc.includes('GOOGLE') || desc.includes('META')) {
      sector = 'Technology';
    } else if (desc.includes('HEALTHCARE') || desc.includes('SURGICAL') || desc.includes('PHARMA')) {
      sector = 'Healthcare';
    } else if (desc.includes('ENERGY') || desc.includes('OIL') || desc.includes('CHEVRON') || desc.includes('EXXON')) {
      sector = 'Energy';
    } else if (desc.includes('DEFENSE') || desc.includes('AEROSPACE') || desc.includes('BOEING') || desc.includes('LOCKHEED')) {
      sector = 'Defense';
    }

    sectorBreakdown[sector] = (sectorBreakdown[sector] || 0) + (pos.currentValue || 0);
  }

  return {
    totalValue,
    totalCost,
    totalGain,
    totalGainPct,
    dayChange,
    dayChangePct,
    positions,
    topGainers,
    topLosers,
    sectorBreakdown,
    lastUpdated: new Date(),
  };
}

// ============================================================================
// EARNINGS & ECONOMIC DATA (Stub - needs API integration)
// ============================================================================

async function getUpcomingEarnings(portfolioSymbols: string[]): Promise<EarningsEvent[]> {
  // TODO: Integrate with Financial Modeling Prep API or Yahoo Finance earnings calendar
  // For now, return empty array - this is a stub for future implementation

  // Example of what this would return:
  // return [
  //   { symbol: 'SOFI', companyName: 'SoFi Technologies', reportDate: '2026-01-29',
  //     reportTime: 'BMO', inPortfolio: true, shares: 700 },
  // ];

  return [];
}

async function getEconomicCalendar(): Promise<EconomicEvent[]> {
  // TODO: Integrate with Trading Economics API or similar
  // For now, return empty array - this is a stub for future implementation

  // Example of what this would return:
  // return [
  //   { name: 'GDP Report', date: '2026-01-29', time: '7:30am CT', impact: 'high' },
  //   { name: 'Fed Rate Decision', date: '2026-01-30', time: '1:00pm CT', impact: 'high' },
  // ];

  return [];
}

// ============================================================================
// NARRATIVE GENERATION
// ============================================================================

function generateMarketHeadline(indices: { sp500: MarketData | null; nasdaq: MarketData | null; dow: MarketData | null }): string {
  const sp = indices.sp500?.changePct || 0;
  const nas = indices.nasdaq?.changePct || 0;
  const dow = indices.dow?.changePct || 0;

  const avgChange = (sp + nas + dow) / 3;

  // Determine headline based on market action
  if (avgChange < -1.5) {
    return 'Broad Selloff';
  } else if (avgChange < -0.5) {
    return 'Markets Pull Back';
  } else if (avgChange > 1.5) {
    return 'Strong Rally';
  } else if (avgChange > 0.5) {
    return 'Markets Advance';
  } else if (Math.abs(nas - sp) > 1.0) {
    return nas > sp ? 'Tech Leads' : 'Tech Lags';
  } else {
    return 'Quiet Session';
  }
}

function generatePortfolioHeadline(summary: PortfolioSummary): { headline: string; emoji: string } {
  const pct = summary.dayChangePct;

  if (pct < -2) {
    return { headline: 'Red Day', emoji: '🔴' };
  } else if (pct < -0.5) {
    return { headline: 'Down Day', emoji: '🔴' };
  } else if (pct > 2) {
    return { headline: 'Strong Day', emoji: '🟢' };
  } else if (pct > 0.5) {
    return { headline: 'Green Day', emoji: '🟢' };
  } else {
    return { headline: 'Flat Day', emoji: '⚪' };
  }
}

function generateSentiment(indices: { sp500: MarketData | null; nasdaq: MarketData | null; dow: MarketData | null }, summary: PortfolioSummary): string {
  const avgChange = ((indices.sp500?.changePct || 0) + (indices.nasdaq?.changePct || 0) + (indices.dow?.changePct || 0)) / 3;

  if (avgChange < -1.5) {
    return 'Market is fragile; watching if buyers step in at the open.';
  } else if (avgChange < -0.5) {
    return 'Mild pullback — consolidation likely before next move.';
  } else if (avgChange > 1.5) {
    return 'Strong momentum; path of least resistance is higher.';
  } else if (avgChange > 0.5) {
    return 'Buyers in control; maintaining constructive bias.';
  } else {
    return 'Neutral session; waiting for catalyst.';
  }
}

// ============================================================================
// REMINDERS GENERATION
// ============================================================================

async function generateReminders(
  summary: PortfolioSummary,
  earnings: EarningsEvent[],
  economic: EconomicEvent[]
): Promise<Reminder[]> {
  const reminders: Reminder[] = [];

  // Earnings reminders (within 7 days, portfolio holdings first)
  for (const e of earnings.filter(e => e.inPortfolio)) {
    const timeLabel = e.reportTime === 'BMO' ? 'before market' : e.reportTime === 'AMC' ? 'after close' : '';
    reminders.push({
      type: 'earnings',
      text: `${e.symbol} reports ${e.reportDate} ${timeLabel} (you hold ${e.shares} shares)`,
      priority: 'high',
      date: e.reportDate,
    });
  }

  // Economic events (high impact only)
  for (const e of economic.filter(e => e.impact === 'high')) {
    reminders.push({
      type: 'economic',
      text: `${e.name}: ${e.date} at ${e.time}`,
      priority: 'high',
      date: e.date,
    });
  }

  // Large position moves (> 5%)
  for (const pos of summary.positions) {
    if (Math.abs(pos.dayChangePct || 0) >= LARGE_POSITION_MOVE_PCT) {
      const direction = (pos.dayChangePct || 0) > 0 ? 'up' : 'down';
      reminders.push({
        type: 'position_alert',
        text: `${pos.symbol} ${direction} ${formatPct(pos.dayChangePct || 0)} — review position?`,
        priority: 'medium',
      });
    }
  }

  // TODO: Add dividend reminders, options expiration, custom reminders from Supabase

  return reminders;
}

// ============================================================================
// MAIN REPORT GENERATOR
// ============================================================================

export async function generateMarketReport(type?: ReportType): Promise<string> {
  const context = getReportContext(type);

  // Load data
  const positions = loadPortfolio();
  const updatedPositions = await updatePortfolioPrices(positions);
  const summary = calculatePortfolioSummary(updatedPositions);
  const indices = await getMarketIndices();
  const cryptos = await getCryptoPrices();
  const earnings = await getUpcomingEarnings(positions.map(p => p.symbol));
  const economic = await getEconomicCalendar();
  const reminders = await generateReminders(summary, earnings, economic);

  // Generate narrative elements
  const marketHeadline = generateMarketHeadline(indices);
  const portfolioStatus = generatePortfolioHeadline(summary);
  const sentiment = generateSentiment(indices, summary);

  // Build the report
  let report = '';

  // ── HEADER ──
  report += `${context.emoji} ${context.label}\n`;
  report += `${context.dayOfWeek}, ${context.dateStr} | ${context.contextLabel}\n\n`;

  // ── MARKET SNAPSHOT ──
  report += `📊 MARKET ${context.isMarketOpen ? 'UPDATE' : 'CLOSE'}: ${marketHeadline}\n`;

  // Brief context line (executive level - 1 line)
  if (Math.abs((indices.nasdaq?.changePct || 0)) > 1.5) {
    report += `Tech ${(indices.nasdaq?.changePct || 0) > 0 ? 'leading' : 'lagging'} the broader market.\n`;
  }
  report += `\n`;

  // Index bullets
  if (indices.dow) {
    report += `• Dow: ${formatCurrency(indices.dow.price)} (${formatPct(indices.dow.changePct)})\n`;
  }
  if (indices.nasdaq) {
    const nasdaqNote = Math.abs(indices.nasdaq.changePct) > 1.5 ? ' — Notable move' : '';
    report += `• Nasdaq: ${formatCurrency(indices.nasdaq.price)} (${formatPct(indices.nasdaq.changePct)})${nasdaqNote}\n`;
  }
  if (indices.sp500) {
    report += `• S&P 500: ${formatCurrency(indices.sp500.price)} (${formatPct(indices.sp500.changePct)})\n`;
  }
  report += `\n`;

  // ── YOUR PORTFOLIO ──
  report += `💼 YOUR PORTFOLIO: ${portfolioStatus.headline} ${portfolioStatus.emoji}\n`;
  report += `Value: ${formatCurrency(summary.totalValue)} | Day: ${formatPct(summary.dayChangePct)}\n\n`;

  // Notable movers (> 2% or top holdings)
  const notableMovers = summary.positions
    .filter(p => Math.abs(p.dayChangePct || 0) >= MOVER_THRESHOLD_PCT)
    .sort((a, b) => Math.abs(b.dayChangePct || 0) - Math.abs(a.dayChangePct || 0))
    .slice(0, 5);

  if (notableMovers.length > 0) {
    for (const pos of notableMovers) {
      const emoji = (pos.dayChangePct || 0) >= 0 ? '🟢' : '🔴';
      report += `• ${pos.symbol}: ${formatCurrency(pos.currentPrice || 0)} (${formatPct(pos.dayChangePct || 0)}) ${emoji}\n`;
      report += `  ↳ You hold ${pos.quantity.toFixed(0)} shares (${formatCurrency(pos.currentValue || 0)})\n`;
    }
    report += `\n`;
  }

  // ── CRYPTO ──
  if (cryptos.length > 0) {
    report += `₿ CRYPTO\n`;

    // Show top cryptos, marking which ones you hold
    const userCryptoSymbols = ['WLFI']; // Add your crypto holdings here
    const displayCryptos = cryptos.slice(0, 10);

    // Add any user holdings not in top 10
    for (const holding of userCryptoSymbols) {
      const found = cryptos.find(c => c.symbol === holding);
      if (found && !displayCryptos.includes(found)) {
        displayCryptos.push(found);
      }
    }

    for (const crypto of displayCryptos.slice(0, 12)) {
      const isHeld = userCryptoSymbols.includes(crypto.symbol);
      const holdMarker = isHeld ? ' 👈' : '';
      report += `• ${crypto.symbol}: ${formatCurrency(crypto.price)} (${formatPct(crypto.changePct)})${holdMarker}\n`;
    }
    report += `\n`;
  }

  // ── TOMORROW'S OUTLOOK / WHAT'S AHEAD ──
  const hasOutlookContent = earnings.length > 0 || economic.length > 0;
  if (hasOutlookContent || context.type === 'evening' || context.type === 'afternoon') {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toLocaleDateString('en-US', {
      timeZone: USER_TIMEZONE,
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    });

    report += `📅 TOMORROW'S OUTLOOK (${tomorrowStr})\n\n`;

    // Earnings
    const portfolioEarnings = earnings.filter(e => e.inPortfolio);
    if (portfolioEarnings.length > 0) {
      for (const e of portfolioEarnings) {
        const timeLabel = e.reportTime === 'BMO' ? 'tomorrow morning' : e.reportTime === 'AMC' ? 'after close' : 'TBD';
        report += `• Earnings: ${e.symbol} reports ${timeLabel}\n`;
        report += `  ↳ You hold ${e.shares} shares\n`;
      }
    }

    // Economic data
    const highImpactEvents = economic.filter(e => e.impact === 'high');
    for (const e of highImpactEvents) {
      report += `• Data: ${e.name} at ${e.time}\n`;
    }

    // Sentiment
    report += `\n• Sentiment: ${sentiment}\n`;
    report += `\n`;
  }

  // ── REMINDERS ──
  if (reminders.length > 0) {
    report += `⏰ REMINDERS\n\n`;
    for (const r of reminders.slice(0, 5)) {
      report += `• ${r.text}\n`;
    }
    report += `\n`;
  }

  // ── FOOTER ──
  report += `───────────────────\n`;
  report += `Generated ${context.dateStr} at ${context.timeStr} CT`;

  return report;
}

// ============================================================================
// EXPORTS (maintain compatibility with existing code)
// ============================================================================

export { getReportContext, loadPortfolio as loadPortfolioPositions };
