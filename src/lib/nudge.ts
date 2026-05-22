import { supabase } from "@/lib/supabase";
import type {
  NudgeRule,
  NudgeBodyParamSpec,
  NudgeJob,
  NudgeSkipReason,
} from "@/lib/types";

const RULE_SELECT_COLS =
  "id, name, enabled, source_type, source_campaign_id, lead_type, delay_hours, attempt_number, min_gap_hours, max_attempts, template_name, template_language, template_category, template_body_params, template_body_text, template_header_url, template_header_media_type, template_header_filename, respect_24h_window, free_form_fallback, total_sent_count, total_skipped_count, total_failed_count, total_replied_count, created_at, updated_at";

const JOB_SELECT_COLS =
  "id, rule_id, conversation_id, phone, attempt_number, scheduled_for, status, skip_reason, whatsapp_msg_id, error, attempt_count, last_attempt_at, sent_at, created_at";

// ---------- Rule CRUD ----------

export async function listNudgeRules(): Promise<NudgeRule[]> {
  const { data } = await supabase
    .from("nudge_rules")
    .select(RULE_SELECT_COLS)
    .order("attempt_number", { ascending: true })
    .order("created_at", { ascending: true });
  return (data as NudgeRule[] | null) ?? [];
}

export async function getNudgeRule(id: string): Promise<NudgeRule | null> {
  const { data } = await supabase
    .from("nudge_rules")
    .select(RULE_SELECT_COLS)
    .eq("id", id)
    .maybeSingle();
  return (data as NudgeRule | null) ?? null;
}

export type NudgeRuleInput = Omit<
  NudgeRule,
  | "id"
  | "created_at"
  | "updated_at"
  | "total_sent_count"
  | "total_skipped_count"
  | "total_failed_count"
  | "total_replied_count"
>;

export async function createNudgeRule(
  input: NudgeRuleInput
): Promise<{ data: NudgeRule | null; error: string | null }> {
  const { data, error } = await supabase
    .from("nudge_rules")
    .insert(input)
    .select(RULE_SELECT_COLS)
    .single();
  if (error) return { data: null, error: error.message };
  return { data: data as NudgeRule, error: null };
}

export async function updateNudgeRule(
  id: string,
  updates: Partial<NudgeRuleInput>
): Promise<{ data: NudgeRule | null; error: string | null }> {
  const { data, error } = await supabase
    .from("nudge_rules")
    .update(updates)
    .eq("id", id)
    .select(RULE_SELECT_COLS)
    .single();
  if (error) return { data: null, error: error.message };
  return { data: data as NudgeRule, error: null };
}

export async function deleteNudgeRule(id: string): Promise<string | null> {
  const { error } = await supabase.from("nudge_rules").delete().eq("id", id);
  return error?.message ?? null;
}

// ---------- Job helpers ----------

export async function listRecentNudgeJobs(limit: number = 100): Promise<NudgeJob[]> {
  const { data } = await supabase
    .from("nudge_jobs")
    .select(JOB_SELECT_COLS)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data as NudgeJob[] | null) ?? [];
}

// ---------- Body param resolution ----------

/**
 * Resolve a nudge rule's body params for a given conversation context.
 * Returns the ordered string array passed to sendWhatsAppTemplate body params.
 *
 * Same shape as lead_type_templates' resolveTemplateBodyParams but sourced from
 * conversation context (name) and rule (body_text) instead of lead row.
 */
export function resolveNudgeBodyParams(
  spec: NudgeBodyParamSpec[] | null | undefined,
  ctx: { name: string | null; bodyText: string }
): string[] {
  if (!spec || spec.length === 0) return [];
  return spec.map((p) => {
    if (p.type === "name") return ctx.name ?? "";
    if (p.type === "body_text") return ctx.bodyText ?? "";
    if (p.type === "literal") return p.value ?? "";
    return "";
  });
}

// ---------- Skip-reason check (single source of truth) ----------

export interface ConversationSnapshot {
  id: string;
  phone: string;
  name: string | null;
  mode: "agent" | "human";
  opted_out: boolean;
  nudges_disabled: boolean;
  nudge_count: number;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  last_nudge_at: string | null;
}

export function checkNudgeSkipReason(
  conv: ConversationSnapshot,
  rule: NudgeRule
): NudgeSkipReason | null {
  if (!rule.enabled) return "rule_disabled";
  if (conv.opted_out) return "opted_out";
  if (conv.nudges_disabled) return "nudges_disabled";
  if (conv.mode === "human") return "mode_human";
  if (conv.nudge_count >= rule.max_attempts) return "max_attempts";
  // Replied after our last outbound — no nudge needed
  if (
    conv.last_inbound_at &&
    conv.last_outbound_at &&
    new Date(conv.last_inbound_at) > new Date(conv.last_outbound_at)
  ) {
    return "replied";
  }
  return null;
}

/**
 * 24h customer-service window: open if user sent a message within last 24h.
 * Outside the window, only Meta-approved templates may be delivered.
 */
export function isInside24hWindow(
  lastInboundAt: string | null,
  now: number = Date.now()
): boolean {
  if (!lastInboundAt) return false;
  const lastMs = new Date(lastInboundAt).getTime();
  if (Number.isNaN(lastMs)) return false;
  return now - lastMs < 24 * 60 * 60 * 1000;
}
