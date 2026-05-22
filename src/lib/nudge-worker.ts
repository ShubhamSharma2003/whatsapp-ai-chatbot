import { supabase } from "@/lib/supabase";
import { sendTemplate } from "@/lib/campaign-send";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import {
  checkNudgeSkipReason,
  getNudgeRule,
  isInside24hWindow,
  resolveNudgeBodyParams,
  type ConversationSnapshot,
} from "@/lib/nudge";
import { flattenTemplateParam, renderTemplateBody } from "@/lib/lead-types";
import type { NudgeRule, NudgeSkipReason } from "@/lib/types";

const BATCH_SIZE = 20;

interface ClaimedJob {
  id: string;
  rule_id: string;
  conversation_id: string;
  phone: string;
  attempt_number: number;
}

export interface WorkerResult {
  processed: number;
  sent: number;
  skipped: number;
  failed: number;
  error?: string;
}

export async function runNudgeWorker(): Promise<WorkerResult> {
  await supabase.rpc("reclaim_stuck_nudge_jobs", { p_older_than_seconds: 120 });

  const { data: claimed, error } = await supabase.rpc("claim_pending_nudge_jobs", {
    p_limit: BATCH_SIZE,
  });
  if (error) {
    return { processed: 0, sent: 0, skipped: 0, failed: 0, error: error.message };
  }
  if (!claimed || claimed.length === 0) {
    return { processed: 0, sent: 0, skipped: 0, failed: 0 };
  }

  const jobs = claimed as ClaimedJob[];

  // Cache rules and conversations to avoid N round-trips
  const ruleCache = new Map<string, NudgeRule>();
  await Promise.all(
    [...new Set(jobs.map((j) => j.rule_id))].map(async (id) => {
      const r = await getNudgeRule(id);
      if (r) ruleCache.set(id, r);
    })
  );

  const convIds = [...new Set(jobs.map((j) => j.conversation_id))];
  const { data: convsData } = await supabase
    .from("conversations")
    .select(
      "id, phone, name, mode, opted_out, nudges_disabled, nudge_count, last_inbound_at, last_outbound_at, last_nudge_at"
    )
    .in("id", convIds);

  const convMap = new Map<string, ConversationSnapshot>();
  for (const c of (convsData ?? []) as ConversationSnapshot[]) {
    convMap.set(c.id, c);
  }

  let sent = 0,
    skipped = 0,
    failed = 0;

  await Promise.all(
    jobs.map(async (job) => {
      const result = await processJob(job, ruleCache, convMap);
      if (result === "sent") sent++;
      else if (result === "skipped") skipped++;
      else failed++;
    })
  );

  return {
    processed: jobs.length,
    sent,
    skipped,
    failed,
  };
}

type ProcessOutcome = "sent" | "skipped" | "failed";

async function processJob(
  job: ClaimedJob,
  ruleCache: Map<string, NudgeRule>,
  convMap: Map<string, ConversationSnapshot>
): Promise<ProcessOutcome> {
  const rule = ruleCache.get(job.rule_id);
  const conv = convMap.get(job.conversation_id);

  if (!rule) {
    await markFailed(job.id, "Rule not found");
    return "failed";
  }
  if (!conv) {
    await markFailed(job.id, "Conversation not found");
    return "failed";
  }

  // Re-check skip conditions (race window between scheduler and worker)
  const skipReason = checkNudgeSkipReason(conv, rule);
  if (skipReason) {
    await markSkipped(job.id, skipReason);
    await supabase.rpc("increment_nudge_rule_counter", {
      p_rule_id: rule.id,
      p_column: "total_skipped_count",
      p_delta: 1,
    });
    return "skipped";
  }

  // 24h window decision
  const inside = isInside24hWindow(conv.last_inbound_at);

  let waMessageId: string | null = null;
  let errMsg: string | null = null;
  let renderedContent: string;

  if (inside && rule.respect_24h_window && rule.free_form_fallback) {
    // Use free-form text while window is open
    renderedContent = renderFreeFormFallback(rule.free_form_fallback, conv);
    try {
      const data = await sendWhatsAppMessage(conv.phone, renderedContent);
      waMessageId = data?.messages?.[0]?.id ?? null;
    } catch (e) {
      errMsg = e instanceof Error ? e.message : "send failed";
    }
  } else {
    // Send approved template (works inside and outside the 24h window)
    const paramArr = resolveNudgeBodyParams(rule.template_body_params, {
      name: conv.name,
      bodyText: rule.template_body_text ?? "",
    }).map(flattenTemplateParam);

    // Numeric-keyed map for sendTemplate (mirrors campaign payload shape)
    const paramsRecord: Record<string, string> = {};
    paramArr.forEach((v, i) => {
      paramsRecord[String(i + 1)] = v;
    });

    const result = await sendTemplate({
      templateName: rule.template_name,
      templateLanguage: rule.template_language,
      templateParams: paramArr.length > 0 ? paramsRecord : null,
      headerImageUrl: rule.template_header_url,
      headerMediaType: rule.template_header_media_type,
      headerFilename: rule.template_header_filename,
      phone: conv.phone,
    });
    waMessageId = result.waMessageId;
    errMsg = result.errorMsg;

    // Render readable copy for the messages table audit row
    renderedContent = rule.template_body_text
      ? renderTemplateBody(rule.template_body_text, paramArr)
      : `[nudge template: ${rule.template_name}]`;
  }

  if (!waMessageId) {
    await markFailed(job.id, errMsg ?? "send failed");
    await supabase.rpc("increment_nudge_rule_counter", {
      p_rule_id: rule.id,
      p_column: "total_failed_count",
      p_delta: 1,
    });
    return "failed";
  }

  // Insert audit message row. The trigger updates last_outbound_at; we also
  // bump nudge_count + last_nudge_at explicitly.
  await supabase.from("messages").insert({
    conversation_id: conv.id,
    role: "assistant",
    content: renderedContent,
    whatsapp_msg_id: waMessageId,
  });

  await supabase
    .from("conversations")
    .update({
      nudge_count: conv.nudge_count + 1,
      last_nudge_at: new Date().toISOString(),
    })
    .eq("id", conv.id);

  await supabase
    .from("nudge_jobs")
    .update({
      status: "sent",
      sent_at: new Date().toISOString(),
      whatsapp_msg_id: waMessageId,
      error: null,
    })
    .eq("id", job.id);

  await supabase.rpc("increment_nudge_rule_counter", {
    p_rule_id: rule.id,
    p_column: "total_sent_count",
    p_delta: 1,
  });

  return "sent";
}

async function markSkipped(jobId: string, reason: NudgeSkipReason) {
  await supabase
    .from("nudge_jobs")
    .update({ status: "skipped", skip_reason: reason })
    .eq("id", jobId);
}

async function markFailed(jobId: string, errorMsg: string) {
  await supabase
    .from("nudge_jobs")
    .update({ status: "failed", error: errorMsg })
    .eq("id", jobId);
}

/**
 * Replace simple {{name}} placeholder in free-form fallback text with the
 * conversation's stored name. Other tokens are left as-is.
 */
function renderFreeFormFallback(text: string, conv: ConversationSnapshot): string {
  return text.replace(/\{\{\s*name\s*\}\}/gi, conv.name ?? "");
}
