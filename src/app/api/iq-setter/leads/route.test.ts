import { describe, it, expect, vi, beforeEach } from "vitest";

const maybeSingleNull = vi.fn().mockResolvedValue({ data: null, error: null });
const insertSingle = vi.fn().mockResolvedValue({
  data: { id: "lead-uuid-123", conversation_id: null },
  error: null,
});
const upsertSingle = vi.fn().mockResolvedValue({
  data: { id: "conv-uuid-456" },
  error: null,
});
const updateEq = vi.fn().mockResolvedValue({ error: null });

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: vi.fn().mockImplementation(() => ({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({ single: insertSingle }),
      }),
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({ maybeSingle: maybeSingleNull }),
      }),
      upsert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({ single: upsertSingle }),
      }),
      update: vi.fn().mockReturnValue({ eq: updateEq }),
    })),
  },
}));

const sendWhatsAppTemplate = vi
  .fn()
  .mockResolvedValue({ messages: [{ id: "wamid.123" }] });

vi.mock("@/lib/whatsapp", () => ({
  sendWhatsAppTemplate: (...args: unknown[]) => sendWhatsAppTemplate(...args),
}));

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
  lead_id: "IQ-001",
  phone: "+919876543210",
  name: "Rahul Sharma",
  lead_source: "facebook",
  lead_type: "property_inquiry",
};

describe("POST /api/iq-setter/leads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    maybeSingleNull.mockResolvedValue({ data: null, error: null });
    sendWhatsAppTemplate.mockResolvedValue({ messages: [{ id: "wamid.123" }] });
  });

  it("returns 401 when x-api-key header is missing", async () => {
    const res = await POST(makeRequest(validPayload) as never);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("Unauthorized");
  });

  it("returns 401 when x-api-key is wrong", async () => {
    const res = await POST(makeRequest(validPayload, "wrong-key") as never);
    expect(res.status).toBe(401);
  });

  for (const field of ["lead_id", "phone", "name", "lead_source", "lead_type"] as const) {
    it(`returns 400 when ${field} is missing`, async () => {
      const body = { ...validPayload };
      delete (body as Record<string, unknown>)[field];
      const res = await POST(makeRequest(body, "test-secret-key") as never);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain(field);
    });
  }

  it("returns 200 with success on valid request", async () => {
    const res = await POST(makeRequest(validPayload, "test-secret-key") as never);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.message).toBe("Lead received");
  });

  it("returns duplicate=true when lead_id already exists", async () => {
    maybeSingleNull.mockResolvedValueOnce({
      data: { id: "existing-uuid", status: "template_sent" },
      error: null,
    });
    const res = await POST(makeRequest(validPayload, "test-secret-key") as never);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.duplicate).toBe(true);
    expect(json.status).toBe("template_sent");
  });

  it("returns 502 when WhatsApp template send fails", async () => {
    sendWhatsAppTemplate.mockRejectedValueOnce(new Error("Meta API down"));
    const res = await POST(makeRequest(validPayload, "test-secret-key") as never);
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toContain("Meta API down");
  });
});
