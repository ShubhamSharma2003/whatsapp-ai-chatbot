import { supabase } from "@/lib/supabase";
import type { NudgeRule } from "@/lib/types";

const PER_RULE_LIMIT = 500; // hard cap per scheduler tick per rule

export interface SchedulerResult {
  rules_evaluated: number;
  jobs_enqueued: number;
  error?: string;
}

/**
 * Run one scheduler tick:
 *  - Load all enabled rules
 *  - For each rule, INSERT pending nudge_jobs for conversations that match
 *    targeting AND have been silent past delay_hours AND aren't already queued.
 *
 * Idempotent: the UNIQUE (rule_id, conversation_id, attempt_number) constraint
 * + ON CONFLICT DO NOTHING means duplicate ticks are safe.
 */
export async function runNudgeScheduler(): Promise<SchedulerResult> {
  const { data: rules, error } = await supabase
    .from("nudge_rules")
    .select(
      "id, source_type, source_campaign_id, lead_type, delay_hours, attempt_number, min_gap_hours, max_attempts"
    )
    .eq("enabled", true);

  if (error) {
    return { rules_evaluated: 0, jobs_enqueued: 0, error: error.message };
  }
  if (!rules || rules.length === 0) {
    return { rules_evaluated: 0, jobs_enqueued: 0 };
  }

  let totalEnqueued = 0;

  for (const rule of rules as Array<
    Pick<
      NudgeRule,
      | "id"
      | "source_type"
      | "source_campaign_id"
      | "lead_type"
      | "delay_hours"
      | "attempt_number"
      | "min_gap_hours"
      | "max_attempts"
    >
  >) {
    const enqueued = await enqueueForRule(rule);
    totalEnqueued += enqueued;
  }

  return {
    rules_evaluated: rules.length,
    jobs_enqueued: totalEnqueued,
  };
}

async function enqueueForRule(
  rule: Pick<
    NudgeRule,
    | "id"
    | "source_type"
    | "source_campaign_id"
    | "lead_type"
    | "delay_hours"
    | "attempt_number"
    | "min_gap_hours"
    | "max_attempts"
  >
): Promise<number> {
  // Build the eligibility query. The SQL filter mirrors checkNudgeSkipReason
  // (in src/lib/nudge.ts) but operates set-wise for cheap scans.
  let q = supabase
    .from("conversations")
    .select("id, phone")
    .eq("opted_out", false)
    .eq("nudges_disabled", false)
    .neq("mode", "human")
    .not("last_outbound_at", "is", null)
    .lt("nudge_count", rule.max_attempts)
    .lte(
      "last_outbound_at",
      new Date(Date.now() - rule.delay_hours * 3600 * 1000).toISOString()
    );

  if (rule.source_type) {
    q = q.eq("source_type", rule.source_type);
  }
  if (rule.source_campaign_id) {
    q = q.eq("source_campaign_id", rule.source_campaign_id);
  }
  if (rule.lead_type) {
    q = q.eq("active_lead_type", rule.lead_type);
  }

  q = q.limit(PER_RULE_LIMIT);
  const { data: candidates, error } = await q;
  if (error) {
    console.error("[nudge-scheduler] candidate query failed:", error.message);
    return 0;
  }
  if (!candidates || candidates.length === 0) return 0;

  // Filter: last_inbound_at null OR < last_outbound_at (no reply since)
  // AND last_nudge_at null OR < now - min_gap_hours
  // These two checks need conversation rows; fetch them in one pass.
  const ids = candidates.map((c: { id: string }) => c.id);
  const { data: convs, error: convErr } = await supabase
    .from("conversations")
    .select("id, phone, last_inbound_at, last_outbound_at, last_nudge_at")
    .in("id", ids);
  if (convErr || !convs) return 0;

  const now = Date.now();
  const minGapMs = rule.min_gap_hours * 3600 * 1000;
  const eligible = convs.filter((c) => {
    if (!c.last_outbound_at) return false;
    if (
      c.last_inbound_at &&
      new Date(c.last_inbound_at).getTime() >
        new Date(c.last_outbound_at).getTime()
    ) {
      return false;
    }
    if (c.last_nudge_at && now - new Date(c.last_nudge_at).getTime() < minGapMs) {
      return false;
    }
    return true;
  });

  if (eligible.length === 0) return 0;

  const rows = eligible.map((c) => ({
    rule_id: rule.id,
    conversation_id: c.id,
    phone: c.phone,
    attempt_number: rule.attempt_number,
    scheduled_for: new Date().toISOString(),
    status: "pending" as const,
  }));

  // Insert with conflict ignore so re-ticks don't error
  const { data: inserted, error: insertErr } = await supabase
    .from("nudge_jobs")
    .upsert(rows, {
      onConflict: "rule_id,conversation_id,attempt_number",
      ignoreDuplicates: true,
    })
    .select("id");

  if (insertErr) {
    console.error("[nudge-scheduler] insert failed:", insertErr.message);
    return 0;
  }
  return inserted?.length ?? 0;
}
