/**
 * Market Intelligence Skill
 * 
 * Features:
 * - Portfolio tracking from CSV
 * - Real-time quotes via Yahoo Finance (free)
 * - Crypto prices via CoinGecko (free)
 * - Market momentum indicators
 * - Scheduled reports (8am, 12pm, 3:15pm)
 * - Overnight analysis (5am to Google Drive)
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// Types
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

export interface MarketReport {
  type: 'morning' | 'midday' | 'afternoon' | 'overnight';
  timestamp: Date;
  indices: {
    sp500: MarketData;
    nasdaq: MarketData;
    dow: MarketData;
  };
  crypto: {
    bitcoin: MarketData;
    ethereum: MarketData;
  };
  portfolio: PortfolioSummary;
  analysis: string;
  alerts: string[];
}

// Portfolio file path
const PORTFOLIO_PATH = join(process.cwd(), 'data', 'portfolio.csv');

// User timezone
const USER_TIMEZONE = 'America/Chicago';

/**
 * Get current market status based on time
 */
export function getMarketStatus(): string {
  const now = new Date();
  const centralTime = new Date(now.toLocaleString('en-US', { timeZone: USER_TIMEZONE }));
  const hour = centralTime.getHours();
  const minute = centralTime.getMinutes();
  const day = centralTime.getDay(); // 0 = Sunday, 6 = Saturday
  
  // Weekend
  if (day === 0 || day === 6) {
    return '🏝️ Markets closed (Weekend)';
  }
  
  const timeInMinutes = hour * 60 + minute;
  
  // Pre-market: 4:00 AM - 8:30 AM CT (7:00 AM - 9:30 AM ET)
  if (timeInMinutes >= 4 * 60 && timeInMinutes < 8 * 60 + 30) {
    return '🌅 Pre-market trading';
  }
  
  // Regular hours: 8:30 AM - 3:00 PM CT (9:30 AM - 4:00 PM ET)
  if (timeInMinutes >= 8 * 60 + 30 && timeInMinutes < 15 * 60) {
    return '🟢 Markets open';
  }
  
  // After-hours: 3:00 PM - 7:00 PM CT (4:00 PM - 8:00 PM ET)
  if (timeInMinutes >= 15 * 60 && timeInMinutes < 19 * 60) {
    return '🌙 After-hours trading';
  }
  
  // Closed
  return '🔴 Markets closed';
}

/**
 * Load portfolio from CSV file
 */
export function loadPortfolio(): Position[] {
  if (!existsSync(PORTFOLIO_PATH)) {
    console.warn('Portfolio file not found:', PORTFOLIO_PATH);
    return [];
  }

  const content = readFileSync(PORTFOLIO_PATH, 'utf-8');
  const lines = content.trim().split('\n');
  const positions: Position[] = [];

  // Skip header
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    if (cols.length >= 6) {
      const symbol = cols[0].trim();
      // Skip money market entries
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

/**
 * Fetch stock quote from Yahoo Finance (free, no API key needed)
 */
export async function getStockQuote(symbol: string): Promise<MarketData | null> {
  try {
    // Yahoo Finance API endpoint
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

/**
 * Fetch crypto price from CoinGecko (free, no API key needed)
 */
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

/**
 * Fetch major market indices
 */
export async function getMarketIndices(): Promise<{
  sp500: MarketData | null;
  nasdaq: MarketData | null;
  dow: MarketData | null;
}> {
  const [sp500, nasdaq, dow] = await Promise.all([
    getStockQuote('^GSPC'),  // S&P 500
    getStockQuote('^IXIC'),  // NASDAQ
    getStockQuote('^DJI'),   // Dow Jones
  ]);

  return { sp500, nasdaq, dow };
}

/**
 * Update portfolio with current prices
 */
export async function updatePortfolioPrices(positions: Position[]): Promise<Position[]> {
  const symbols = [...new Set(positions.map(p => p.symbol))];
  
  // Batch fetch quotes (rate limit: be careful)
  const quotes = new Map<string, MarketData>();
  
  for (const symbol of symbols) {
    // Skip non-standard symbols
    if (symbol.includes('/') || symbol.length > 5) continue;
    
    const quote = await getStockQuote(symbol);
    if (quote) {
      quotes.set(symbol, quote);
    }
    
    // Small delay to avoid rate limiting
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

/**
 * Calculate portfolio summary
 */
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

  // Sort for top gainers/losers
  const sorted = [...positions].filter(p => p.dayChangePct !== undefined);
  sorted.sort((a, b) => (b.dayChangePct || 0) - (a.dayChangePct || 0));

  const topGainers = sorted.slice(0, 5);
  const topLosers = sorted.slice(-5).reverse();

  // Sector breakdown (simplified by description keywords)
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

/**
 * Generate market report text
 */
export async function generateMarketReport(type: MarketReport['type']): Promise<string> {
  // Load and update portfolio
  const positions = loadPortfolio();
  const updatedPositions = await updatePortfolioPrices(positions);
  const summary = calculatePortfolioSummary(updatedPositions);

  // Get market indices
  const indices = await getMarketIndices();

  // Get crypto
  const [bitcoin, ethereum] = await Promise.all([
    getCryptoPrice('bitcoin'),
    getCryptoPrice('ethereum'),
  ]);

  // Format the report
  const reportTime = new Date().toLocaleString('en-US', { 
    timeZone: 'America/Chicago',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  const formatCurrency = (n: number) => 
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
  
  const formatPct = (n: number) => {
    if (isNaN(n) || !isFinite(n)) return '0.00%';
    return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
  };

  const formatChange = (n: number, pct: number) => {
    const safeN = isNaN(n) || !isFinite(n) ? 0 : n;
    const safePct = isNaN(pct) || !isFinite(pct) ? 0 : pct;
    if (safeN === 0 && safePct === 0) {
      return '➖ No change';
    }
    return `${safeN >= 0 ? '📈' : '📉'} ${formatCurrency(Math.abs(safeN))} (${formatPct(safePct)})`;
  };

  let report = `📊 **${type.charAt(0).toUpperCase() + type.slice(1)} Market Report**\n`;
  report += `${reportTime}\n`;
  
  // Add market status
  const marketStatus = getMarketStatus();
  report += `_${marketStatus}_\n\n`;

  // Market Overview
  report += `**🌍 Market Overview**\n`;
  if (indices.sp500) {
    report += `S&P 500: ${formatCurrency(indices.sp500.price)} ${formatChange(indices.sp500.change, indices.sp500.changePct)}\n`;
  }
  if (indices.nasdaq) {
    report += `NASDAQ: ${formatCurrency(indices.nasdaq.price)} ${formatChange(indices.nasdaq.change, indices.nasdaq.changePct)}\n`;
  }
  if (indices.dow) {
    report += `DOW: ${formatCurrency(indices.dow.price)} ${formatChange(indices.dow.change, indices.dow.changePct)}\n`;
  }
  report += `\n`;

  // Crypto
  report += `**₿ Crypto**\n`;
  if (bitcoin) {
    report += `Bitcoin: ${formatCurrency(bitcoin.price)} ${formatChange(bitcoin.change, bitcoin.changePct)}\n`;
  }
  if (ethereum) {
    report += `Ethereum: ${formatCurrency(ethereum.price)} ${formatChange(ethereum.change, ethereum.changePct)}\n`;
  }
  report += `\n`;

  // Portfolio Summary
  report += `**💼 Your Portfolio**\n`;
  report += `Total Value: ${formatCurrency(summary.totalValue)}\n`;
  report += `Day Change: ${formatChange(summary.dayChange, summary.dayChangePct)}\n`;
  report += `Total Gain: ${formatChange(summary.totalGain, summary.totalGainPct)}\n`;
  report += `\n`;

  // Top Movers
  if (summary.topGainers.length > 0) {
    report += `**🚀 Top Gainers**\n`;
    for (const pos of summary.topGainers.slice(0, 3)) {
      if (pos.dayChangePct && pos.dayChangePct > 0) {
        report += `${pos.symbol}: ${formatPct(pos.dayChangePct)}\n`;
      }
    }
    report += `\n`;
  }

  if (summary.topLosers.length > 0) {
    report += `**🔻 Top Losers**\n`;
    for (const pos of summary.topLosers.slice(0, 3)) {
      if (pos.dayChangePct && pos.dayChangePct < 0) {
        report += `${pos.symbol}: ${formatPct(pos.dayChangePct)}\n`;
      }
    }
    report += `\n`;
  }

  // Sector breakdown for overnight report
  if (type === 'overnight') {
    report += `**📊 Sector Allocation**\n`;
    const sortedSectors = Object.entries(summary.sectorBreakdown)
      .sort((a, b) => b[1] - a[1]);
    for (const [sector, value] of sortedSectors) {
      const pct = (value / summary.totalValue) * 100;
      report += `${sector}: ${formatCurrency(value)} (${pct.toFixed(1)}%)\n`;
    }
    report += `\n`;
  }

  // Add a dad joke for personality
  const marketJokes = [
    "Why did the stock market go to therapy? Too many ups and downs!",
    "What's a stock trader's favorite game? Buy low, sell high... and cry.",
    "The market's so volatile, even my charts need a seatbelt.",
    "I invested in a ceiling fan company. Business is looking up!",
  ];
  report += `\n_${marketJokes[Math.floor(Math.random() * marketJokes.length)]}_`;

  return report;
}

/**
 * Get quick quote for a symbol
 */
export async function getQuickQuote(symbol: string): Promise<string> {
  const quote = await getStockQuote(symbol.toUpperCase());
  
  if (!quote) {
    return `Couldn't find data for ${symbol}. Make sure it's a valid ticker symbol.`;
  }

  const formatCurrency = (n: number) => 
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
  
  const formatPct = (n: number) => 
    `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;

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
  
  // Calculate totals without fetching live prices (faster)
  let totalValue = 0;
  let totalCost = 0;

  for (const pos of positions) {
    totalValue += pos.currentValue || 0;
    totalCost += pos.quantity * pos.costBasis;
  }

  const totalGain = totalValue - totalCost;
  const totalGainPct = totalCost > 0 ? (totalGain / totalCost) * 100 : 0;

  const formatCurrency = (n: number) => 
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
  
  const formatPct = (n: number) => 
    `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;

  let response = `💼 **Portfolio Overview**\n\n`;
  response += `Total Value: ${formatCurrency(totalValue)}\n`;
  response += `Total Cost: ${formatCurrency(totalCost)}\n`;
  response += `Total Gain: ${formatCurrency(totalGain)} (${formatPct(totalGainPct)})\n`;
  response += `Positions: ${positions.length} holdings\n\n`;

  // Top 5 by value
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
 * This is a detailed report saved to Google Drive at 5am
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

  // Load portfolio and get live prices
  const positions = loadPortfolio();
  const updatedPositions = await updatePortfolioPrices(positions);
  const summary = calculatePortfolioSummary(updatedPositions);

  // Get market data
  const indices = await getMarketIndices();
  const [bitcoin, ethereum] = await Promise.all([
    getCryptoPrice('bitcoin'),
    getCryptoPrice('ethereum'),
  ]);

  // Formatting helpers
  const formatCurrency = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

  const formatPct = (n: number) => {
    if (isNaN(n) || !isFinite(n)) return '0.00%';
    return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
  };

  const formatChange = (n: number, pct: number) => {
    const safeN = isNaN(n) || !isFinite(n) ? 0 : n;
    const safePct = isNaN(pct) || !isFinite(pct) ? 0 : pct;
    if (safeN === 0 && safePct === 0) return 'No change';
    return `${safeN >= 0 ? '+' : ''}${formatCurrency(safeN)} (${formatPct(safePct)})`;
  };

  // Build the comprehensive report
  let content = `# SparkyBot Overnight Market Analysis\n`;
  content += `## ${reportDate}\n\n`;

  // Executive Summary
  content += `## Executive Summary\n\n`;
  content += `Your portfolio closed at **${formatCurrency(summary.totalValue)}** `;
  content += `with a day change of ${formatChange(summary.dayChange, summary.dayChangePct)}.\n\n`;
  content += `Total unrealized gain: ${formatChange(summary.totalGain, summary.totalGainPct)}\n\n`;

  // Market Overview
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

  // Crypto
  content += `## Cryptocurrency\n\n`;
  if (bitcoin) {
    content += `**Bitcoin**: ${formatCurrency(bitcoin.price)} (${formatPct(bitcoin.changePct)} 24h)\n\n`;
  }
  if (ethereum) {
    content += `**Ethereum**: ${formatCurrency(ethereum.price)} (${formatPct(ethereum.changePct)} 24h)\n\n`;
  }

  // Portfolio Details
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

  // Top Movers
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

  // Sector Allocation
  content += `## Sector Allocation\n\n`;
  content += `| Sector | Value | % of Portfolio |\n`;
  content += `|--------|-------|----------------|\n`;
  const sortedSectors = Object.entries(summary.sectorBreakdown).sort((a, b) => b[1] - a[1]);
  for (const [sector, value] of sortedSectors) {
    const pct = (value / summary.totalValue) * 100;
    content += `| ${sector} | ${formatCurrency(value)} | ${pct.toFixed(1)}% |\n`;
  }
  content += `\n`;

  // Concentration Analysis
  content += `## Concentration Analysis\n\n`;
  const top5Value = sortedByValue.slice(0, 5).reduce((sum, p) => sum + (p.currentValue || 0), 0);
  const top10Value = sortedByValue.slice(0, 10).reduce((sum, p) => sum + (p.currentValue || 0), 0);
  content += `- **Top 5 holdings**: ${formatCurrency(top5Value)} (${((top5Value / summary.totalValue) * 100).toFixed(1)}% of portfolio)\n`;
  content += `- **Top 10 holdings**: ${formatCurrency(top10Value)} (${((top10Value / summary.totalValue) * 100).toFixed(1)}% of portfolio)\n`;
  content += `- **Total positions**: ${positions.length}\n\n`;

  // Recommendations placeholder
  content += `## Notes\n\n`;
  content += `_This report was automatically generated by SparkyBot at 5:00 AM CT._\n\n`;
  content += `---\n\n`;
  content += `*Report generated: ${new Date().toLocaleString('en-US', { timeZone: USER_TIMEZONE })}*\n`;

  // Create a short summary for Telegram
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
