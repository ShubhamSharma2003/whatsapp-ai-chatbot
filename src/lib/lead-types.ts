import { supabase } from "@/lib/supabase";

export type BodyParamSpec =
  | { type: "name" }
  | { type: "body_text" }
  | { type: "literal"; value: string };

export interface LeadTypeTemplate {
  id: string;
  lead_type: string;
  display_name: string;
  enabled: boolean;
  is_default: boolean;
  template_name: string;
  template_language: string;
  template_header_image_url: string | null;
  template_body_text: string;
  template_body_params: BodyParamSpec[];
  brochure_url: string | null;
  brochure_filename: string | null;
  brochure_mime: string | null;
  brochure_caption: string | null;
  extra_info_text: string | null;
  system_prompt: string | null;
  created_at: string;
  updated_at: string;
}

const SELECT_COLS =
  "id, lead_type, display_name, enabled, is_default, template_name, template_language, template_header_image_url, template_body_text, template_body_params, brochure_url, brochure_filename, brochure_mime, brochure_caption, extra_info_text, system_prompt, created_at, updated_at";

/**
 * Resolve lead-type config: exact match → default fallback → null.
 * Caller decides whether to fall back to hardcoded constants when null.
 */
export async function resolveLeadTypeTemplate(
  leadType: string
): Promise<LeadTypeTemplate | null> {
  // Case-insensitive exact match: ilike with wildcard chars escaped so values
  // like "LS_DUPLEX" don't overmatch. Lets the IQ Setter feed match a
  // configured slug even if casing differs.
  const safe = leadType.replace(/([\\%_])/g, "\\$1");
  const { data: exact } = await supabase
    .from("lead_type_templates")
    .select(SELECT_COLS)
    .ilike("lead_type", safe)
    .eq("enabled", true)
    .maybeSingle();
  if (exact) return exact as LeadTypeTemplate;

  const { data: fallback } = await supabase
    .from("lead_type_templates")
    .select(SELECT_COLS)
    .eq("is_default", true)
    .eq("enabled", true)
    .maybeSingle();
  return (fallback as LeadTypeTemplate | null) ?? null;
}

export async function getLeadTypeTemplate(
  leadType: string
): Promise<LeadTypeTemplate | null> {
  const { data } = await supabase
    .from("lead_type_templates")
    .select(SELECT_COLS)
    .eq("lead_type", leadType)
    .maybeSingle();
  return (data as LeadTypeTemplate | null) ?? null;
}

export async function listLeadTypeTemplates(): Promise<LeadTypeTemplate[]> {
  const { data } = await supabase
    .from("lead_type_templates")
    .select(SELECT_COLS)
    .order("created_at", { ascending: true });
  return (data as LeadTypeTemplate[] | null) ?? [];
}

/**
 * Build the body-params array passed to sendWhatsAppTemplate.
 * Defaults to [name, body_text] when no spec is configured (preserves current behavior).
 */
export function resolveTemplateBodyParams(
  spec: BodyParamSpec[] | null | undefined,
  ctx: { name: string; bodyText: string }
): string[] {
  if (!spec || spec.length === 0) {
    return [ctx.name, ctx.bodyText];
  }
  return spec.map((p) => {
    if (p.type === "name") return ctx.name;
    if (p.type === "body_text") return ctx.bodyText;
    if (p.type === "literal") return p.value ?? "";
    return "";
  });
}

/**
 * Map a MIME type to the WhatsApp media type used by sendWhatsAppMedia.
 * Defaults to 'document' for unknown types so PDF/Doc uploads work.
 */
export function mediaTypeFromMime(
  mime: string | null | undefined
): "document" | "image" | "video" | "audio" {
  if (!mime) return "document";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "document";
}

/**
 * Validate + normalize a lead_type identifier.
 * Accepts the upstream IQ Setter feed values verbatim — these are often
 * human-readable strings like "GODREJ GCR LS" or "DLF FLOORS LS- DUPLEX".
 * Whitespace is collapsed to single spaces and trimmed. Length 1-64.
 * Match against incoming `lead_type` is case-insensitive at lookup time.
 */
export function normalizeLeadType(raw: string): string | null {
  const trimmed = raw.replace(/\s+/g, " ").trim();
  if (trimmed.length < 1 || trimmed.length > 64) return null;
  if (!/^[A-Za-z0-9 _\-]+$/.test(trimmed)) return null;
  return trimmed;
}

/**
 * Flatten a string for use as a WhatsApp template body parameter.
 * Meta rejects newlines, tabs, and 4+ consecutive spaces in template body variables (error 132018).
 * Applied only when sending to Meta — the readable value is kept in DB / messages table.
 */
export function flattenTemplateParam(raw: string): string {
  return raw
    .replace(/[\r\n\t]+/g, " ")
    .replace(/ {4,}/g, "   ")
    .trim();
}

/**
 * Substitute {{1}}, {{2}}, ... placeholders in a Meta template body with their
 * resolved param values for storage in the messages table. Pass the un-flattened
 * params so newlines survive in the dashboard view.
 */
export function renderTemplateBody(bodyText: string, params: string[]): string {
  return bodyText.replace(/\{\{(\d+)\}\}/g, (_, idx: string) => {
    const i = parseInt(idx, 10) - 1;
    return params[i] ?? "";
  });
}
