# HomestaCars Marketing System — Technical Reference

> Last updated: 2026-05-17  
> Status: Phase 3C complete — ready for n8n workflow integration

---

## Overview

The Marketing section is a fully self-contained AI-powered marketing department embedded inside the HC Admin dashboard. It manages content creation, competitor intelligence, ad campaigns, and performance analytics for HomestaCars (Istanbul, Turkey — 2 branches: Şişli and Kayaşehir).

Eight AI bots work as a team, each with a specific specialty. Humans (admins) review and approve their work before anything goes live.

---

## Architecture

```
src/
├── pages/marketing/          ← All marketing UI pages (13 pages)
│   ├── MarketingLayout.tsx   ← Shared sub-header with nav badges, search, notifications
│   ├── MarketingOverviewPage.tsx
│   ├── MarketingChatPage.tsx
│   ├── MarketingApprovalsPage.tsx
│   ├── MarketingConstitutionsPage.tsx
│   ├── MarketingCalendarPage.tsx
│   ├── MarketingSocialPostsPage.tsx
│   ├── MarketingBlogPostsPage.tsx
│   ├── MarketingDesignsPage.tsx
│   ├── MarketingCampaignsPage.tsx
│   ├── MarketingCompetitorsPage.tsx
│   ├── MarketingPerformancePage.tsx
│   ├── MarketingDecisionsPage.tsx
│   └── MarketingSettingsPage.tsx
├── types/marketing.ts        ← All TypeScript interfaces
├── hooks/useMarketing.ts     ← Shared React hooks (counts, stats)
└── lib/socialClient.ts       ← socialFrom() helper for social schema queries
```

---

## Pages

| Route | Page | Description |
|-------|------|-------------|
| `/dashboard/marketing` | Overview | Dashboard with live stats, bot status, quick actions |
| `/dashboard/marketing/chat` | CMO Chat | Real-time conversation with CMO bot |
| `/dashboard/marketing/constitutions` | Constitutions | 9 bot constitutions (brand rules + personas) |
| `/dashboard/marketing/approvals` | Approvals | Review queue — approve/reject/edit bot submissions |
| `/dashboard/marketing/calendar` | Content Calendar | Month/week view of scheduled posts and blog articles |
| `/dashboard/marketing/social-posts` | Social Posts | All social content — grid/list, 3-language captions |
| `/dashboard/marketing/blog-posts` | Blog Posts | Long-form articles with AEO scoring and SEO panel |
| `/dashboard/marketing/designs` | Designs | Visual assets — upload, approve, manage in Storage |
| `/dashboard/marketing/campaigns` | Ad Campaigns | Bot-proposed campaigns with approval workflow |
| `/dashboard/marketing/competitors` | Competitors | 4-tab competitor intelligence dashboard |
| `/dashboard/marketing/performance` | Performance | KPI charts, heatmaps, and analysis reports |
| `/dashboard/marketing/decisions` | Decisions Log | Timeline + table audit trail of all system decisions |
| `/dashboard/marketing/settings` | Settings | Bot management, API keys, integrations, data tools |

---

## Database Schema (Supabase — `social` schema)

### Core tables

| Table | Description |
|-------|-------------|
| `sm_chat_with_cmo` | CMO ↔ Admin conversation messages |
| `sm_approvals_queue` | All items requiring admin approval |
| `sm_constitutions` | Bot constitution documents (file_url or content) |
| `sm_decisions_log` | Audit log of all significant decisions |
| `sm_coordinator_tasks` | Tasks assigned by coordinator to other bots |

### Content tables

| Table | Description |
|-------|-------------|
| `sm_content_social` | Social media posts (Instagram, TikTok, Facebook, YouTube) |
| `sm_content_blog` | Blog articles (AR/TR/EN content + SEO fields) |
| `sm_designs` | Design assets with Supabase Storage URLs |

### Campaign tables

| Table | Description |
|-------|-------------|
| `sm_ad_campaigns` | Proposed and running ad campaigns |
| `sm_ad_performance` | Daily performance metrics per campaign |

### Competitor intelligence tables

| Table | Description |
|-------|-------------|
| `sm_competitors` | Competitor companies with threat levels |
| `sm_competitor_pricing` | Daily price snapshots per competitor |
| `sm_competitor_posts` | Tracked competitor social posts with analysis |
| `sm_competitor_reports` | Quarterly/monthly competitive analysis reports |

### Analytics tables

| Table | Description |
|-------|-------------|
| `sm_performance_analysis` | Bot-generated marketing performance reports |

### System tables (pending SQL — see Settings page)

| Table | Description |
|-------|-------------|
| `sm_notifications` | In-app notifications (bell icon) |
| `sm_bot_status` | Live status of each bot (for n8n heartbeats) |

#### SQL to create pending tables

```sql
-- Run in Supabase Dashboard → SQL Editor

CREATE TABLE IF NOT EXISTS social.sm_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT,
  severity TEXT DEFAULT 'info'
    CHECK (severity IN ('info', 'success', 'warning', 'error')),
  link TEXT,
  related_entity_type TEXT,
  related_entity_id UUID,
  is_read BOOLEAN DEFAULT false,
  user_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_notifications_unread ON social.sm_notifications(is_read) WHERE is_read = false;
CREATE INDEX idx_notifications_created ON social.sm_notifications(created_at DESC);

CREATE TABLE IF NOT EXISTS social.sm_bot_status (
  bot_name TEXT PRIMARY KEY,
  status TEXT DEFAULT 'idle'
    CHECK (status IN ('idle', 'active', 'working', 'error', 'disabled')),
  last_heartbeat TIMESTAMPTZ,
  current_task_id UUID,
  error_message TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO social.sm_bot_status (bot_name, status) VALUES
  ('cmo', 'idle'),
  ('coordinator', 'idle'),
  ('brand_guardian', 'idle'),
  ('content_writer', 'idle'),
  ('designer', 'idle'),
  ('competitor_monitor', 'idle'),
  ('performance_analyst', 'idle'),
  ('ads_manager', 'idle')
ON CONFLICT (bot_name) DO NOTHING;
```

---

## Storage Buckets

| Bucket | Purpose | Used By |
|--------|---------|---------|
| `designs` | Visual design assets | MarketingDesignsPage — upload/display |

### File naming convention
```
designs/{design_type}/{uuid}_{timestamp}.{ext}
```

---

## The 8 Bots

| Bot Key | Name | Role | Color |
|---------|------|------|-------|
| `cmo` | CMO | Marketing Manager | #4ba6ea |
| `coordinator` | Coordinator | Task Coordinator | #8b5cf6 |
| `brand_guardian` | Brand Guardian | Brand & Voice | #ec4899 |
| `content_writer` | Content Writer | Copywriting | #f59e0b |
| `designer` | Designer | Visual Design | #10b981 |
| `competitor_monitor` | Competitor Monitor | Market Intelligence | #ef4444 |
| `performance_analyst` | Performance Analyst | Analytics & KPIs | #06b6d4 |
| `ads_manager` | Ads Manager | Paid Campaigns | #f97316 |

### Constitutions

Each bot has a constitution document (rules for behavior). There is also a `general` constitution read by all bots. Total: 9 constitutions.

Constitutions are stored in `sm_constitutions` and viewable/editable at `/dashboard/marketing/constitutions`.

---

## Real-time Subscriptions

The following pages subscribe to Supabase Realtime for live updates:

| Page | Table | Events |
|------|-------|--------|
| Overview | `sm_approvals_queue` | INSERT |
| Overview | `sm_chat_with_cmo` | INSERT |
| Chat | `sm_chat_with_cmo` | INSERT |
| Approvals | `sm_approvals_queue` | INSERT, UPDATE |
| Social Posts | `sm_content_social` | INSERT, UPDATE |
| Calendar | `sm_content_social` | INSERT, UPDATE |
| Calendar | `sm_content_blog` | INSERT, UPDATE |
| Designs | `sm_designs` | INSERT, UPDATE |
| Decisions Log | `sm_decisions_log` | INSERT |
| Layout (bell) | `sm_notifications` | INSERT |

---

## Approval Workflow

The central workflow connecting all bots to the admin:

1. Any bot creates content or proposes a campaign
2. Bot inserts into `sm_approvals_queue` with `status = 'pending'`
3. Admin receives notification (bell + Overview badge)
4. Admin reviews in `/dashboard/marketing/approvals`
5. Admin approves → status updated, linked item status updated, decision logged
6. Admin rejects → reason stored, bot notified (via n8n in next phase)

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `⌘K` / `Ctrl+K` | Open global search |
| `?` | Open keyboard shortcuts modal |
| `Esc` | Close any modal |
| `G` then `O` | Go to Overview |
| `G` then `C` | Go to CMO Chat |
| `G` then `A` | Go to Approvals |
| `G` then `S` | Go to Social Posts |
| `G` then `B` | Go to Blog Posts |
| `G` then `P` | Go to Performance |

---

## How to Seed Test Data

Each page has a "Load test data" button that inserts realistic seed data into the database. 

**Safe to run multiple times?** No — check if data exists first; buttons skip seeding if data already present.

**Seed data coverage:**
- Social Posts: 8 posts across all platforms and statuses
- Blog Posts: 3 articles (published, draft, pending)
- Designs: 7 design assets
- Competitors: 5 companies (Sixt, Otokoç, Garenta, Yes! Yes!, Smarty) + posts + pricing + reports
- Ad Campaigns: 6 campaigns across all statuses + daily performance data
- Performance: 2 analysis reports (quarterly + monthly)
- Decisions: 13 entries spread across Today / Yesterday / This Week / Last Week / Older

---

## How to Add a New Bot

1. Add to `MARKETING_BOTS` array in `src/types/marketing.ts`
2. Add to `CONSTITUTION_DEFS` array in the same file
3. Add a row to `social.sm_bot_status` in Supabase
4. Build the n8n workflow for the bot
5. The bot will appear automatically in: Overview team status, Settings bot management, Approvals (bot_who_created field)

---

## How to Add a New Marketing Page

1. Create `src/pages/marketing/MarketingXxxPage.tsx`
2. Add the route in `src/App.tsx` inside the `<Route path="marketing">` block
3. Add a nav item in `src/components/Sidebar.tsx` → `marketingItems` array
4. Add the page info in `src/types/marketing.ts` → `MARKETING_PAGES` record
5. The breadcrumb in `MarketingLayout` will pick it up automatically

---

## n8n Integration Plan (Next Phase)

### Webhook endpoints to build

```
POST /api/marketing/bot-message
  → Receives message from a bot
  → Writes to sm_chat_with_cmo or sm_coordinator_tasks
  → Creates sm_notifications entry

POST /api/marketing/bot-action  
  → Receives completed action from a bot
  → Updates relevant table (sm_content_social, sm_ad_campaigns, etc.)
  → Creates sm_approvals_queue entry if review needed
  → Creates sm_decisions_log entry

POST /api/marketing/bot-heartbeat
  → Updates sm_bot_status.last_heartbeat and status
  → Called every 60s by each active bot
```

### Implementation approach
- Use Supabase Edge Functions (Deno) as the webhook receiver
- Edge Functions validate the request and write directly to the database
- The React app sees changes instantly via Realtime subscriptions
- No need for a separate backend server

### Bot trigger pattern (n8n side)
```
Trigger (schedule / webhook) 
  → Read context from Supabase (constitutions, recent decisions, current tasks)
  → Call Claude API with constitution + context
  → Write result back via webhook endpoint
  → Wait for human approval (poll sm_approvals_queue)
  → Execute approved action
  → Log decision
```

---

## Known Issues & TODOs

- `sm_notifications` and `sm_bot_status` tables need to be created (SQL in Settings page)
- The notification bell gracefully handles missing table (no crashes)
- Blog posts table may need `sm_content_blog` — confirm in Supabase
- Designs bucket must be public: Supabase Dashboard → Storage → `designs` → Public
- MarketingLayout GlobalSearch queries `sm_ad_campaigns` but table may be named `sm_ad_campaigns` — verify exact name
- Performance Analytics uses generated (static) data for charts — wire to real bookings data once n8n is live
- Bot status in Overview (Team Status) is static — will use `sm_bot_status` once n8n heartbeats are running

---

## File Count Summary

| Category | Files |
|----------|-------|
| Marketing pages | 14 |
| Shared types | 1 (`src/types/marketing.ts`) |
| Shared hooks | 1 (`src/hooks/useMarketing.ts`) |
| Shared lib | 1 (`src/lib/socialClient.ts`) |
| **Total** | **17** |

---

*This document is the source of truth for the marketing system. Update it when adding new pages, tables, or bots.*
