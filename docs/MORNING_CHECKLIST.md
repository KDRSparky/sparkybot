# SparkyBot Setup Checklist

## Items to Acquire/Setup in the Morning

### 1. Supabase Project
- [ ] Go to https://supabase.com
- [ ] Create new project: `sparkybot`
- [ ] Note down:
  - Project URL: `https://xxxxx.supabase.co`
  - Anon Key: (public)
  - Service Role Key: (secret - for bot)
- [ ] Run the schema in `config/schema.sql` in SQL Editor

### 2. Google Cloud Project (for Calendar & Gmail)
- [ ] Go to https://console.cloud.google.com
- [ ] Create project: `SparkyBot`
- [ ] Enable APIs:
  - Google Calendar API
  - Gmail API
  - Google Drive API
- [ ] Create OAuth 2.0 credentials
- [ ] Download credentials JSON
- [ ] Note: We need to authorize both accounts:
  - johndempsey@johndempsey.us
  - kdrsparky@gmail.com

### 3. Cloudflare Workers (for Scheduled Reports)
- [ ] Go to https://dash.cloudflare.com
- [ ] Create Worker: `sparkybot-scheduler`
- [ ] Deploy `workers/scheduler.ts`
- [ ] Set secrets:
  ```
  wrangler secret put TELEGRAM_BOT_TOKEN
  wrangler secret put BOT_WEBHOOK_URL
  ```
- [ ] Configure cron triggers in dashboard

### 4. Railway Environment Variables
Already set:
- [x] TELEGRAM_BOT_TOKEN
- [x] TELEGRAM_OWNER_USER_ID  
- [x] GEMINI_API_KEY

Add these:
- [ ] SUPABASE_URL
- [ ] SUPABASE_ANON_KEY
- [ ] SUPABASE_SERVICE_ROLE_KEY
- [ ] GOOGLE_CLIENT_ID
- [ ] GOOGLE_CLIENT_SECRET

### 5. Optional: Market Data API Keys (Free Tiers)
- [ ] Alpha Vantage (stocks): https://www.alphavantage.co/support/#api-key
- [ ] CoinGecko (crypto): Free, no key needed

---

## What's Already Working

✅ Telegram bot running on Railway
✅ Gemini 2.0 Flash AI integration
✅ Basic conversation memory (in-session)
✅ Portfolio data loaded (65 positions, ~$1.3M total)
✅ Market commands: /portfolio, /quote, /market
✅ Natural language market queries

## What's Built But Needs Config

⏳ Market reports (need Cloudflare Worker deployment)
⏳ Scheduled reports (8am, 12pm, 3:15pm CT)
⏳ Overnight analysis (5am CT)

## What's Planned Next

📅 Google Calendar integration
📧 Gmail integration  
🗂️ Kanban/task management
💾 Persistent memory via Supabase
📱 Social media monitoring

---

## Quick Test Commands

Once you wake up, try these:
```
/portfolio
/quote NVDA
/market
"How's my portfolio doing?"
"What's the price of Tesla?"
```

---

## Your Portfolio Summary (as of Jan 26, 2026)

**Total Value: ~$1,306,000**

**Top 5 Holdings:**
1. NVDA (Nvidia): $144,067 - 11.0%
2. BA (Boeing): $108,067 - 8.3%
3. BTCI (Bitcoin ETF): $103,823 - 7.9%
4. GS (Goldman Sachs): $86,380 - 6.6%
5. FDRXX (Money Market): $90,229 - 6.9%

**Key Sectors:**
- Technology: ~35%
- Financials: ~20%
- Crypto/Bitcoin: ~15%
- Defense: ~10%
- Other: ~20%

Sleep well! Sparky's got the night shift. 🌙
