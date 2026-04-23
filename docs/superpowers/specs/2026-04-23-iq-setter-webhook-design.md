# IQ Setter Lead Webhook — Design Spec

**Date:** 2026-04-23  
**Status:** Approved

---

## Overview

IQ Setter (a CRM platform) POSTs lead data to our system after capturing leads from Meta ads. We receive the lead, store it, send a WhatsApp template message to the lead, and return a success response. The existing WhatsApp AI chatbot then handles the conversation. A future phase will post conversation summaries back to IQ Setter.

---

## Endpoint

**Route:** `POST /api/iq-setter/leads`

**Authentication:** API key in request header.
```
x-api-key: <IQ_SETTER_API_KEY>
```
- Key stored in `.env.local` as `IQ_SETTER_API_KEY`
- Missing or wrong key → `401 Unauthorized`

**Request payload:**
```json
{
  "phone": "+919876543210",
  "name": "Rahul Sharma",
  "lead_source": "facebook",
  "lead_type": "property_inquiry"
}
```

**Success response:**
```json
{
  "success": true,
  "message": "Lead received"
}
```

**Error responses:**
- `401` — missing or invalid API key
- `400` — missing required fields (body specifies which)
- `500` — internal error (still returns 200 to IQ Setter to prevent retries; error logged to DB)

---

## Processing Flow

1. **Authenticate** — validate `x-api-key` header against `IQ_SETTER_API_KEY` env var. Reject with 401 if invalid.
2. **Validate payload** — check all 4 fields present: `phone`, `name`, `lead_source`, `lead_type`. Return 400 with missing field name if any absent.
3. **Store lead** — insert row into `leads` table with status `received`.
4. **Find or create conversation** — look up `conversations` by `phone`. Create if not exists, store `name`.
5. **Send WhatsApp template** — call Meta Graph API using our `WHATSAPP_PHONE_NUMBER_ID` env var, sending to the customer's `phone` from the payload. Send a placeholder template. Template-per-lead-source mapping is deferred to a future phase.
6. **Update lead record** — set `status: 'template_sent'` and `template_sent` field. On any failure, set `status: 'failed'` and `error` field.
7. **Return `200 { success: true, message: "Lead received" }`** — always return 200 to IQ Setter after auth/validation pass, even if template send fails (failure is logged, not surfaced).

---

## Database

### New table: `leads`

```sql
CREATE TABLE leads (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone           TEXT NOT NULL,
  name            TEXT NOT NULL,
  lead_source     TEXT NOT NULL,
  lead_type       TEXT NOT NULL,
  conversation_id UUID REFERENCES conversations(id),
  template_sent   TEXT,
  status          TEXT NOT NULL DEFAULT 'received',  -- 'received' | 'template_sent' | 'failed'
  error           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_leads_phone ON leads(phone);
CREATE INDEX idx_leads_status ON leads(status);
CREATE INDEX idx_leads_created ON leads(created_at DESC);
```

---

## New Files

| File | Purpose |
|------|---------|
| `src/app/api/iq-setter/leads/route.ts` | Endpoint handler — auth, validation, lead processing |

## Modified Files

| File | Change |
|------|--------|
| `src/lib/whatsapp.ts` | Add `sendWhatsAppTemplate(to, templateName, languageCode)` if not present |
| `.env.local` | Add `IQ_SETTER_API_KEY=<secret>` |
| `.env.example` | Add `IQ_SETTER_API_KEY=` placeholder |
| `supabase-schema.sql` | Append `leads` table DDL |

## Unchanged

- `src/app/api/webhook/route.ts` — existing Meta webhook untouched
- All existing tables
- Auth middleware

---

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `IQ_SETTER_API_KEY` | Shared secret IQ Setter sends in `x-api-key` header |

---

## Future Phase (Out of Scope Now)

- Template-per-lead-source mapping (e.g., `facebook` → `fb_lead_template`)
- Post conversation summary back to IQ Setter (triggered by inactivity, mode switch, or manual action)
- IQ Setter callback URL stored per lead

---

## Estimated Scope

~80–100 lines of new code. No breaking changes to existing system.
