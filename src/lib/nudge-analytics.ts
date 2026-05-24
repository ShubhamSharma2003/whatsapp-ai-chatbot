import { supabase } from "@/lib/supabase";

// ---------- Public types ----------

export interface NudgeOverview {
  total_attempts: number;
  sent: number;
  failed: number;
  skipped: number;
  pending: number;
  in_flight: number;
  unique_recipients: number;
  unique_sent_recipients: number;
  replied_after_nudge: number;
  ignored: number;
  reply_rate_pct: number;
}

export interface RuleStats {
  rule_id: string;
  rule_name: string;
  enabled: boolean;
  source_type: string | null;
  lead_type: string | null;
  template_name: string;
  template_category: string;
  delay_hours: number;
  attempt_number: number;
  total_attempts: number;
  sent: number;
  failed: number;
  skipped: number;
  pending: number;
  in_flight: number;
  unique_recipients: number;
  replied_after_nudge: number;
  reply_rate_pct: number;
}

export interface ErrorBucket {
  error: string;
  count: number;
  unique_phones: number;
  rule_names: string[];
  last_seen: string | null;
}

export interface SkipBucket {
  skip_reason: string;
  count: number;
  rule_names: string[];
}

export interface DailyPoint {
  day: string; // ISO date (YYYY-MM-DD)
  sent: number;
  failed: number;
  skipped: number;
}

export interface RecentFailure {
  job_id: string;
  rule_name: string;
  phone: string;
  error: string | null;
  attempt_number: number;
  last_attempt_at: string | null;
}

export interface RecentSend {
  job_id: string;
  rule_name: string;
  phone: string;
  sent_at: string | null;
  replied: boolean;
  replied_at: string | null;
}

export interface NudgeAnalytics {
  overview: NudgeOverview;
  rules: RuleStats[];
  errors: ErrorBucket[];
  skips: SkipBucket[];
  daily: DailyPoint[];
  recent_failures: RecentFailure[];
  recent_sends: RecentSend[];
  generated_at: string;
}

// ---------- Internal raw row shapes ----------

interface JobRow {
  id: string;
  rule_id: string;
  conversation_id: string;
  phone: string;
  attempt_number: number;
  status: "pending" | "sending" | "sent" | "skipped" | "failed";
  skip_reason: string | null;
  error: string | null;
  sent_at: string | null;
  last_attempt_at: string | null;
  created_at: string;
}

interface RuleRow {
  id: string;
  name: string;
  enabled: boolean;
  source_type: string | null;
  lead_type: string | null;
  template_name: string;
  template_category: string;
  delay_hours: number;
  attempt_number: number;
}

interface ConvRow {
  id: string;
  last_inbound_at: string | null;
}

// ---------- Aggregator ----------

const DAYS_WINDOW = 14;
const RECENT_LIMIT = 25;

export async function computeNudgeAnalytics(): Promise<NudgeAnalytics> {
  const since = new Date(Date.now() - DAYS_WINDOW * 24 * 3600 * 1000).toISOString();

  const [{ data: rules }, { data: jobs }] = await Promise.all([
    supabase
      .from("nudge_rules")
      .select(
        "id, name, enabled, source_type, lead_type, template_name, template_category, delay_hours, attempt_number"
      ),
    supabase
      .from("nudge_jobs")
      .select(
        "id, rule_id, conversation_id, phone, attempt_number, status, skip_reason, error, sent_at, last_attempt_at, created_at"
      )
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(20000),
  ]);

  const ruleRows: RuleRow[] = (rules ?? []) as RuleRow[];
  const jobRows: JobRow[] = (jobs ?? []) as JobRow[];

  // For reply detection, fetch conversation last_inbound_at for any conv we touched
  const convIds = Array.from(new Set(jobRows.map((j) => j.conversation_id)));
  const convMap = new Map<string, ConvRow>();
  if (convIds.length > 0) {
    const { data: convs } = await supabase
      .from("conversations")
      .select("id, last_inbound_at")
      .in("id", convIds);
    for (const c of (convs ?? []) as ConvRow[]) {
      convMap.set(c.id, c);
    }
  }

  const ruleMap = new Map<string, RuleRow>(ruleRows.map((r) => [r.id, r]));

  // ---- Overview + per-rule funnel ----

  const overview: NudgeOverview = {
    total_attempts: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    pending: 0,
    in_flight: 0,
    unique_recipients: 0,
    unique_sent_recipients: 0,
    replied_after_nudge: 0,
    ignored: 0,
    reply_rate_pct: 0,
  };

  const perRule = new Map<
    string,
    {
      sent: number;
      failed: number;
      skipped: number;
      pending: number;
      in_flight: number;
      unique: Set<string>;
      replied: Set<string>;
    }
  >();

  const allRecipients = new Set<string>();
  const sentRecipients = new Set<string>();
  const repliedRecipients = new Set<string>();
  const sentConvWithoutReply = new Set<string>();

  for (const j of jobRows) {
    overview.total_attempts++;
    allRecipients.add(j.conversation_id);

    if (!perRule.has(j.rule_id)) {
      perRule.set(j.rule_id, {
        sent: 0,
        failed: 0,
        skipped: 0,
        pending: 0,
        in_flight: 0,
        unique: new Set(),
        replied: new Set(),
      });
    }
    const pr = perRule.get(j.rule_id)!;
    pr.unique.add(j.conversation_id);

    if (j.status === "sent") {
      overview.sent++;
      pr.sent++;
      sentRecipients.add(j.conversation_id);
      const conv = convMap.get(j.conversation_id);
      const replied =
        !!(j.sent_at && conv?.last_inbound_at && new Date(conv.last_inbound_at) > new Date(j.sent_at));
      if (replied) {
        repliedRecipients.add(j.conversation_id);
        pr.replied.add(j.conversation_id);
      } else {
        sentConvWithoutReply.add(j.conversation_id);
      }
    } else if (j.status === "failed") {
      overview.failed++;
      pr.failed++;
    } else if (j.status === "skipped") {
      overview.skipped++;
      pr.skipped++;
    } else if (j.status === "pending") {
      overview.pending++;
      pr.pending++;
    } else if (j.status === "sending") {
      overview.in_flight++;
      pr.in_flight++;
    }
  }

  overview.unique_recipients = allRecipients.size;
  overview.unique_sent_recipients = sentRecipients.size;
  overview.replied_after_nudge = repliedRecipients.size;
  overview.ignored = sentConvWithoutReply.size;
  overview.reply_rate_pct =
    sentRecipients.size > 0
      ? Math.round((repliedRecipients.size * 1000) / sentRecipients.size) / 10
      : 0;

  // Materialize per-rule stats (include rules with zero activity too)
  const rulesOut: RuleStats[] = ruleRows.map((r) => {
    const pr = perRule.get(r.id);
    const sent = pr?.sent ?? 0;
    const replied = pr?.replied.size ?? 0;
    return {
      rule_id: r.id,
      rule_name: r.name,
      enabled: r.enabled,
      source_type: r.source_type,
      lead_type: r.lead_type,
      template_name: r.template_name,
      template_category: r.template_category,
      delay_hours: Number(r.delay_hours),
      attempt_number: r.attempt_number,
      total_attempts:
        sent +
        (pr?.failed ?? 0) +
        (pr?.skipped ?? 0) +
        (pr?.pending ?? 0) +
        (pr?.in_flight ?? 0),
      sent,
      failed: pr?.failed ?? 0,
      skipped: pr?.skipped ?? 0,
      pending: pr?.pending ?? 0,
      in_flight: pr?.in_flight ?? 0,
      unique_recipients: pr?.unique.size ?? 0,
      replied_after_nudge: replied,
      reply_rate_pct: sent > 0 ? Math.round((replied * 1000) / sent) / 10 : 0,
    };
  });

  // ---- Error buckets ----

  const errMap = new Map<
    string,
    { count: number; phones: Set<string>; rules: Set<string>; last: string | null }
  >();
  for (const j of jobRows) {
    if (j.status !== "failed" || !j.error) continue;
    const key = truncateError(j.error);
    if (!errMap.has(key)) {
      errMap.set(key, { count: 0, phones: new Set(), rules: new Set(), last: null });
    }
    const e = errMap.get(key)!;
    e.count++;
    e.phones.add(j.phone);
    const rname = ruleMap.get(j.rule_id)?.name;
    if (rname) e.rules.add(rname);
    if (!e.last || (j.last_attempt_at && j.last_attempt_at > e.last)) {
      e.last = j.last_attempt_at;
    }
  }
  const errors: ErrorBucket[] = [...errMap.entries()]
    .map(([error, v]) => ({
      error,
      count: v.count,
      unique_phones: v.phones.size,
      rule_names: [...v.rules],
      last_seen: v.last,
    }))
    .sort((a, b) => b.count - a.count);

  // ---- Skip buckets ----

  const skipMap = new Map<string, { count: number; rules: Set<string> }>();
  for (const j of jobRows) {
    if (j.status !== "skipped") continue;
    const key = j.skip_reason ?? "unknown";
    if (!skipMap.has(key)) {
      skipMap.set(key, { count: 0, rules: new Set() });
    }
    const s = skipMap.get(key)!;
    s.count++;
    const rname = ruleMap.get(j.rule_id)?.name;
    if (rname) s.rules.add(rname);
  }
  const skips: SkipBucket[] = [...skipMap.entries()]
    .map(([skip_reason, v]) => ({
      skip_reason,
      count: v.count,
      rule_names: [...v.rules],
    }))
    .sort((a, b) => b.count - a.count);

  // ---- Daily breakdown (last 14 days, UTC) ----

  const dayMap = new Map<string, DailyPoint>();
  for (let i = DAYS_WINDOW - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 3600 * 1000);
    const key = d.toISOString().slice(0, 10);
    dayMap.set(key, { day: key, sent: 0, failed: 0, skipped: 0 });
  }
  for (const j of jobRows) {
    const day = j.created_at.slice(0, 10);
    const pt = dayMap.get(day);
    if (!pt) continue;
    if (j.status === "sent") pt.sent++;
    else if (j.status === "failed") pt.failed++;
    else if (j.status === "skipped") pt.skipped++;
  }
  const daily: DailyPoint[] = [...dayMap.values()];

  // ---- Recent failures + recent sends ----

  const recent_failures: RecentFailure[] = jobRows
    .filter((j) => j.status === "failed")
    .slice(0, RECENT_LIMIT)
    .map((j) => ({
      job_id: j.id,
      rule_name: ruleMap.get(j.rule_id)?.name ?? "(deleted)",
      phone: j.phone,
      error: j.error,
      attempt_number: j.attempt_number,
      last_attempt_at: j.last_attempt_at,
    }));

  const recent_sends: RecentSend[] = jobRows
    .filter((j) => j.status === "sent")
    .slice(0, RECENT_LIMIT)
    .map((j) => {
      const conv = convMap.get(j.conversation_id);
      const replied =
        !!(j.sent_at && conv?.last_inbound_at && new Date(conv.last_inbound_at) > new Date(j.sent_at));
      return {
        job_id: j.id,
        rule_name: ruleMap.get(j.rule_id)?.name ?? "(deleted)",
        phone: j.phone,
        sent_at: j.sent_at,
        replied,
        replied_at: replied ? conv?.last_inbound_at ?? null : null,
      };
    });

  return {
    overview,
    rules: rulesOut,
    errors,
    skips,
    daily,
    recent_failures,
    recent_sends,
    generated_at: new Date().toISOString(),
  };
}

function truncateError(err: string): string {
  // Group Meta errors by their leading "(#NNNNN) ..." token so 50 phones with
  // the same template-format error count as one bucket.
  const trimmed = err.trim();
  if (trimmed.length <= 120) return trimmed;
  return trimmed.slice(0, 120) + "…";
}
