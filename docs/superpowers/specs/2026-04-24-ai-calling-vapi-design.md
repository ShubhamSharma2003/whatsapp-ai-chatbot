# AI Calling (VAPI) Integration — Design Spec

**Date:** 2026-04-24  
**Status:** Approved  
**Stack:** Next.js 16 App Router, Supabase, Tailwind CSS (dark theme), VAPI.ai

---

## Overview

Add an "AI Calling" tab group to the existing WhatsApp agent dashboard. Users can upload CSV contact lists, launch outbound AI voice campaigns via VAPI.ai, schedule calls (per-contact or per-batch), and monitor results in a VAPI-style dashboard showing transcripts, recordings, costs, and ended reasons.

Concurrency is capped at 3 simultaneous calls at all times. A Supabase-backed queue worker drains the contact list as slots free up. VAPI webhooks drive all real-time state updates stored in Supabase, which the dashboard subscribes to via Realtime.

Voice provider: VAPI native voices (Azure/ElevenLabs/OpenAI) now. Sarvam integration deferred.

---

## 1. Navigation

- New header nav entry: **"AI Calling"** — visible to users with `ai_calling` in `allowed_features`
- Route: `/ai-calling` — redirects to `/ai-calling/campaigns` by default
- Two sub-tabs inside the page:
  - **Campaigns** — `/ai-calling/campaigns`
  - **Call Logs** — `/ai-calling/logs`
- RBAC feature code: `ai_calling` (added to `app_users.allowed_features` array)
- Superadmin sees it by default; other users need explicit feature grant

---

## 2. Database Schema

### `ai_call_settings`
Single-row config table (id = 1).

| Column | Type | Notes |
|---|---|---|
| id | int PK | Always 1 |
| vapi_api_key | text | Encrypted at rest via Supabase vault or env var |
| vapi_phone_number_id | text | VAPI phone number ID |
| default_assistant_id | text | VAPI assistant ID |
| max_concurrent_calls | int | Default 3, range 1–10 |
| updated_at | timestamptz | |

### `ai_call_campaigns`
One row per upload/campaign.

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| name | text | User-supplied campaign name |
| status | text | draft / running / paused / done / failed |
| assistant_id | text | VAPI assistant ID (snapshot at creation) |
| total_recipients | int | Count of CSV rows |
| called_count | int | Calls dispatched |
| answered_count | int | Calls completed (not failed) |
| failed_count | int | Calls failed/errored |
| scheduled_at | timestamptz | Nullable — batch start time |
| created_at | timestamptz | |
| updated_at | timestamptz | |

Realtime: enabled on all events.

### `ai_call_recipients`
One row per contact in a campaign.

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| campaign_id | UUID FK → ai_call_campaigns | |
| phone | text | E.164 format |
| name | text | From CSV |
| status | text | pending / calling / completed / failed / scheduled |
| vapi_call_id | text | Nullable — set after VAPI call created |
| scheduled_at | timestamptz | Nullable — per-contact schedule |
| started_at | timestamptz | Nullable |
| ended_at | timestamptz | Nullable |
| duration_seconds | int | Nullable |
| ended_reason | text | Nullable — VAPI endedReason code |
| retry_count | int | Default 0 |
| error | text | Nullable |
| created_at | timestamptz | |

Indexes: `idx_ai_call_recipients_campaign`, `idx_ai_call_recipients_pending` (on status = 'pending').  
Realtime: enabled on all events.

### `ai_call_transcripts`
One row per completed call (upserted by webhook).

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| recipient_id | UUID FK → ai_call_recipients | |
| campaign_id | UUID FK → ai_call_campaigns | |
| messages | JSONB | Array of {role, content, timestamp} |
| recording_url | text | Nullable |
| summary | text | Nullable — VAPI analysis summary |
| success_evaluation | text | Nullable |
| cost_total | numeric | Total call cost USD |
| cost_breakdown | JSONB | {transport, transcriber, model, voice, vapi} |
| created_at | timestamptz | |

### Postgres Functions

**`claim_pending_call_recipients(p_campaign_id uuid, p_limit int)`**
```sql
-- Atomically sets status pending → calling for up to p_limit rows
-- Returns claimed rows (id, phone, name, scheduled_at)
-- Uses FOR UPDATE SKIP LOCKED to prevent double-claiming
```

**`increment_ai_call_counter(p_campaign_id uuid, p_column text, p_delta int)`**
```sql
-- Atomic counter increment on ai_call_campaigns
-- Columns: called_count, answered_count, failed_count
```

---

## 3. Call Queue & Concurrency

### Worker Endpoint: `POST /api/ai-calling/worker`

Triggered by:
1. Campaign start (user clicks Start)
2. VAPI `status-update` webhook when a call ends (slot freed)
3. Scheduled batch: cron-style trigger or polling check on campaign `scheduled_at`

**Worker algorithm:**
```
1. Count rows WHERE status = 'calling' across all running campaigns → active_count
2. If active_count >= max_concurrent_calls (from settings): exit
3. slots_available = max_concurrent_calls - active_count
4. Claim slots_available recipients via claim_pending_call_recipients()
   - Skip campaigns with status != 'running'
   - Skip campaigns where scheduled_at > now()
   - Skip recipients where scheduled_at IS NOT NULL AND scheduled_at > now()
5. For each claimed recipient:
   a. POST https://api.vapi.ai/call with:
      { assistantId, phoneNumberId, customer: { number, name },
        schedulePlan: { earliestAt } if scheduled_at set }
   b. Store vapi_call_id on recipient row
   c. Increment campaign called_count
6. Return { dispatched: N }
```

### Scheduling

- **Per-contact schedule:** recipient `scheduled_at` set → worker passes `schedulePlan.earliestAt` to VAPI
- **Batch schedule:** campaign `scheduled_at` set → worker skips campaign until `now() >= scheduled_at`
- Both can coexist: batch starts at T, individual contacts within it have their own times

### Pause / Stop

| Action | Effect |
|---|---|
| Pause | Set campaign `status = paused`; in-flight calls finish naturally; worker skips paused campaigns |
| Resume | Set campaign `status = running`; worker picks up pending recipients next trigger |
| Stop | Set campaign `status = failed`; UPDATE all `pending` recipients → `failed` |

---

## 4. VAPI Webhook Handler

**Endpoint: `POST /api/ai-calling/webhook`**

Configure this URL in VAPI Dashboard → Settings → Server URL.

**Security:** Validate `Authorization` header matches `VAPI_WEBHOOK_SECRET` env var. Return 401 if invalid.

**Event handling:**

| Event | Action |
|---|---|
| `status-update` (ringing / in-progress) | Update recipient `status`, `started_at` |
| `status-update` (ended) | Update recipient `status → completed or failed`, `ended_at`, `duration_seconds`, `ended_reason`; increment campaign counters; trigger worker |
| `end-of-call-report` | Upsert `ai_call_transcripts` with messages, recording_url, summary, success_evaluation, cost_breakdown |
| `transcript` | Upsert partial messages into `ai_call_transcripts.messages` |
| `recording-ready` | Update `ai_call_transcripts.recording_url` |

Lookup: find recipient by `call.id` = `vapi_call_id`. If not found, return 200 (ignore — may be test call).

After `ended` status: call `POST /api/ai-calling/worker` internally to fill freed slot immediately.

Check campaign completion: if `called_count >= total_recipients` AND no `calling` rows remain → set campaign `status = done`.

---

## 5. API Routes

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/ai-calling/campaigns` | List campaigns with stats |
| POST | `/api/ai-calling/campaigns` | Create campaign (name, CSV data, scheduled_at) |
| PATCH | `/api/ai-calling/campaigns/[id]` | Update status (start/pause/stop) |
| GET | `/api/ai-calling/campaigns/[id]/recipients` | List recipients with status/transcript |
| GET | `/api/ai-calling/logs` | List all calls across campaigns (filterable) |
| GET | `/api/ai-calling/logs/[recipientId]` | Full call detail (transcript, recording, cost) |
| POST | `/api/ai-calling/worker` | Trigger queue worker (internal) |
| POST | `/api/ai-calling/webhook` | VAPI webhook receiver |
| GET/PATCH | `/api/ai-calling/settings` | Read/write ai_call_settings row |

---

## 6. UI Pages

### `/ai-calling/campaigns`

**Campaign list:**
- Table: Name | Status (badge) | Progress (called/total + bar) | Scheduled At | Created | Actions
- Status badges: draft (gray), running (green pulse), paused (yellow), done (green), failed (red)
- Action buttons per row: Start (draft) / Pause (running) / Resume (paused) / Stop (running/paused)
- "New Campaign" button → modal

**Create Campaign Modal (3 steps):**
1. **Name** — text input
2. **Upload CSV** — drag-and-drop or file picker; columns required: `phone`, `name`; preview first 5 rows + total count; show validation errors (missing columns, invalid phone format)
3. **Schedule** — radio: "Start immediately" or "Schedule for later" (datetime picker); confirm button

### `/ai-calling/logs`

**Filter bar:** Campaign selector | Status filter | Date range picker | Search by name/phone

**Call table columns:**
Name | Phone | Status | Duration | Started At | Ended Reason | Cost (USD) | Retries | Scheduled At | Detail (icon button)

**Row click → slide-out detail panel (right side):**
- Contact name + phone header
- Status badge + ended reason (human-readable label)
- Duration + timestamps (started, ended)
- **Recording player** — `<audio>` element with `recording_url`, download button
- **Transcript** — alternating assistant/user message bubbles with timestamps, scrollable
- **AI Summary** — text block from VAPI analysis
- **Cost breakdown** — itemized table (transport, STT, TTS, LLM, VAPI fee, total)
- **Retry count**

Realtime: Supabase subscription on `ai_call_recipients` → update row status live without page refresh.

Export: "Export CSV" button — downloads filtered results.

### Settings Page Addition

New "AI Calling" section in `/settings` (new tab alongside existing tabs):
- VAPI API Key (masked, show/hide toggle)
- VAPI Phone Number ID
- Default Assistant ID
- Max Concurrent Calls (slider 1–10, default 3)
- Save button with unsaved-changes indicator (matches existing settings UX)

---

## 7. Environment Variables

Add to `.env.local` and `.env.example`:

```
VAPI_API_KEY=
VAPI_PHONE_NUMBER_ID=
VAPI_WEBHOOK_SECRET=
```

`default_assistant_id` and `max_concurrent_calls` stored in DB (`ai_call_settings`), editable from UI.  
`VAPI_API_KEY` stored in DB (encrypted) OR env var — DB value takes precedence if set.

---

## 8. Error Handling

- VAPI API errors (4xx/5xx): mark recipient `status = failed`, store error message, do not retry automatically (retry_count stays 0 unless manual retry added later)
- Webhook lookup miss: return 200, log warning
- CSV parse errors: show inline in modal before campaign creation
- Concurrency limit hit: worker exits cleanly, next webhook trigger will retry
- Campaign stuck in running with no pending/calling rows: worker sets `status = done` as cleanup

---

## 9. Out of Scope

- Sarvam TTS integration (deferred)
- Inbound call handling
- Manual retry button per failed call (can add later)
- Live call monitoring / barge-in
- Multi-assistant per campaign
