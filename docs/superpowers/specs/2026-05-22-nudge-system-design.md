# Nudge System Design

**Date:** 2026-05-22
**Status:** Draft — awaiting review
**Author:** Shubham (with Claude)

## 1. Problem

Leads receive our outbound message (campaign broadcast, IQ Setter welcome, direct-form welcome, website-trigger reply) and never respond. Today the system has no mechanism to follow up. Result: pipeline leaks at the silent-lead stage.

Goal: a configurable, WABA-compliant follow-up ("nudge") system that automatically re-engages silent leads via Meta-approved templates, with hard safety caps to protect deliverability and quality rating.

## 2. Goals

- Auto-detect leads that haven't replied within configurable window
- Send 1-2 follow-up messages using approved templates
- Configurable per source (campaign, IQ Setter, direct form, website)
- Configurable per lead type (e.g., hot vs cold)
- Hard-respect Meta WABA constraints (24h window, template categories, opt-out, frequency cap)
- Admin-tunable from dashboard without code change
- Skip automatically when human agent takes over or user opts out

## 3. Non-Goals

- Voice/AI calling follow-ups (separate `ai-calling` subsystem)
- LLM-generated nudge copy (templates are pre-approved by Meta — no dynamic body text outside `template_params`)
- Multi-tenant config (system is single-tenant today; nudge config follows same model)
- A/B testing of templates (future iteration)
- Cross-conversation campaigns (each conversation tracked independently)

## 4. WABA Constraints (Non-Negotiable)

These shape every design decision below.

| Constraint | Implication |
|------------|-------------|
| **24h Customer Service Window** | Free-form text only allowed within 24h of user's last inbound. Outside → approved template only. |
| **Template Categories** | UTILITY (transactional, lower cost, no marketing freq cap), MARKETING (promotional, hits Meta per-user marketing cap), AUTHENTICATION (OTP only). Nudges → UTILITY. |
| **Meta Marketing Frequency Cap** | Each user has rolling cap on MARKETING templates received across all businesses. Using MARKETING for nudges may silently fail to deliver. |
| **Quality Rating** | Bad signals (blocks, low read rate, complaints) drop GREEN → YELLOW → RED. RED throttles daily new-conversation limit. Pacing matters. |
| **Per-Conversation Pricing** | Meta charges per 24h conversation, categorized by first template. Multiple nudges inside same conversation = free. Outside = new paid conversation. |
| **Opt-out** | `STOP`, `UNSUBSCRIBE` etc. already detected in webhook → sets `conversations.opted_out=true`. Nudges must respect. |

**De-facto guidance baked into defaults:**
- Max 2 nudges per conversation per rule
- Min 24h gap between nudges
- Stop on opt-out, complaint, or human takeover

## 5. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│  WRITE PATH (existing, augmented)                            │
│                                                              │
│  outbound send   →  AFTER INSERT trigger on messages         │
│  (campaign, AI,     → update conversations.last_outbound_at  │
│   IQ Setter)                                                 │
│                                                              │
│  inbound webhook →  AFTER INSERT trigger on messages         │
│                    → update conversations.last_inbound_at    │
│                    → reset nudge_count if user replied       │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  SCHEDULER (new, runs every minute via pg_cron)              │
│                                                              │
│  POST /api/nudges/scheduler                                  │
│    → for each enabled nudge_rule:                            │
│        find conversations matching targeting filters         │
│        AND last_outbound_at < now() - delay_hours            │
│        AND last_inbound_at IS NULL OR < last_outbound_at     │
│        AND not opted_out, not nudges_disabled                │
│        AND nudge_count < rule.max_attempts                   │
│        AND no existing pending/sending job for this rule     │
│    → INSERT nudge_jobs row (status=pending, scheduled_for=now)│
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  SENDER WORKER (new, runs every minute via pg_cron)          │
│                                                              │
│  POST /api/nudges/worker                                     │
│    → claim_pending_nudge_jobs(batch=20) via SKIP LOCKED      │
│    → for each claimed job:                                   │
│        re-check skip conditions (race window)                │
│        compute 24h window status                             │
│        send template OR free-form fallback                   │
│        update job status, conversations.last_nudge_at,       │
│          conversations.nudge_count++                         │
│    → reclaim_stuck_sending() for rows stuck >120s            │
└─────────────────────────────────────────────────────────────┘
```

Two cron jobs, same pattern as existing `campaign-worker`. Scheduler decides *who* to nudge. Sender does *how* and *what*. Decoupling = scheduler stays cheap (set-based SQL); sender absorbs Meta API latency.

## 6. Data Model

### 6.1 Denormalized timestamps on `conversations`

```sql
ALTER TABLE conversations
  ADD COLUMN last_inbound_at  timestamptz,  -- last user message
  ADD COLUMN last_outbound_at timestamptz,  -- last assistant/template message
  ADD COLUMN nudge_count      int DEFAULT 0,
  ADD COLUMN last_nudge_at    timestamptz,
  ADD COLUMN nudges_disabled  boolean DEFAULT false;  -- per-convo kill switch

CREATE INDEX idx_conv_nudge_eligibility
  ON conversations(last_outbound_at)
  WHERE opted_out = false AND nudges_disabled = false;
```

**Why denormalize:** scheduler runs every minute. Joining `messages` for `max(created_at) WHERE role='user'` per conversation = O(messages) every tick. Triggers keep these fresh — single index scan instead.

### 6.2 Trigger to maintain denormalized timestamps

```sql
CREATE OR REPLACE FUNCTION update_conversation_msg_timestamps()
RETURNS trigger AS $$
BEGIN
  IF NEW.role = 'user' THEN
    UPDATE conversations
      SET last_inbound_at = NEW.created_at,
          nudge_count = 0,           -- user replied → reset
          last_nudge_at = NULL
      WHERE id = NEW.conversation_id;
  ELSIF NEW.role = 'assistant' THEN
    UPDATE conversations
      SET last_outbound_at = NEW.created_at
      WHERE id = NEW.conversation_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_msg_update_conv_timestamps
  AFTER INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION update_conversation_msg_timestamps();
```

Backfill on migration:
```sql
UPDATE conversations c SET
  last_inbound_at  = (SELECT max(created_at) FROM messages WHERE conversation_id=c.id AND role='user'),
  last_outbound_at = (SELECT max(created_at) FROM messages WHERE conversation_id=c.id AND role='assistant');
```

### 6.3 `nudge_rules` (declarative config)

```sql
CREATE TABLE nudge_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  enabled boolean DEFAULT true,

  -- Targeting
  source_type text,           -- 'campaign'|'iq_setter'|'direct'|'website'|null=any
  source_campaign_id uuid REFERENCES campaigns(id) ON DELETE CASCADE,
  lead_type text,             -- matches lead_type_templates.lead_type

  -- Trigger condition
  delay_hours numeric NOT NULL,        -- hours since last_outbound_at with no inbound after
  attempt_number int NOT NULL,         -- which nudge in sequence (1, 2, ...)
  min_gap_hours numeric DEFAULT 24,    -- min hours between this and prior nudge
  max_attempts int DEFAULT 2,          -- hard stop

  -- Payload (mirrors lead_type_templates shape)
  template_name text NOT NULL,         -- Meta-approved
  template_language text DEFAULT 'en',
  template_category text NOT NULL CHECK (template_category IN ('UTILITY','MARKETING')),
  template_params jsonb,               -- BodyParamSpec[] e.g. [{type:"lead_field",key:"name"}]
  header_image_url text,
  header_media_type text CHECK (header_media_type IN ('image','document','video')),

  -- WABA safety
  respect_24h_window boolean DEFAULT true,
  free_form_fallback text,             -- used if respect_24h_window AND inside 24h

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  UNIQUE (source_type, source_campaign_id, lead_type, attempt_number)
);
```

`UNIQUE` constraint prevents accidental duplicate rules for the same (targeting, attempt) combo.

### 6.4 `nudge_jobs` (runtime queue)

```sql
CREATE TABLE nudge_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid NOT NULL REFERENCES nudge_rules(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  phone text NOT NULL,
  attempt_number int NOT NULL,
  scheduled_for timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','sending','sent','skipped','failed')),
  skip_reason text,    -- 'opted_out'|'replied'|'mode_human'|'max_attempts'|'window_violation'|'rule_disabled'
  whatsapp_msg_id text,
  error text,
  attempt_count int DEFAULT 0,
  last_attempt_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz DEFAULT now(),

  UNIQUE (rule_id, conversation_id, attempt_number)  -- dedupe
);

CREATE INDEX idx_nudge_jobs_due
  ON nudge_jobs(scheduled_for)
  WHERE status = 'pending';

CREATE INDEX idx_nudge_jobs_stuck
  ON nudge_jobs(last_attempt_at)
  WHERE status = 'sending';
```

## 7. Scheduler (`/api/nudges/scheduler`)

Triggered by pg_cron every minute. Pure SQL — no Meta API calls. Single query per rule:

```sql
INSERT INTO nudge_jobs (rule_id, conversation_id, phone, attempt_number, scheduled_for)
SELECT
  $rule_id,
  c.id,
  c.phone,
  $attempt_number,
  now()
FROM conversations c
WHERE
  c.opted_out = false
  AND c.nudges_disabled = false
  AND c.mode != 'human'                                       -- skip human-takeover
  AND c.last_outbound_at IS NOT NULL
  AND c.last_outbound_at < now() - ($delay_hours || ' hours')::interval
  AND (c.last_inbound_at IS NULL OR c.last_inbound_at < c.last_outbound_at)  -- no reply since
  AND c.nudge_count < $max_attempts
  AND (c.last_nudge_at IS NULL OR c.last_nudge_at < now() - ($min_gap_hours || ' hours')::interval)
  -- Targeting
  AND ($source_type IS NULL OR c.source_type = $source_type)
  AND ($source_campaign_id IS NULL OR c.source_campaign_id = $source_campaign_id)
  AND ($lead_type IS NULL OR c.active_lead_type = $lead_type)
  -- Dedupe: no existing pending/sending job for this rule
  AND NOT EXISTS (
    SELECT 1 FROM nudge_jobs nj
    WHERE nj.rule_id = $rule_id
      AND nj.conversation_id = c.id
      AND nj.attempt_number = $attempt_number
  )
LIMIT 500;                                                    -- cap per tick per rule
```

Per-tick safety cap (`LIMIT 500`) prevents runaway enqueue if a config error matches everyone.

## 8. Sender Worker (`/api/nudges/worker`)

Mirrors `campaign-worker.ts` pattern. PL/pgSQL helpers:

```sql
-- Atomic claim
CREATE OR REPLACE FUNCTION claim_pending_nudge_jobs(batch int)
RETURNS SETOF nudge_jobs AS $$
  UPDATE nudge_jobs
  SET status = 'sending', last_attempt_at = now(), attempt_count = attempt_count + 1
  WHERE id IN (
    SELECT id FROM nudge_jobs
    WHERE status = 'pending' AND scheduled_for <= now()
    ORDER BY scheduled_for ASC
    LIMIT batch
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
$$ LANGUAGE sql;

-- Stuck recovery
CREATE OR REPLACE FUNCTION reclaim_stuck_nudge_jobs()
RETURNS void AS $$
  UPDATE nudge_jobs
  SET status = 'pending'
  WHERE status = 'sending' AND last_attempt_at < now() - interval '120 seconds';
$$ LANGUAGE sql;
```

### 8.1 Per-job send logic (TypeScript)

```typescript
// src/lib/nudge-send.ts
async function processNudgeJob(job: NudgeJob): Promise<void> {
  const conv = await fetchConversation(job.conversation_id);
  const rule = await fetchNudgeRule(job.rule_id);

  // Re-check skip conditions (race window between scheduler & sender)
  const skip = checkSkipConditions(conv, rule);
  if (skip) {
    await markSkipped(job.id, skip);
    return;
  }

  // 24h window decision
  const insideWindow = conv.last_inbound_at &&
    (Date.now() - conv.last_inbound_at.getTime()) < 24 * 3600 * 1000;

  let result: SendResult;
  if (insideWindow && rule.respect_24h_window && rule.free_form_fallback) {
    result = await sendWhatsAppMessage(
      conv.phone,
      renderText(rule.free_form_fallback, conv)
    );
  } else {
    result = await sendWhatsAppTemplate(
      conv.phone,
      rule.template_name,
      rule.template_language,
      resolveParams(rule.template_params, conv),
      rule.header_image_url,
      rule.header_media_type
    );
  }

  if (result.ok) {
    // Insert audit row into messages so conversation history shows the nudge
    // and the trigger updates last_outbound_at automatically
    await insertMessage({
      conversation_id: conv.id,
      role: 'assistant',
      content: insideWindow && rule.free_form_fallback
        ? rule.free_form_fallback
        : `[nudge template: ${rule.template_name}]`,
      whatsapp_msg_id: result.waMessageId,
    });
    // Increment nudge_count explicitly (trigger only handles last_outbound_at)
    await bumpNudgeCount(conv.id);
    await markSent(job.id, result.waMessageId);
  } else {
    await markFailed(job.id, result.errorMsg);
  }
}

function checkSkipConditions(conv: Conversation, rule: NudgeRule): string | null {
  if (conv.opted_out) return 'opted_out';
  if (conv.nudges_disabled) return 'nudges_disabled';
  if (conv.mode === 'human') return 'mode_human';
  if (conv.nudge_count >= rule.max_attempts) return 'max_attempts';
  if (conv.last_inbound_at && conv.last_outbound_at &&
      conv.last_inbound_at > conv.last_outbound_at) return 'replied';
  if (!rule.enabled) return 'rule_disabled';
  return null;
}
```

### 8.2 Param resolution

`template_params` JSONB stores specs like `[{type:"lead_field",key:"name"},{type:"static",value:"Unisel"}]`. Resolver looks up `leads` row for the conversation's `source_lead_id`. Reuses existing `BodyParamSpec` type from `lead_type_templates`.

## 9. Cron Wiring

Add to `supabase-migration-nudge-cron.sql`:

```sql
SELECT cron.schedule(
  'nudge-scheduler',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://unisel-ai-whatsapp.vercel.app/api/nudges/scheduler',
    headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.worker_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);

SELECT cron.schedule(
  'nudge-sender',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://unisel-ai-whatsapp.vercel.app/api/nudges/worker',
    headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.worker_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $$
);
```

Both routes guard on `Authorization: Bearer <WORKER_SECRET>` per existing pattern.

## 10. Dashboard UI

New page: `/nudges` (sibling of `/campaigns`, `/lead-types`).

### 10.1 Rules list page

Table of `nudge_rules` rows. Columns: name, enabled toggle, source filter, attempt#, delay, template_name, sent/skipped counters (last 7d), actions (edit / delete / duplicate).

### 10.2 Rule editor (modal or page)

Form fields grouped:

**Identity**
- Name (text)
- Enabled (toggle)

**Targeting**
- Source type (dropdown: any / campaign / iq_setter / direct / website)
- Campaign (dropdown, conditional on source_type=campaign)
- Lead type (dropdown of lead_type_templates, conditional on source_type=iq_setter)

**Timing**
- Attempt number (1, 2, 3...)
- Delay hours (number, default 24)
- Min gap hours (number, default 24)
- Max attempts (number, default 2)

**Payload**
- Template name (dropdown — fetched from Meta API or manual entry)
- Template language (dropdown)
- Template category (UTILITY / MARKETING — UI warns on MARKETING)
- Template params (key-value builder reusing lead_type_templates UI component)
- Header media URL (optional)

**WABA safety**
- Respect 24h window (toggle)
- Free-form fallback text (textarea, shown when toggle on)

**Validation**
- Block save if MARKETING category without explicit confirmation
- Warn if delay_hours < 4 (likely too aggressive)
- Warn if max_attempts > 2

### 10.3 Conversation-level override

On main chat page (`/page.tsx`) per-conversation panel:
- "Pause nudges for this lead" toggle → sets `conversations.nudges_disabled`
- Visible nudge history: "Last nudge sent {ago}. {count}/{max} attempts used."

### 10.4 Analytics widget (optional, phase 2)

Card on dashboard home:
- Nudges sent today
- Replied after nudge (last 7d) — measures effectiveness
- Skipped breakdown (opted_out / human_takeover / replied / etc.)

## 11. Migration & Rollout Plan

### Phase 0 — Schema & infra (no behavior change)
1. Migration: add columns to `conversations`, create trigger, backfill timestamps
2. Migration: create `nudge_rules`, `nudge_jobs`, PL/pgSQL helpers
3. Migration: add pg_cron jobs (both initially disabled or with no enabled rules)
4. Deploy `/api/nudges/scheduler` and `/api/nudges/worker` routes
5. Smoke test: insert a test rule scoped to one phone number, observe job lifecycle

### Phase 1 — Single rule pilot
6. Build admin UI for rules CRUD
7. Create one approved UTILITY template via Meta Business Manager
8. Create one rule scoped to `source_type='iq_setter'`, `lead_type='hot'`, delay=4h, max=1
9. Run for 48h, monitor: send count, reply rate, opt-out rate, quality rating
10. Tune delay/copy based on data

### Phase 2 — Expand & multi-step
11. Add per-conversation override UI
12. Roll out to campaign-source leads (source_type='campaign')
13. Add second-attempt rules where reply rate justifies (delay=24h after first nudge)
14. Build analytics widget

### Phase 3 — Optimization
15. Per-rule pacing (rate-limit if quality rating drops)
16. A/B test templates (phase 4)

## 12. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Trigger doubles `last_outbound_at` writes per outbound, hurts throughput | Trigger is single-row UPDATE, indexed PK. Measured impact negligible. Monitor query latency post-deploy. |
| Scheduler enqueues stale jobs after Meta template gets rejected | Worker re-validates template send, marks job failed. Admin sees failure count in UI, can disable rule. |
| Race: user replies between scheduler enqueue and worker send | Worker re-checks `last_inbound_at > last_outbound_at` before send, marks `skipped: replied`. |
| Bulk enqueue at midnight (delay_hours mass-crosses threshold) overwhelms Meta rate limit | Scheduler `LIMIT 500` per rule per tick. Worker batch=20/min = 1200/hr. Meta business tier limits typically 1k/sec. Safe margin. |
| Quality rating drops from aggressive nudging | Default `max_attempts=2`, `min_gap_hours=24`. Admin UI warns on aggressive config. Phase 3 adds auto-pause on quality drop (requires Meta webhook signal). |
| Conversations stuck `mode='human'` then forgotten | Out of scope. Human-handoff detection lives elsewhere. Nudge skips correctly. |
| Trigger writes to `nudge_count=0` on inbound, racing with worker's `nudge_count++` | Worker increments inside same transaction as marking job sent. Trigger only resets on `role='user'` inserts. Race possible but bounded — worst case is one extra nudge after user just replied; worker also checks `last_inbound_at > last_outbound_at` defense in depth. |

## 13. Open Questions

1. **Template approval ownership** — who creates UTILITY templates in Meta Business Manager? Engineer or marketing? Affects rollout speed.
2. **Multi-language** — current system has Hindi/English mix. Per-rule single language, or auto-pick based on lead's prior conversation language? **Recommendation:** per-rule for v1, smart-pick in phase 3.
3. **`source_type='direct'` nudges** — users who initiated contact themselves may not want follow-up. Default rule should probably exclude this source. Confirm with product.
4. **Backfill scope** — apply nudge rules to existing silent conversations on day 1, or only new ones from migration date forward? **Recommendation:** new-only by default (filter `last_outbound_at > migration_date`), opt-in backfill via admin button.
5. **Worker secret reuse** — share `WORKER_SECRET` env with campaign worker, or distinct `NUDGE_WORKER_SECRET`? **Recommendation:** reuse, fewer secrets to rotate.

## 14. Out of Scope (Explicit)

- LLM-generated nudge copy
- Voice/AI calling nudges (separate system)
- Multi-tenant scoping
- A/B testing infra
- Cross-channel nudges (email, SMS)
- Bulk template approval automation via Meta API
- Re-engagement of opted-out users (compliance forbids)

## 15. References

- Existing campaign worker: `src/lib/campaign-worker.ts`, `supabase-migration-campaign-cron.sql`
- WABA send pipeline: `src/lib/whatsapp.ts`
- Inbound webhook: `src/app/api/webhook/route.ts`
- Opt-out flow: `supabase-migration-opt-out.sql`
- Lead-type templates pattern: `supabase-migration-lead-type-templates.sql`, `src/app/lead-types/page.tsx`
- Direct-form sequence pattern: `src/lib/direct-form.ts`, `supabase-migration-direct-form-trigger.sql`
- Meta WABA pricing & categories: https://developers.facebook.com/docs/whatsapp/pricing
- Meta template quality rating: https://developers.facebook.com/docs/whatsapp/message-templates/guidelines
