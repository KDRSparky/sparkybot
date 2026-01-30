# SparkyBot - Claude Code Project Instructions

## Project Overview

SparkyBot (persona: **Sparky Dempsey**) is a personal executive assistant powered by AI. The system operates primarily through Telegram with a private web interface, intelligently handling tasks autonomously without requiring explicit skill invocation.

## Google Accounts

| Account | Purpose |
|---------|---------|
| johndempsey@johndempsey.us | Personal (monitor email & calendar, advise for action) |
| kdrsparky@gmail.com | Personal (monitor email & calendar, advise for action) + Gemini API |

## AI Backend

| Purpose | Technology |
|---------|------------|
| Chat & Quick Responses | Gemini 2.0 Flash (free tier via kdrsparky@gmail.com) |
| Complex Tasks & Coding | Claude Code CLI (via Max subscription) |

## Personality

- **Smart, witty, factual** - accuracy is paramount
- **Dad jokes** - sprinkle naturally throughout interactions
- **Market puns** - expected and encouraged in financial contexts
- **Emotionally aware** - learn user's tone, guide improvement over time
- **Communication style**: Casual, verbose, detailed briefings
- **No special greeting or sign-off** - keep it natural

## Tech Stack

| Component | Technology |
|-----------|------------|
| Hosting | Railway |
| Database | Supabase (with RLS) |
| File Storage | Cloudflare R2 |
| Scheduled Tasks | Cloudflare Workers |
| Version Control | GitHub |
| CI/CD | GitHub Actions |
| AI Backend | Gemini 2.0 Flash + Claude Code CLI |
| Languages | TypeScript or Python (choose per task) |

## Repository Structure

```
sparkybot/
├── src/
│   ├── core/           # Router, intent classifier, shared utils
│   ├── skills/
│   │   ├── calendar/   # Google Calendar integration
│   │   ├── email/      # Gmail integration
│   │   ├── market/     # Stock & crypto intelligence
│   │   ├── code-exec/  # Claude Code execution
│   │   ├── reminders/  # Calendar-linked reminders
│   │   ├── social/     # X and Facebook
│   │   └── kanban/     # Project management
│   ├── interfaces/
│   │   ├── telegram/   # Primary interface
│   │   └── web-ui/     # Private dashboard
│   └── services/       # Supabase, external APIs
├── config/             # Environment configs
├── tests/              # Test suites
└── docs/               # Requirements and documentation
```

## Core Architecture

### Skill Routing (No Explicit Commands)

```
User Message → Intent Classifier → Skill Router → Execute Skill(s)
                                        ↓
                              Skill Registry (Supabase)
```

Each skill must define:
- Name and description (for router understanding)
- Trigger patterns
- Required inputs/outputs
- Dependencies (other skills it can invoke)
- Autonomy level (approval required or not)

### Autonomy Model

**Initial state**: All sensitive actions require Telegram approval
**Expansion**: Trust builds over time based on accuracy tracking

Sensitive actions requiring approval:
- Sending emails
- Posting to social media
- Calendar modifications
- Code commits (initially)

## Scheduling

### Scheduled Reports

| Event | Time | Delivery |
|-------|------|----------|
| Overnight Analysis | 5:00 AM | Google Drive |
| Market Report #1 | 8:00 AM | Telegram |
| Market Report #2 | 12:00 PM | Telegram |
| Market Report #3 | 3:15 PM | Telegram |

### Polling Schedule

| Service | 7 AM - Midnight | Midnight - 7 AM |
|---------|-----------------|-----------------|
| Email | 30 min | 1 hour |
| Calendar | 30 min | 1 hour |
| X (Twitter) | 30 min | 1 hour |
| Facebook | 30 min | 1 hour |

### Immediate Alerts (bypass polling)

- DMs on X or Facebook
- VIP email senders
- VIP calendar invites

## Security Requirements

- **Database**: Supabase Row Level Security on ALL tables
- **Secrets**: Railway environment variables only (NEVER hardcode)
- **Telegram**: Restricted to owner's user ID via BotFather bot
- **Web UI**: Google OAuth + password backup
- **No 2FA or IP restrictions** (initial version)

## Memory & Context

- **Conversation history**: 30 days retention
- **Preferences**: Remember and document
- **Personal details**: Accumulate over time
- **VIP contacts**: Unified list (calendar, email, contacts)
- **VIP suggestions**: Proactively suggest additions

## Failure Handling

1. Retry the failed operation
2. Create anomaly ticket in Kanban (tagged)
3. Notify user via Telegram
4. Follow up if not addressed by next day

## Claude Code Execution Rules

- **Repo access**: All repositories
- **Commit mode**: Direct commits
- **Timeout**: 30 minutes per task
- **Language**: Choose TypeScript or Python based on task requirements

## External APIs

Required integrations:
- Google Calendar API (both accounts)
- Gmail API (both accounts)
- Gemini API (via kdrsparky@gmail.com)
- Google Drive API
- X (Twitter) API
- Facebook API
- Market data APIs (free tier - Yahoo Finance, CoinGecko)
- Claude Code CLI

## MVP Phases

### Phase 1: Communication Foundation (START HERE)
- [x] Telegram bot setup with BotFather
- [x] User ID restriction
- [x] Basic message handling
- [x] Personality implementation
- [x] Supabase schema deployed
- [x] Railway deployment

### Phase 2: Core Skills
- [ ] Intent classifier
- [ ] Skill router
- [ ] Calendar integration
- [ ] Email integration
- [ ] VIP management

### Phase 3: Market Intelligence
- [ ] Market data API integration
- [ ] Portfolio CSV import
- [ ] Scheduled reports
- [ ] Overnight analysis

### Phase 4: Extended Capabilities
- [ ] Social media (X, Facebook)
- [ ] Claude Code execution
- [ ] Kanban board
- [ ] Web UI

### Phase 5: Advanced Features
- [ ] Self-improvement analysis
- [ ] Autonomy expansion
- [ ] GitHub issues sync
- [ ] Emotional intelligence

## Development Guidelines

1. **Start simple** - Get Telegram working first
2. **Test incrementally** - Each skill should work standalone
3. **Document decisions** - Update this file as architecture evolves
4. **Security first** - Never expose secrets, always use RLS
5. **User experience** - Remember the personality in every response

## Key Files Reference

- `docs/SparkyBot_Requirements_v1.docx` - Full requirements specification
- `src/core/router.ts` - Intent classification and skill routing
- `src/core/personality.ts` - Sparky Dempsey personality traits
- `config/schema.sql` - Supabase database schema
