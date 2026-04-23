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
