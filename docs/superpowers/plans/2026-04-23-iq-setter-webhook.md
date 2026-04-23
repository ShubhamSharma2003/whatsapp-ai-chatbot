# IQ Setter Lead Webhook Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a secured `POST /api/iq-setter/leads` endpoint that receives lead data from IQ Setter, stores it in Supabase, sends a WhatsApp template message to the lead, and returns `{ success: true }`.

**Architecture:** New isolated route at `src/app/api/iq-setter/leads/route.ts` handles auth, validation, DB insert, and WhatsApp template send. A new `sendWhatsAppTemplate` function is added to the existing `src/lib/whatsapp.ts`. A new `leads` table is added to Supabase.

**Tech Stack:** Next.js 16 App Router (TypeScript), Supabase JS client, Meta Graph API v22.0, Vitest for tests.

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/app/api/iq-setter/leads/route.ts` | Endpoint: auth, validate, store lead, send template, respond |
| Modify | `src/lib/whatsapp.ts` | Add `sendWhatsAppTemplate` function |
| Modify | `.env.local` | Add `IQ_SETTER_API_KEY` |
| Modify | `.env.example` | Add `IQ_SETTER_API_KEY=` placeholder |
| Modify | `supabase-schema.sql` | Append `leads` table DDL |
| Create | `src/app/api/iq-setter/leads/route.test.ts` | Unit tests for the endpoint |

---

## Task 1: Add `sendWhatsAppTemplate` to whatsapp.ts

**Files:**
- Modify: `src/lib/whatsapp.ts`

- [ ] **Step 1: Add the function**

Append this to the end of `src/lib/whatsapp.ts`:

```typescript
export async function sendWhatsAppTemplate(
  to: string,
  templateName: string,
  languageCode: string
) {
  const res = await fetch(
    `https://graph.facebook.com/v22.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
          name: templateName,
          language: { code: languageCode },
        },
      }),
    }
  );
  const data = await res.json();
  if (!res.ok || data.error) {
    console.error("WhatsApp Template API error:", JSON.stringify(data));
  }
  return data;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/whatsapp.ts
git commit -m "feat: add sendWhatsAppTemplate helper"
```

---

## Task 2: Add `leads` table to Supabase schema

**Files:**
- Modify: `supabase-schema.sql`

- [ ] **Step 1: Append leads table DDL to supabase-schema.sql**

Add this at the end of `supabase-schema.sql`:

```sql
-- IQ Setter leads
CREATE TABLE IF NOT EXISTS leads (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone           TEXT NOT NULL,
  name            TEXT NOT NULL,
  lead_source     TEXT NOT NULL,
  lead_type       TEXT NOT NULL,
  conversation_id UUID REFERENCES conversations(id),
  template_sent   TEXT,
  status          TEXT NOT NULL DEFAULT 'received',
  error           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads(phone);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at DESC);
```

- [ ] **Step 2: Run the DDL in Supabase**

Go to your Supabase project → SQL Editor → paste and run the SQL above.

Expected: no errors, table `leads` appears in Table Editor.

- [ ] **Step 3: Commit**

```bash
git add supabase-schema.sql
git commit -m "feat: add leads table schema"
```

---

## Task 3: Add environment variable

**Files:**
- Modify: `.env.local`
- Modify: `.env.example`

- [ ] **Step 1: Add to .env.local**

Add this line to `.env.local`:

```
IQ_SETTER_API_KEY=your-secret-key-here
```

Replace `your-secret-key-here` with any strong random string (e.g., generate with `openssl rand -hex 32`).

- [ ] **Step 2: Add placeholder to .env.example**

Add this line to `.env.example`:

```
IQ_SETTER_API_KEY=
```

- [ ] **Step 3: Commit**

```bash
git add .env.example
git commit -m "chore: add IQ_SETTER_API_KEY env var"
```

Note: do NOT commit `.env.local`.

---

## Task 4: Write failing tests for the endpoint

**Files:**
- Create: `src/app/api/iq-setter/leads/route.test.ts`

- [ ] **Step 1: Create the test file**

Create `src/app/api/iq-setter/leads/route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Supabase
vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: vi.fn().mockReturnValue({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: "lead-uuid-123", conversation_id: null },
            error: null,
          }),
        }),
      }),
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
      upsert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: "conv-uuid-456" },
            error: null,
          }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    }),
  },
}));

// Mock WhatsApp
vi.mock("@/lib/whatsapp", () => ({
  sendWhatsAppTemplate: vi.fn().mockResolvedValue({ messages: [{ id: "wamid.123" }] }),
}));

// Set env vars
vi.stubEnv("IQ_SETTER_API_KEY", "test-secret-key");

const { POST } = await import("./route");

function makeRequest(body: unknown, apiKey?: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey !== undefined) headers["x-api-key"] = apiKey;
  return new Request("http://localhost/api/iq-setter/leads", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

const validPayload = {
  phone: "+919876543210",
  name: "Rahul Sharma",
  lead_source: "facebook",
  lead_type: "property_inquiry",
};

describe("POST /api/iq-setter/leads", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when x-api-key header is missing", async () => {
    const res = await POST(makeRequest(validPayload) as any);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("Unauthorized");
  });

  it("returns 401 when x-api-key is wrong", async () => {
    const res = await POST(makeRequest(validPayload, "wrong-key") as any);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("Unauthorized");
  });

  it("returns 400 when phone is missing", async () => {
    const { phone, ...body } = validPayload;
    const res = await POST(makeRequest(body, "test-secret-key") as any);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("phone");
  });

  it("returns 400 when name is missing", async () => {
    const { name, ...body } = validPayload;
    const res = await POST(makeRequest(body, "test-secret-key") as any);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("name");
  });

  it("returns 400 when lead_source is missing", async () => {
    const { lead_source, ...body } = validPayload;
    const res = await POST(makeRequest(body, "test-secret-key") as any);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("lead_source");
  });

  it("returns 400 when lead_type is missing", async () => {
    const { lead_type, ...body } = validPayload;
    const res = await POST(makeRequest(body, "test-secret-key") as any);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("lead_type");
  });

  it("returns 200 with success on valid request", async () => {
    const res = await POST(makeRequest(validPayload, "test-secret-key") as any);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.message).toBe("Lead received");
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run src/app/api/iq-setter/leads/route.test.ts
```

Expected: all tests fail with "Cannot find module './route'" or similar. This is correct — implementation doesn't exist yet.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/iq-setter/leads/route.test.ts
git commit -m "test: add failing tests for IQ Setter leads endpoint"
```

---

## Task 5: Implement the endpoint

**Files:**
- Create: `src/app/api/iq-setter/leads/route.ts`

- [ ] **Step 1: Create the route handler**

Create `src/app/api/iq-setter/leads/route.ts`:

```typescript
import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendWhatsAppTemplate } from "@/lib/whatsapp";

const REQUIRED_FIELDS = ["phone", "name", "lead_source", "lead_type"] as const;
const PLACEHOLDER_TEMPLATE = "hello_world";
const PLACEHOLDER_LANGUAGE = "en_US";

export async function POST(request: NextRequest) {
  // Auth
  const apiKey = request.headers.get("x-api-key");
  if (!apiKey || apiKey !== process.env.IQ_SETTER_API_KEY) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Parse + validate
  const body = await request.json();
  for (const field of REQUIRED_FIELDS) {
    if (!body[field]) {
      return Response.json(
        { error: `Missing required field: ${field}` },
        { status: 400 }
      );
    }
  }

  const { phone, name, lead_source, lead_type } = body as {
    phone: string;
    name: string;
    lead_source: string;
    lead_type: string;
  };

  // Insert lead record
  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .insert({ phone, name, lead_source, lead_type, status: "received" })
    .select()
    .single();

  if (leadError) {
    console.error("Failed to insert lead:", leadError);
    return Response.json({ success: true, message: "Lead received" });
  }

  // Find or create conversation
  const { data: existingConv } = await supabase
    .from("conversations")
    .select()
    .eq("phone", phone)
    .single();

  let conversationId: string;

  if (existingConv) {
    conversationId = existingConv.id;
  } else {
    const { data: newConv } = await supabase
      .from("conversations")
      .upsert({ phone, name }, { onConflict: "phone" })
      .select()
      .single();
    conversationId = newConv?.id;
  }

  // Link conversation to lead
  if (conversationId) {
    await supabase
      .from("leads")
      .update({ conversation_id: conversationId })
      .eq("id", lead.id);
  }

  // Send WhatsApp template
  try {
    await sendWhatsAppTemplate(phone, PLACEHOLDER_TEMPLATE, PLACEHOLDER_LANGUAGE);
    await supabase
      .from("leads")
      .update({ status: "template_sent", template_sent: PLACEHOLDER_TEMPLATE })
      .eq("id", lead.id);
  } catch (err) {
    console.error("Failed to send WhatsApp template:", err);
    await supabase
      .from("leads")
      .update({ status: "failed", error: String(err) })
      .eq("id", lead.id);
  }

  return Response.json({ success: true, message: "Lead received" });
}
```

- [ ] **Step 2: Run tests to confirm they pass**

```bash
npx vitest run src/app/api/iq-setter/leads/route.test.ts
```

Expected output:
```
✓ returns 401 when x-api-key header is missing
✓ returns 401 when x-api-key is wrong
✓ returns 400 when phone is missing
✓ returns 400 when name is missing
✓ returns 400 when lead_source is missing
✓ returns 400 when lead_type is missing
✓ returns 200 with success on valid request

Test Files  1 passed (1)
Tests  7 passed (7)
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/iq-setter/leads/route.ts
git commit -m "feat: add IQ Setter leads webhook endpoint"
```

---

## Task 6: Manual smoke test

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

- [ ] **Step 2: Send a valid request**

```bash
curl -X POST http://localhost:3000/api/iq-setter/leads \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-secret-key-here" \
  -d '{"phone":"+919876543210","name":"Test User","lead_source":"facebook","lead_type":"property_inquiry"}'
```

Expected response:
```json
{ "success": true, "message": "Lead received" }
```

- [ ] **Step 3: Verify lead in Supabase**

Go to Supabase → Table Editor → `leads`. Confirm row exists with `status: "template_sent"` (or `"failed"` if placeholder template isn't approved in Meta — that's expected).

- [ ] **Step 4: Test 401**

```bash
curl -X POST http://localhost:3000/api/iq-setter/leads \
  -H "Content-Type: application/json" \
  -d '{"phone":"+919876543210","name":"Test","lead_source":"facebook","lead_type":"x"}'
```

Expected: `{ "error": "Unauthorized" }` with status 401.

- [ ] **Step 5: Final commit if any fixes needed**

```bash
git add -p
git commit -m "fix: smoke test corrections for IQ Setter endpoint"
```

---

## Self-Review Checklist (already verified)

- Auth: ✓ Task 5 validates `x-api-key` header
- Validation: ✓ Task 5 checks all 4 required fields
- Lead storage: ✓ Task 5 inserts to `leads` table
- Conversation upsert: ✓ Task 5 finds or creates conversation
- Template send: ✓ Task 1 adds helper, Task 5 calls it
- Error isolation: ✓ template failure logged, still returns 200
- DB schema: ✓ Task 2
- Env var: ✓ Task 3
- Tests: ✓ Task 4 covers auth (2), validation (4), success (1)
- No placeholder text in plan: ✓
