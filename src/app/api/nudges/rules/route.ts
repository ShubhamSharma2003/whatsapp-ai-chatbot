import { NextResponse, type NextRequest } from "next/server";
import { getCurrentAppUser, hasFeature } from "@/lib/auth";
import { createNudgeRule, listNudgeRules, type NudgeRuleInput } from "@/lib/nudge";

const NUDGES_FEATURE = "nudges";

// GET /api/nudges/rules — list all rules
export async function GET() {
  const appUser = await getCurrentAppUser();
  if (!appUser || !hasFeature(appUser, NUDGES_FEATURE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const rules = await listNudgeRules();
  return NextResponse.json(rules);
}

// POST /api/nudges/rules — create
export async function POST(request: NextRequest) {
  const appUser = await getCurrentAppUser();
  if (!appUser || !hasFeature(appUser, NUDGES_FEATURE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = parseRuleInput(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { data, error } = await createNudgeRule(parsed.input);
  if (error) {
    if (error.includes("duplicate") || error.includes("unique")) {
      return NextResponse.json(
        { error: "A rule with this targeting + attempt number already exists" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}

type ParseResult =
  | { ok: true; input: NudgeRuleInput }
  | { ok: false; error: string };

export function parseRuleInput(body: unknown): ParseResult {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "Invalid payload" };
  }
  const b = body as Record<string, unknown>;

  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (!name) return { ok: false, error: "name is required" };

  const templateName =
    typeof b.template_name === "string" ? b.template_name.trim() : "";
  if (!templateName) return { ok: false, error: "template_name is required" };

  const delayHours = Number(b.delay_hours);
  if (!Number.isFinite(delayHours) || delayHours <= 0) {
    return { ok: false, error: "delay_hours must be > 0" };
  }

  const attemptNumber = Number(b.attempt_number ?? 1);
  if (!Number.isInteger(attemptNumber) || attemptNumber < 1) {
    return { ok: false, error: "attempt_number must be >= 1" };
  }

  const maxAttempts = Number(b.max_attempts ?? 2);
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    return { ok: false, error: "max_attempts must be >= 1" };
  }

  const minGapHours = Number(b.min_gap_hours ?? 24);
  if (!Number.isFinite(minGapHours) || minGapHours < 0) {
    return { ok: false, error: "min_gap_hours must be >= 0" };
  }

  const category =
    b.template_category === "MARKETING" ? "MARKETING" : "UTILITY";

  const sourceType =
    b.source_type === "campaign" ||
    b.source_type === "iq_setter" ||
    b.source_type === "direct" ||
    b.source_type === "website"
      ? b.source_type
      : null;

  const headerMediaType =
    b.template_header_media_type === "image" ||
    b.template_header_media_type === "document" ||
    b.template_header_media_type === "video"
      ? b.template_header_media_type
      : null;

  const input: NudgeRuleInput = {
    name,
    enabled: b.enabled !== false,
    source_type: sourceType,
    source_campaign_id:
      typeof b.source_campaign_id === "string" && b.source_campaign_id
        ? b.source_campaign_id
        : null,
    lead_type:
      typeof b.lead_type === "string" && b.lead_type ? b.lead_type : null,
    delay_hours: delayHours,
    attempt_number: attemptNumber,
    min_gap_hours: minGapHours,
    max_attempts: maxAttempts,
    template_name: templateName,
    template_language:
      typeof b.template_language === "string" && b.template_language
        ? b.template_language
        : "en",
    template_category: category,
    template_body_params: Array.isArray(b.template_body_params)
      ? (b.template_body_params as NudgeRuleInput["template_body_params"])
      : [],
    template_body_text:
      typeof b.template_body_text === "string" ? b.template_body_text : null,
    template_header_url:
      typeof b.template_header_url === "string" && b.template_header_url
        ? b.template_header_url
        : null,
    template_header_media_type: headerMediaType,
    template_header_filename:
      typeof b.template_header_filename === "string" && b.template_header_filename
        ? b.template_header_filename
        : null,
    respect_24h_window: b.respect_24h_window !== false,
    free_form_fallback:
      typeof b.free_form_fallback === "string" && b.free_form_fallback
        ? b.free_form_fallback
        : null,
  };
  return { ok: true, input };
}
