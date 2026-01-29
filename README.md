# SparkyBot 🤖

**Personal Executive Assistant powered by Gemini + Claude Code**

SparkyBot (persona: Sparky Dempsey) is an intelligent personal assistant that operates through Telegram with a private web interface. It handles tasks autonomously without requiring explicit commands, learning and adapting to your preferences over time.

## Features

- 📅 **Calendar Management** - Google Calendar integration with smart scheduling
- 📧 **Email Management** - Gmail reading, summarization, and drafting
- 📈 **Market Intelligence** - Stock & crypto analysis with portfolio tracking
- 💻 **Code Execution** - Remote coding via Claude Code
- 📱 **Social Media** - X and Facebook monitoring and posting
- 📋 **Project Management** - Kanban board with GitHub issues sync
- 🧠 **Self-Improvement** - Overnight analysis with optimization suggestions

## Personality

Sparky Dempsey is:
- Smart, witty, and factual
- A fan of dad jokes and market puns
- Emotionally aware and adaptive
- Casual but thorough in communications

## Tech Stack

- **Hosting**: Railway
- **Database**: Supabase
- **Storage**: Cloudflare R2
- **Scheduled Tasks**: Cloudflare Workers
- **AI**: Gemini 2.0 Flash + Claude Code CLI
- **Languages**: TypeScript / Python

## Getting Started

```bash
npm install
npm run dev
```

Then message @SparkyDbot on Telegram!

See [CLAUDE.md](./CLAUDE.md) for development instructions.

## Project Structure

```
sparkybot/
├── src/
│   ├── core/           # Router, intent classifier, shared utils
│   ├── skills/         # Modular capabilities
│   ├── interfaces/     # Telegram, Web UI
│   └── services/       # External API integrations
├── config/             # Environment configs
├── tests/              # Test suites
└── docs/               # Documentation
```

## License

Private - All rights reserved

---

*"Why did the market analyst bring a ladder? To check the high points!"* - Sparky Dempsey
