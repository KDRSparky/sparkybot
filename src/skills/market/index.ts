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
  reportTime: 'BMO' | 'AMC' | 'TNS';
  estimate?: number;
  inPortfolio: boolean;
  shares?: number;
}

export interface EconomicEvent {
  name: string;
  date: string;
  time: string;
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

const TOP_CRYPTO_IDS = [
  'bitcoin', 'ethereum', 'ripple', 'binancecoin', 'solana',
  'dogecoin', 'cardano', 'avalanche-2', 'polkadot', 'chainlink'
];

const USER_CRYPTO_HOLDINGS = ['world-liberty-financial'];

const MOVER_THRESHOLD_PCT = 2.0;
const EARNINGS_LOOKAHEAD_DAYS = 7;
const LARGE_POSITION_MOVE_PCT = 5.0;

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

const formatChange = (n: number, pct: number): string => {
  const safeN = isNaN(n) || !isFinite(n) ? 0 : n;
  const safePct = isNaN(pct) || !isFinite(pct) ? 0 : pct;
  if (safeN === 0 && safePct === 0) return 'No change';
  return `${safeN >= 0 ? '+' : ''}${formatCurrency(safeN)} (${formatPct(safePct)})`;
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

export function getReportContext(overrideType?: ReportType): ReportContext {
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

/**
 * Get current market status based on time
 */
export function getMarketStatus(): string {
  const now = new Date();
  const centralTime = new Date(now.toLocaleString('en-US', { timeZone: USER_TIMEZONE }));
  const hour = centralTime.getHours();
  const minute = centralTime.getMinutes();
  const day = centralTime.getDay();

  if (day === 0 || day === 6) {
    return '📅 Markets closed (Weekend)';
  }

  const timeInMinutes = hour * 60 + minute;

  if (timeInMinutes >= 4 * 60 && timeInMinutes < 8 * 60 + 30) {
    return '🌅 Pre-market trading';
  }

  if (timeInMinutes >= 8 * 60 + 30 && timeInMinutes < 15 * 60) {
    return '🟢 Markets open';
  }

  if (timeInMinutes >= 15 * 60 && timeInMinutes < 19 * 60) {
    return '🌙 After-hours trading';
  }

  return '🔴 Markets closed';
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
    const quote = result.indicators?.quote?.[0];
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
      high: quote?.high?.[0],
      low: quote?.low?.[0],
      open: quote?.open?.[0],
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

export async function getCryptoPrice(coinId: string): Promise<MarketData | null> {
  try {
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd&include_24hr_change=true`;

    const response = await fetch(url);
    if (!response.ok) return null;

    const data: any = await response.json();
    const coin = data[coinId];
    if (!coin) return null;

    return {
      symbol: coinId.toUpperCase(),
      price: coin.usd,
      change: (coin.usd * coin.usd_24h_change) / 100,
      changePct: coin.usd_24h_change,
    };
  } catch (error) {
    console.error(`Error fetching crypto price for ${coinId}:`, error);
    return null;
  }
}

export async function getCryptoPrices(): Promise<CryptoData[]> {
  try {
    const allIds = [...TOP_CRYPTO_IDS, ...USER_CRYPTO_HOLDINGS].join(',');
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${allIds}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true`;

    const response = await fetch(url);
    if (!response.ok) return [];

    const data: any = await response.json();
    const results: CryptoData[] = [];

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
  return [];
}

async function getEconomicCalendar(): Promise<EconomicEvent[]> {
  // TODO: Integrate with Trading Economics API or similar
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

  for (const e of earnings.filter(e => e.inPortfolio)) {
    const timeLabel = e.reportTime === 'BMO' ? 'before market' : e.reportTime === 'AMC' ? 'after close' : '';
    reminders.push({
      type: 'earnings',
      text: `${e.symbol} reports ${e.reportDate} ${timeLabel} (you hold ${e.shares} shares)`,
      priority: 'high',
      date: e.reportDate,
    });
  }

  for (const e of economic.filter(e => e.impact === 'high')) {
    reminders.push({
      type: 'economic',
      text: `${e.name}: ${e.date} at ${e.time}`,
      priority: 'high',
      date: e.date,
    });
  }

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

  return reminders;
}

// ============================================================================
// MAIN REPORT GENERATOR (ENHANCED v2.0)
// ============================================================================

export async function generateMarketReport(type?: ReportType): Promise<string> {
  const context = getReportContext(type);

  const positions = loadPortfolio();
  const updatedPositions = await updatePortfolioPrices(positions);
  const summary = calculatePortfolioSummary(updatedPositions);
  const indices = await getMarketIndices();
  const cryptos = await getCryptoPrices();
  const earnings = await getUpcomingEarnings(positions.map(p => p.symbol));
  const economic = await getEconomicCalendar();
  const reminders = await generateReminders(summary, earnings, economic);

  const marketHeadline = generateMarketHeadline(indices);
  const portfolioStatus = generatePortfolioHeadline(summary);
  const sentiment = generateSentiment(indices, summary);

  let report = '';

  // ── HEADER ──
  report += `${context.emoji} ${context.label}\n`;
  report += `${context.dayOfWeek}, ${context.dateStr} | ${context.contextLabel}\n\n`;

  // ── MARKET SNAPSHOT ──
  report += `📊 MARKET ${context.isMarketOpen ? 'UPDATE' : 'CLOSE'}: ${marketHeadline}\n`;

  if (Math.abs((indices.nasdaq?.changePct || 0)) > 1.5) {
    report += `Tech ${(indices.nasdaq?.changePct || 0) > 0 ? 'leading' : 'lagging'} the broader market.\n`;
  }
  report += `\n`;

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

    const userCryptoSymbols = ['WLFI'];
    const displayCryptos = cryptos.slice(0, 10);

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

  // ── TOMORROW'S OUTLOOK ──
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

    const portfolioEarnings = earnings.filter(e => e.inPortfolio);
    if (portfolioEarnings.length > 0) {
      for (const e of portfolioEarnings) {
        const timeLabel = e.reportTime === 'BMO' ? 'tomorrow morning' : e.reportTime === 'AMC' ? 'after close' : 'TBD';
        report += `• Earnings: ${e.symbol} reports ${timeLabel}\n`;
        report += `  ↳ You hold ${e.shares} shares\n`;
      }
    }

    const highImpactEvents = economic.filter(e => e.impact === 'high');
    for (const e of highImpactEvents) {
      report += `• Data: ${e.name} at ${e.time}\n`;
    }

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
// ORIGINAL FUNCTIONS (Required by index.ts)
// ============================================================================

/**
 * Get quick quote for a symbol
 */
export async function getQuickQuote(symbol: string): Promise<string> {
  const quote = await getStockQuote(symbol.toUpperCase());

  if (!quote) {
    return `Couldn't find data for ${symbol}. Make sure it's a valid ticker symbol.`;
  }

  const emoji = quote.changePct >= 0 ? '📈' : '📉';

  return `${emoji} **${quote.symbol}**: ${formatCurrency(quote.price)} (${formatPct(quote.changePct)} today)`;
}

/**
 * Get portfolio position for a symbol
 */
export function getPortfolioPosition(symbol: string): Position | null {
  const positions = loadPortfolio();
  return positions.find(p => p.symbol.toUpperCase() === symbol.toUpperCase()) || null;
}

/**
 * Get portfolio overview
 */
export async function getPortfolioOverview(): Promise<string> {
  const positions = loadPortfolio();

  let totalValue = 0;
  let totalCost = 0;

  for (const pos of positions) {
    totalValue += pos.currentValue || 0;
    totalCost += pos.quantity * pos.costBasis;
  }

  const totalGain = totalValue - totalCost;
  const totalGainPct = totalCost > 0 ? (totalGain / totalCost) * 100 : 0;

  let response = `💼 **Portfolio Overview**\n\n`;
  response += `Total Value: ${formatCurrency(totalValue)}\n`;
  response += `Total Cost: ${formatCurrency(totalCost)}\n`;
  response += `Total Gain: ${formatCurrency(totalGain)} (${formatPct(totalGainPct)})\n`;
  response += `Positions: ${positions.length} holdings\n\n`;

  const sortedByValue = [...positions].sort((a, b) => (b.currentValue || 0) - (a.currentValue || 0));
  response += `**Top Holdings:**\n`;
  for (const pos of sortedByValue.slice(0, 5)) {
    const pct = ((pos.currentValue || 0) / totalValue) * 100;
    response += `${pos.symbol}: ${formatCurrency(pos.currentValue || 0)} (${pct.toFixed(1)}%)\n`;
  }

  return response;
}

/**
 * Generate comprehensive overnight analysis
 */
export async function generateOvernightAnalysis(): Promise<{
  content: string;
  summary: string;
}> {
  const reportDate = new Date().toLocaleDateString('en-US', {
    timeZone: USER_TIMEZONE,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const positions = loadPortfolio();
  const updatedPositions = await updatePortfolioPrices(positions);
  const summary = calculatePortfolioSummary(updatedPositions);

  const indices = await getMarketIndices();
  const [bitcoin, ethereum] = await Promise.all([
    getCryptoPrice('bitcoin'),
    getCryptoPrice('ethereum'),
  ]);

  let content = `# SparkyBot Overnight Market Analysis\n`;
  content += `## ${reportDate}\n\n`;

  content += `## Executive Summary\n\n`;
  content += `Your portfolio closed at **${formatCurrency(summary.totalValue)}** `;
  content += `with a day change of ${formatChange(summary.dayChange, summary.dayChangePct)}.\n\n`;
  content += `Total unrealized gain: ${formatChange(summary.totalGain, summary.totalGainPct)}\n\n`;

  content += `## Market Overview\n\n`;
  content += `| Index | Close | Change |\n`;
  content += `|-------|-------|--------|\n`;
  if (indices.sp500) {
    content += `| S&P 500 | ${formatCurrency(indices.sp500.price)} | ${formatChange(indices.sp500.change, indices.sp500.changePct)} |\n`;
  }
  if (indices.nasdaq) {
    content += `| NASDAQ | ${formatCurrency(indices.nasdaq.price)} | ${formatChange(indices.nasdaq.change, indices.nasdaq.changePct)} |\n`;
  }
  if (indices.dow) {
    content += `| DOW | ${formatCurrency(indices.dow.price)} | ${formatChange(indices.dow.change, indices.dow.changePct)} |\n`;
  }
  content += `\n`;

  content += `## Cryptocurrency\n\n`;
  if (bitcoin) {
    content += `**Bitcoin**: ${formatCurrency(bitcoin.price)} (${formatPct(bitcoin.changePct)} 24h)\n\n`;
  }
  if (ethereum) {
    content += `**Ethereum**: ${formatCurrency(ethereum.price)} (${formatPct(ethereum.changePct)} 24h)\n\n`;
  }

  content += `## Portfolio Breakdown\n\n`;
  content += `| Symbol | Shares | Price | Value | Day Change | Total Gain |\n`;
  content += `|--------|--------|-------|-------|------------|------------|\n`;

  const sortedByValue = [...updatedPositions].sort((a, b) => (b.currentValue || 0) - (a.currentValue || 0));
  for (const pos of sortedByValue.slice(0, 20)) {
    const currentPrice = pos.currentPrice || pos.lastPrice;
    const dayChg = pos.dayChangePct !== undefined ? formatPct(pos.dayChangePct) : 'N/A';
    const totalGainPct = pos.totalGainPct !== undefined ? formatPct(pos.totalGainPct) : 'N/A';
    content += `| ${pos.symbol} | ${pos.quantity.toFixed(2)} | ${formatCurrency(currentPrice)} | ${formatCurrency(pos.currentValue || 0)} | ${dayChg} | ${totalGainPct} |\n`;
  }
  content += `\n`;

  content += `## Top Movers\n\n`;

  if (summary.topGainers.length > 0) {
    content += `### Top Gainers\n\n`;
    for (const pos of summary.topGainers.slice(0, 5)) {
      if (pos.dayChangePct && pos.dayChangePct > 0) {
        content += `- **${pos.symbol}**: ${formatPct(pos.dayChangePct)} (+${formatCurrency(pos.dayChange || 0)})\n`;
      }
    }
    content += `\n`;
  }

  if (summary.topLosers.length > 0) {
    content += `### Top Losers\n\n`;
    for (const pos of summary.topLosers.slice(0, 5)) {
      if (pos.dayChangePct && pos.dayChangePct < 0) {
        content += `- **${pos.symbol}**: ${formatPct(pos.dayChangePct)} (${formatCurrency(pos.dayChange || 0)})\n`;
      }
    }
    content += `\n`;
  }

  content += `## Sector Allocation\n\n`;
  content += `| Sector | Value | % of Portfolio |\n`;
  content += `|--------|-------|----------------|\n`;
  const sortedSectors = Object.entries(summary.sectorBreakdown).sort((a, b) => b[1] - a[1]);
  for (const [sector, value] of sortedSectors) {
    const pct = (value / summary.totalValue) * 100;
    content += `| ${sector} | ${formatCurrency(value)} | ${pct.toFixed(1)}% |\n`;
  }
  content += `\n`;

  content += `## Concentration Analysis\n\n`;
  const top5Value = sortedByValue.slice(0, 5).reduce((sum, p) => sum + (p.currentValue || 0), 0);
  const top10Value = sortedByValue.slice(0, 10).reduce((sum, p) => sum + (p.currentValue || 0), 0);
  content += `- **Top 5 holdings**: ${formatCurrency(top5Value)} (${((top5Value / summary.totalValue) * 100).toFixed(1)}% of portfolio)\n`;
  content += `- **Top 10 holdings**: ${formatCurrency(top10Value)} (${((top10Value / summary.totalValue) * 100).toFixed(1)}% of portfolio)\n`;
  content += `- **Total positions**: ${positions.length}\n\n`;

  content += `## Notes\n\n`;
  content += `_This report was automatically generated by SparkyBot at 5:00 AM CT._\n\n`;
  content += `---\n\n`;
  content += `*Report generated: ${new Date().toLocaleString('en-US', { timeZone: USER_TIMEZONE })}*\n`;

  const telegramSummary = `📊 **Overnight Analysis Ready**\n\n` +
    `Portfolio: ${formatCurrency(summary.totalValue)}\n` +
    `Day Change: ${formatChange(summary.dayChange, summary.dayChangePct)}\n` +
    `Total Gain: ${formatChange(summary.totalGain, summary.totalGainPct)}\n\n` +
    `_Full report saved to Google Drive_`;

  return {
    content,
    summary: telegramSummary,
  };
}

/**
 * Take a portfolio snapshot and store in Supabase
 */
export async function takePortfolioSnapshot(): Promise<{
  success: boolean;
  snapshotId?: string;
  totalValue?: number;
  dailyChange?: number;
  dailyChangePct?: number;
  error?: string;
}> {
  if (!isSupabaseConfigured || !supabase) {
    return { success: false, error: 'Supabase not configured' };
  }

  try {
    const positions = loadPortfolio();
    const updatedPositions = await updatePortfolioPrices(positions);
    const summary = calculatePortfolioSummary(updatedPositions);

    const today = new Date().toLocaleDateString('en-CA', { timeZone: USER_TIMEZONE });

    const { data: existing } = await supabase
      .from('portfolio_snapshots')
      .select('id')
      .eq('snapshot_date', today)
      .single();

    if (existing) {
      const { data, error } = await supabase
        .from('portfolio_snapshots')
        .update({
          holdings: updatedPositions,
          total_value: summary.totalValue,
          daily_change: summary.dayChange,
          daily_change_pct: summary.dayChangePct,
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (error) throw error;

      console.log(`📸 Updated portfolio snapshot for ${today}: ${summary.totalValue.toLocaleString()}`);
      return {
        success: true,
        snapshotId: data.id,
        totalValue: summary.totalValue,
        dailyChange: summary.dayChange,
        dailyChangePct: summary.dayChangePct,
      };
    } else {
      const { data, error } = await supabase
        .from('portfolio_snapshots')
        .insert({
          snapshot_date: today,
          holdings: updatedPositions,
          total_value: summary.totalValue,
          daily_change: summary.dayChange,
          daily_change_pct: summary.dayChangePct,
        })
        .select()
        .single();

      if (error) throw error;

      console.log(`📸 Created portfolio snapshot for ${today}: ${summary.totalValue.toLocaleString()}`);
      return {
        success: true,
        snapshotId: data.id,
        totalValue: summary.totalValue,
        dailyChange: summary.dayChange,
        dailyChangePct: summary.dayChangePct,
      };
    }
  } catch (error: any) {
    console.error('Error taking portfolio snapshot:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get portfolio history for trend analysis
 */
export async function getPortfolioHistory(days: number = 30): Promise<Array<{
  date: string;
  totalValue: number;
  dailyChange: number;
  dailyChangePct: number;
}>> {
  if (!isSupabaseConfigured || !supabase) {
    return [];
  }

  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startDateStr = startDate.toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('portfolio_snapshots')
      .select('snapshot_date, total_value, daily_change, daily_change_pct')
      .gte('snapshot_date', startDateStr)
      .order('snapshot_date', { ascending: true });

    if (error) throw error;

    return (data || []).map(row => ({
      date: row.snapshot_date,
      totalValue: row.total_value,
      dailyChange: row.daily_change,
      dailyChangePct: row.daily_change_pct,
    }));
  } catch (error) {
    console.error('Error getting portfolio history:', error);
    return [];
  }
}

/**
 * Format portfolio performance over a time period
 */
export async function formatPortfolioPerformance(days: number = 30): Promise<string> {
  const history = await getPortfolioHistory(days);

  if (history.length === 0) {
    return `📊 No portfolio history available yet. Snapshots are taken daily at 5am CT.`;
  }

  const first = history[0];
  const last = history[history.length - 1];
  const periodChange = last.totalValue - first.totalValue;
  const periodChangePct = (periodChange / first.totalValue) * 100;

  const highValue = Math.max(...history.map(h => h.totalValue));
  const lowValue = Math.min(...history.map(h => h.totalValue));
  const highDate = history.find(h => h.totalValue === highValue)?.date;
  const lowDate = history.find(h => h.totalValue === lowValue)?.date;

  const upDays = history.filter(h => h.dailyChange > 0).length;
  const downDays = history.filter(h => h.dailyChange < 0).length;
  const flatDays = history.filter(h => h.dailyChange === 0).length;

  let response = `📊 **Portfolio Performance (${days} Days)**\n\n`;
  response += `**Current Value:** ${formatCurrency(last.totalValue)}\n`;
  response += `**Period Change:** ${formatCurrency(periodChange)} (${formatPct(periodChangePct)})\n\n`;
  response += `**Range:**\n`;
  response += `  📈 High: ${formatCurrency(highValue)} (${highDate})\n`;
  response += `  📉 Low: ${formatCurrency(lowValue)} (${lowDate})\n\n`;
  response += `**Trading Days:** ${history.length}\n`;
  response += `  ✅ Up: ${upDays} | ❌ Down: ${downDays} | ➖ Flat: ${flatDays}\n`;

  return response;
}

// ============================================================================
// EXPORTS
// ============================================================================

export { loadPortfolio as loadPortfolioPositions };
