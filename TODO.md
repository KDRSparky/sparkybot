# SparkyBot Implementation Checklist

## Instructions for Ralph Wiggum
Go through this TODO.md step-by-step and check off every step once complete.
When you encounter a task marked **HARD STOP**, use AskUserQuestion to get confirmation before proceeding.
If blocked, output `<promise>BLOCKED</promise>` with an explanation.
When all tasks are complete, output `<promise>SPARKYBOT_COMPLETE</promise>`.

---

## Phase 1: Communication Foundation ✅ COMPLETE
- [x] 1.1 Telegram bot setup with BotFather
- [x] 1.2 User ID restriction (security)
- [x] 1.3 Basic message handling
- [x] 1.4 Personality implementation (Sparky Dempsey)
- [x] 1.5 Railway deployment (24/7)
- [x] 1.6 Supabase schema deployed

---

## Phase 2: Infrastructure Integration

### 2.1 Connect Bot to Supabase ✅ COMPLETE
> **Dependency**: Supabase project exists (DONE)
> **Success Criteria**: Bot can read/write to Supabase tables

- [x] 2.1.1 Verify SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in Railway environment variables
- [x] 2.1.2 Update `src/services/supabase.ts` to use real credentials (not placeholder)
- [x] 2.1.3 Test connection: Insert a test row into `conversations` table
- [x] 2.1.4 Test connection: Query the test row back
- [x] 2.1.5 Remove test row after verification
- [x] 2.1.6 **HARD STOP** - Verify Supabase connection works in production (Railway logs) ✅ CONFIRMED

### 2.2 Conversation Memory ✅ COMPLETE
> **Dependency**: 2.1 complete
> **Success Criteria**: Bot remembers conversation history within 30-day window

- [x] 2.2.1 Implement `saveMessage()` in `src/core/memory.ts` to store user/assistant messages
- [x] 2.2.2 Implement `getConversationHistory()` to retrieve recent messages for context
- [x] 2.2.3 Update main bot handler to save all messages to Supabase
- [x] 2.2.4 Update Gemini prompt to include conversation history for context
- [x] 2.2.5 Test: Send multiple messages and verify context is maintained (user to verify)
- [x] 2.2.6 Implement 30-day cleanup (SQL script created: config/cleanup-cron.sql)

### 2.3 Deploy Cloudflare Worker for Scheduled Tasks ✅ COMPLETE
> **Dependency**: None (code exists in `workers/scheduler.ts`)
> **Success Criteria**: Worker deployed, can trigger bot via webhook

- [x] 2.3.1 Install Wrangler CLI: `npm install -g wrangler`
- [x] 2.3.2 Login to Cloudflare: `wrangler login`
- [x] 2.3.3 Update `workers/wrangler.toml` with correct account_id
- [x] 2.3.4 Set worker secrets: `wrangler secret put BOT_WEBHOOK_URL`
- [x] 2.3.5 Deploy worker: `cd workers && wrangler deploy`
- [x] 2.3.6 Verify worker is running in Cloudflare dashboard
- [x] 2.3.7 **HARD STOP** - Test manual trigger of worker and verify bot receives webhook ✅ CONFIRMED

---

## Phase 3: Core Skills Framework

### 3.1 Intent Classifier ✅ COMPLETE
> **Dependency**: 2.2 complete (needs conversation context)
> **Success Criteria**: Bot correctly routes messages to appropriate skills

- [x] 3.1.1 Define intent categories in `src/core/router.ts`:
  - `market` (stocks, portfolio, crypto)
  - `calendar` (schedule, meetings, events)
  - `email` (inbox, send, reply)
  - `reminder` (remind me, don't forget)
  - `social` (tweet, post, twitter, facebook)
  - `kanban` (task, todo, project)
  - `code` (code, deploy, commit)
  - `general` (everything else)
- [x] 3.1.2 Implement intent classification using Gemini (prompt engineering)
- [x] 3.1.3 Create skill registry in Supabase `skills` table (seed data exists)
- [x] 3.1.4 Implement `routeToSkill()` function that maps intent to skill handler
- [x] 3.1.5 Test with 10+ example messages covering all intent categories (91% accuracy)
- [x] 3.1.6 Log skill routing decisions to `autonomy_log` table

### 3.2 Skill Base Class ✅ COMPLETE
> **Dependency**: 3.1 complete
> **Success Criteria**: All skills follow consistent interface

- [x] 3.2.1 Create `src/core/skills.ts` with abstract Skill class:
  - `name: string`
  - `description: string`
  - `triggerPatterns: string[]`
  - `autonomyLevel: 'full' | 'approval_required'`
  - `execute(input: SkillInput): Promise<SkillOutput>`
  - `requiresApproval(action: string): boolean`
- [ ] 3.2.2 Update all existing skill files to extend base class
- [ ] 3.2.3 Implement skill discovery (auto-register skills from `src/skills/*/index.ts`)

---

## Phase 4: Google Integration

### 4.1 Google Cloud Project Setup
> **Dependency**: None
> **Success Criteria**: OAuth credentials ready for Calendar and Gmail

- [ ] 4.1.1 **HARD STOP** - User must create Google Cloud project at console.cloud.google.com
- [ ] 4.1.2 Enable Google Calendar API
- [ ] 4.1.3 Enable Gmail API
- [ ] 4.1.4 Enable Google Drive API
- [ ] 4.1.5 Create OAuth 2.0 credentials (Desktop app type)
- [ ] 4.1.6 Download credentials JSON
- [ ] 4.1.7 Add credentials to Railway environment variables:
  - `GOOGLE_CLIENT_ID`
  - `GOOGLE_CLIENT_SECRET`
  - `GOOGLE_REDIRECT_URI`
- [ ] 4.1.8 **HARD STOP** - User must authorize both Google accounts (johndempsey@johndempsey.us, kdrsparky@gmail.com)

### 4.2 Calendar Skill
> **Dependency**: 4.1 complete
> **Success Criteria**: Bot can read/create calendar events

- [ ] 4.2.1 Implement Google OAuth token refresh in `src/services/google-auth.ts`
- [ ] 4.2.2 Store refresh tokens securely in Supabase `preferences` table
- [ ] 4.2.3 Implement `getUpcomingEvents(days: number)` in `src/skills/calendar/index.ts`
- [ ] 4.2.4 Implement `createEvent(title, start, end, attendees?)` 
- [ ] 4.2.5 Implement `findFreeSlots(duration, dateRange)`
- [ ] 4.2.6 Add approval flow for calendar modifications (uses `approval_queue` table)
- [ ] 4.2.7 Test: "What's on my calendar today?"
- [ ] 4.2.8 Test: "Schedule a meeting with John tomorrow at 2pm" (should request approval)

### 4.3 Email Skill
> **Dependency**: 4.1 complete
> **Success Criteria**: Bot can read emails and draft responses

- [ ] 4.3.1 Implement `getUnreadEmails(maxResults)` in `src/skills/email/index.ts`
- [ ] 4.3.2 Implement `getEmailThread(threadId)`
- [ ] 4.3.3 Implement `draftReply(threadId, body)` (saves draft, doesn't send)
- [ ] 4.3.4 Implement `sendEmail(to, subject, body)` with approval flow
- [ ] 4.3.5 Implement VIP sender detection (cross-reference `vip_contacts` table)
- [ ] 4.3.6 Test: "Check my email"
- [ ] 4.3.7 Test: "Reply to the email from [VIP]" (should request approval)

### 4.4 VIP Contact Management
> **Dependency**: 4.2 and 4.3 complete
> **Success Criteria**: Bot recognizes VIPs and prioritizes their communications

- [ ] 4.4.1 Implement `addVIP(contact)` function
- [ ] 4.4.2 Implement `isVIP(email | phone | handle)` lookup
- [ ] 4.4.3 Implement `suggestVIP(contact, reason)` - bot suggests based on frequency
- [ ] 4.4.4 Create Telegram inline keyboard for VIP approval/rejection
- [ ] 4.4.5 Test: Add a VIP manually via chat
- [ ] 4.4.6 Test: Verify VIP emails are flagged in email summaries

---

## Phase 5: Market Intelligence Enhancement

### 5.1 Scheduled Market Reports
> **Dependency**: 2.3 complete (Cloudflare Worker)
> **Success Criteria**: Automatic reports at 8am, 12pm, 3:15pm CT

- [ ] 5.1.1 Create `generateMarketReport(type: 'morning' | 'midday' | 'afternoon')` function
- [ ] 5.1.2 Include portfolio performance, top movers, sector analysis
- [ ] 5.1.3 Store report in `market_reports` table
- [ ] 5.1.4 Configure Cloudflare Worker cron triggers:
  - `0 13 * * 1-5` (8am CT = 1pm UTC, weekdays)
  - `0 17 * * 1-5` (12pm CT = 5pm UTC, weekdays)
  - `15 20 * * 1-5` (3:15pm CT = 8:15pm UTC, weekdays)
- [ ] 5.1.5 Worker calls bot webhook to trigger report generation and delivery
- [ ] 5.1.6 Test: Manually trigger each report type

### 5.2 Overnight Analysis
> **Dependency**: 5.1 complete + Google Drive API
> **Success Criteria**: Comprehensive analysis saved to Drive at 5am

- [ ] 5.2.1 Create `generateOvernightAnalysis()` function with:
  - Previous day's performance summary
  - After-hours movers
  - Pre-market futures
  - News summary affecting holdings
  - Recommendations for the day
- [ ] 5.2.2 Implement Google Drive file upload
- [ ] 5.2.3 Save analysis as Google Doc in designated folder
- [ ] 5.2.4 Configure Cloudflare Worker cron: `0 10 * * 1-5` (5am CT = 10am UTC)
- [ ] 5.2.5 Store Drive file ID in `market_reports` table
- [ ] 5.2.6 Test: Generate and upload overnight analysis

### 5.3 Portfolio Snapshots
> **Dependency**: Market skill working
> **Success Criteria**: Daily portfolio value tracked for historical analysis

- [ ] 5.3.1 Implement `takePortfolioSnapshot()` function
- [ ] 5.3.2 Store in `portfolio_snapshots` table with:
  - Total value
  - Daily change ($ and %)
  - Full holdings JSON
- [ ] 5.3.3 Add to overnight analysis cron job
- [ ] 5.3.4 Implement `getPortfolioHistory(days)` for trend analysis
- [ ] 5.3.5 Test: "How has my portfolio performed this month?"

---

## Phase 6: Approval System

### 6.1 Telegram Approval Flow
> **Dependency**: Skill base class with autonomy levels
> **Success Criteria**: Sensitive actions wait for user approval via Telegram

- [ ] 6.1.1 Create `requestApproval(action, details)` function that:
  - Inserts record into `approval_queue` table
  - Sends Telegram message with inline keyboard (Approve/Reject/Modify)
  - Sets expiration (24 hours default)
- [ ] 6.1.2 Handle callback queries for approval buttons
- [ ] 6.1.3 Implement `executeApprovedAction(approvalId)` 
- [ ] 6.1.4 Implement `rejectAction(approvalId, reason)`
- [ ] 6.1.5 Implement `modifyAndApprove(approvalId, modifications)`
- [ ] 6.1.6 Auto-expire pending approvals after timeout
- [ ] 6.1.7 Test: Request to send email triggers approval flow
- [ ] 6.1.8 Test: Approve/reject/modify actions work correctly

---

## Phase 7: Social Media (X & Facebook)

### 7.1 X (Twitter) Integration
> **Dependency**: Approval system (6.1) complete
> **Success Criteria**: Bot can read DMs, post tweets with approval

- [ ] 7.1.1 **HARD STOP** - User must create X Developer account and app
- [ ] 7.1.2 Add X API credentials to Railway:
  - `X_API_KEY`
  - `X_API_SECRET`
  - `X_ACCESS_TOKEN`
  - `X_ACCESS_SECRET`
- [ ] 7.1.3 Implement `getXDMs()` for direct message monitoring
- [ ] 7.1.4 Implement `getXMentions()` for mention tracking
- [ ] 7.1.5 Implement `postTweet(text)` with approval flow
- [ ] 7.1.6 Implement `replyToTweet(tweetId, text)` with approval flow
- [ ] 7.1.7 Add X handles to VIP contact lookups
- [ ] 7.1.8 Configure polling in Cloudflare Worker (30 min daytime, 1 hour night)
- [ ] 7.1.9 Test: "Check my Twitter DMs"
- [ ] 7.1.10 Test: "Tweet about [topic]" (should request approval)

### 7.2 Facebook Integration
> **Dependency**: Approval system (6.1) complete
> **Success Criteria**: Bot can read messages, post with approval

- [ ] 7.2.1 **HARD STOP** - User must create Facebook Developer app
- [ ] 7.2.2 Add Facebook API credentials to Railway
- [ ] 7.2.3 Implement `getFBMessages()` for Messenger monitoring
- [ ] 7.2.4 Implement `getFBNotifications()`
- [ ] 7.2.5 Implement `postToFB(text, image?)` with approval flow
- [ ] 7.2.6 Add Facebook IDs to VIP contact lookups
- [ ] 7.2.7 Configure polling schedule
- [ ] 7.2.8 Test: "Check my Facebook messages"

---

## Phase 8: Kanban & Project Management

### 8.1 Kanban Board
> **Dependency**: Supabase tables exist
> **Success Criteria**: Bot can manage tasks across projects

- [ ] 8.1.1 Implement `createTask(project, title, description, priority)`
- [ ] 8.1.2 Implement `moveTask(taskId, newStatus)`
- [ ] 8.1.3 Implement `getTasksByStatus(project, status)`
- [ ] 8.1.4 Implement `getTasksByProject(projectId)`
- [ ] 8.1.5 Implement natural language task creation: "Add task to do X for LifeWave project"
- [ ] 8.1.6 Test: Create, move, and list tasks

### 8.2 Anomaly Tracking
> **Dependency**: 8.1 complete
> **Success Criteria**: Failed operations auto-create anomaly tickets

- [ ] 8.2.1 Implement `createAnomalyTicket(error, context)` function
- [ ] 8.2.2 Tag anomaly tickets with `is_anomaly = true` and `anomaly_details` JSON
- [ ] 8.2.3 Integrate with failure handling in all skills
- [ ] 8.2.4 Implement daily anomaly review notification
- [ ] 8.2.5 Test: Force a failure and verify anomaly ticket is created

### 8.3 GitHub Issues Sync (Optional)
> **Dependency**: 8.1 complete
> **Success Criteria**: Kanban cards sync bidirectionally with GitHub Issues

- [ ] 8.3.1 Add GitHub PAT to Railway: `GITHUB_TOKEN`
- [ ] 8.3.2 Implement `syncToGitHub(taskId)` - creates/updates GitHub issue
- [ ] 8.3.3 Implement `syncFromGitHub(issueUrl)` - creates/updates kanban card
- [ ] 8.3.4 Store `github_issue_id` and `github_issue_url` in kanban_cards
- [ ] 8.3.5 Test: Create task, sync to GitHub, verify issue created

---

## Phase 9: Claude Code Execution

### 9.1 Claude Code CLI Integration
> **Dependency**: Approval system complete
> **Success Criteria**: Bot can delegate coding tasks to Claude Code

- [ ] 9.1.1 Verify Claude Code CLI is installed on Railway (or use API)
- [ ] 9.1.2 Implement `executeClaudeCode(task, repo, timeout)` function
- [ ] 9.1.3 All code execution requires approval (autonomy_level = 'approval_required')
- [ ] 9.1.4 Implement timeout handling (30 min max per task)
- [ ] 9.1.5 Log execution results to `autonomy_log`
- [ ] 9.1.6 Test: "Fix the bug in [repo] that causes [issue]"
- [ ] 9.1.7 **HARD STOP** - Review security implications before enabling in production

---

## Phase 10: Web UI Dashboard

### 10.1 Basic Dashboard
> **Dependency**: All core skills working
> **Success Criteria**: Private web interface for monitoring and control

- [ ] 10.1.1 Choose framework (Next.js recommended for Vercel deployment)
- [ ] 10.1.2 Implement Google OAuth authentication
- [ ] 10.1.3 Create dashboard layout with sections:
  - Conversation history
  - Pending approvals
  - Kanban board view
  - Portfolio overview
  - VIP contacts management
- [ ] 10.1.4 Connect to Supabase for real-time data
- [ ] 10.1.5 Deploy to Vercel or similar
- [ ] 10.1.6 **HARD STOP** - User must verify authentication works correctly

---

## Phase 11: Advanced Features

### 11.1 Autonomy Expansion
> **Dependency**: Approval system with sufficient history
> **Success Criteria**: Trust builds over time based on accuracy

- [ ] 11.1.1 Implement accuracy tracking per skill in `autonomy_log`
- [ ] 11.1.2 Calculate approval rate and success rate per action type
- [ ] 11.1.3 Implement `shouldRequireApproval(skill, action)` with dynamic thresholds
- [ ] 11.1.4 Create weekly autonomy report for user review
- [ ] 11.1.5 **HARD STOP** - User must approve autonomy expansion for any skill

### 11.2 Emotional Intelligence
> **Dependency**: Conversation memory working
> **Success Criteria**: Bot adapts tone based on user's emotional state

- [ ] 11.2.1 Implement sentiment analysis on user messages
- [ ] 11.2.2 Track emotional patterns over time in `personal_details`
- [ ] 11.2.3 Adjust response tone based on detected sentiment
- [ ] 11.2.4 Implement supportive responses for negative sentiment
- [ ] 11.2.5 Test: Verify tone adaptation in various emotional contexts

### 11.3 Self-Improvement Analysis
> **Dependency**: All skills with logging
> **Success Criteria**: Bot identifies areas for improvement

- [ ] 11.3.1 Implement weekly performance analysis
- [ ] 11.3.2 Identify frequently failed intents
- [ ] 11.3.3 Identify slow response patterns
- [ ] 11.3.4 Generate improvement suggestions
- [ ] 11.3.5 Present findings to user for feedback

---

## Completion
When all phases are complete, output: `<promise>SPARKYBOT_COMPLETE</promise>`

---

## Quick Reference: Dependencies Graph

```
Phase 1 (DONE) 
    ↓
Phase 2.1 (Supabase Connection)
    ↓
Phase 2.2 (Memory) ←────────────────┐
    ↓                                │
Phase 2.3 (Cloudflare Worker) ──────┤
    ↓                                │
Phase 3 (Skills Framework) ─────────┤
    ↓                                │
Phase 4.1 (Google Setup) ← HARD STOP│
    ↓                                │
Phase 4.2-4.4 (Calendar/Email/VIP) ─┤
    ↓                                │
Phase 5 (Market Reports) ───────────┤
    ↓                                │
Phase 6 (Approval System) ──────────┘
    ↓
Phase 7 (Social) ← HARD STOP (API setup)
    ↓
Phase 8 (Kanban)
    ↓
Phase 9 (Claude Code) ← HARD STOP (security review)
    ↓
Phase 10 (Web UI)
    ↓
Phase 11 (Advanced)
```

---

## Notes for Claude Code / Ralph Wiggum

1. **HARD STOP tasks require user input** - Don't proceed without explicit confirmation
2. **Test tasks** should actually run the test and verify output
3. **If blocked**, output `<promise>BLOCKED</promise>` with details
4. **Commit frequently** - After each major section completion
5. **Update this file** - Check off tasks as they're completed
