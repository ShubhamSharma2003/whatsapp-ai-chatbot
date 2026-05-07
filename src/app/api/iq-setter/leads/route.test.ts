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
const messagesInsert = vi.fn().mockResolvedValue({ error: null });

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === "messages") {
        return { insert: messagesInsert };
      }
      return {
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({ single: insertSingle }),
        }),
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: maybeSingleNull,
          }),
        }),
        upsert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({ single: upsertSingle }),
        }),
        update: vi.fn().mockReturnValue({ eq: updateEq }),
      };
    }),
  },
}));

const sendWhatsAppTemplate = vi
  .fn()
  .mockResolvedValue({ messages: [{ id: "wamid.123" }] });
const sendWhatsAppMedia = vi
  .fn()
  .mockResolvedValue({ messages: [{ id: "wamid.brochure" }] });
const sendWhatsAppMessage = vi
  .fn()
  .mockResolvedValue({ messages: [{ id: "wamid.text" }] });

vi.mock("@/lib/whatsapp", () => ({
  sendWhatsAppTemplate: (...args: unknown[]) => sendWhatsAppTemplate(...args),
  sendWhatsAppMedia: (...args: unknown[]) => sendWhatsAppMedia(...args),
  sendWhatsAppMessage: (...args: unknown[]) => sendWhatsAppMessage(...args),
}));

const resolveLeadTypeTemplate = vi.fn().mockResolvedValue(null);

vi.mock("@/lib/lead-types", async () => {
  const actual = await vi.importActual<typeof import("@/lib/lead-types")>(
    "@/lib/lead-types"
  );
  return {
    ...actual,
    resolveLeadTypeTemplate: (...args: unknown[]) => resolveLeadTypeTemplate(...args),
  };
});

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
    sendWhatsAppMedia.mockResolvedValue({ messages: [{ id: "wamid.brochure" }] });
    sendWhatsAppMessage.mockResolvedValue({ messages: [{ id: "wamid.text" }] });
    resolveLeadTypeTemplate.mockResolvedValue(null);
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

  it("returns 200 with success and uses fallback template when no DB row matches", async () => {
    const res = await POST(makeRequest(validPayload, "test-secret-key") as never);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.template_used).toBe("fallback");
    expect(sendWhatsAppTemplate).toHaveBeenCalledTimes(1);
    expect(sendWhatsAppMedia).not.toHaveBeenCalled();
    expect(sendWhatsAppMessage).not.toHaveBeenCalled();
  });

  it("uses matched lead-type template and sends template + brochure + extra info", async () => {
    resolveLeadTypeTemplate.mockResolvedValueOnce({
      id: "tpl-1",
      lead_type: "property_inquiry",
      display_name: "Property Inquiry",
      enabled: true,
      is_default: false,
      template_name: "smart_world_welcome",
      template_language: "en",
      template_header_image_url: "https://cdn/img.png",
      template_body_text: "Welcome body",
      template_body_params: [{ type: "name" }, { type: "literal", value: "Smart World" }],
      brochure_url: "https://cdn/brochure.pdf",
      brochure_filename: "smart_world.pdf",
      brochure_mime: "application/pdf",
      brochure_caption: "Brochure attached",
      extra_info_text: "Anything specific I can help with?",
      system_prompt: "Smart World knowledge base…",
      created_at: "2026-05-07T00:00:00Z",
      updated_at: "2026-05-07T00:00:00Z",
    });

    const res = await POST(makeRequest(validPayload, "test-secret-key") as never);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.template_used).toBe("property_inquiry");
    expect(json.sent.templateSent).toBe(true);
    expect(json.sent.brochureSent).toBe(true);
    expect(json.sent.extraInfoSent).toBe(true);

    expect(sendWhatsAppTemplate).toHaveBeenCalledWith(
      "+919876543210",
      "smart_world_welcome",
      "en",
      ["Rahul Sharma", "Smart World"],
      "https://cdn/img.png"
    );
    expect(sendWhatsAppMedia).toHaveBeenCalledWith(
      "+919876543210",
      "document",
      "https://cdn/brochure.pdf",
      "Brochure attached",
      "smart_world.pdf"
    );
    expect(sendWhatsAppMessage).toHaveBeenCalledWith(
      "+919876543210",
      "Anything specific I can help with?"
    );
  });

  it("marks lead 'partial' when brochure send fails but template succeeded", async () => {
    resolveLeadTypeTemplate.mockResolvedValueOnce({
      id: "tpl-2",
      lead_type: "property_inquiry",
      display_name: "Property Inquiry",
      enabled: true,
      is_default: false,
      template_name: "welcome",
      template_language: "en",
      template_header_image_url: null,
      template_body_text: "Hi",
      template_body_params: [],
      brochure_url: "https://cdn/brochure.pdf",
      brochure_filename: "b.pdf",
      brochure_mime: "application/pdf",
      brochure_caption: null,
      extra_info_text: null,
      system_prompt: null,
      created_at: "2026-05-07T00:00:00Z",
      updated_at: "2026-05-07T00:00:00Z",
    });
    sendWhatsAppMedia.mockRejectedValueOnce(new Error("Meta media error"));

    const res = await POST(makeRequest(validPayload, "test-secret-key") as never);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.sent.templateSent).toBe(true);
    expect(json.sent.brochureSent).toBe(false);
    expect(json.sent.errors[0]).toContain("brochure");
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
