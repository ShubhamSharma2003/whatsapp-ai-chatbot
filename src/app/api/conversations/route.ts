import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { getCurrentAppUser, isSuperAdmin } from "@/lib/auth";
import type { ConversationFilter, ConversationSource } from "@/lib/types";

/**
 * PATCH /api/conversations — bulk update
 * Body: { mode: "agent" | "human" }
 * Sets every visible conversation to the given mode. Superadmin-only.
 */
export async function PATCH(request: NextRequest) {
  const appUser = await getCurrentAppUser();
  if (!appUser || !isSuperAdmin(appUser)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const mode = body?.mode;
  if (mode !== "agent" && mode !== "human") {
    return Response.json({ error: "mode must be 'agent' or 'human'" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("conversations")
    .update({ mode })
    .neq("mode", mode)
    .select("id");

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true, updated: data?.length ?? 0, mode });
}

const VALID_FILTERS: readonly ConversationFilter[] = [
  "all",
  "facebook",
  "direct",
  "campaign",
  "website",
  "nudged",
  "upcoming_nudge",
  "replied_to_nudge",
  "ignored_nudge",
  "opted_out",
  "human_mode",
] as const;

function parseFilter(raw: string | null): ConversationFilter {
  if (!raw) return "all";
  return (VALID_FILTERS as readonly string[]).includes(raw)
    ? (raw as ConversationFilter)
    : "all";
}

export async function GET(request: NextRequest) {
  const appUser = await getCurrentAppUser();
  const filter = parseFilter(request.nextUrl.searchParams.get("filter"));

  // Base query — always select nudge-state columns so the client can render
  // badges even when no filter is applied.
  let query = supabase
    .from("conversations")
    .select(
      "*, last_inbound_at, last_outbound_at, nudge_count, last_nudge_at, nudges_disabled, opted_out"
    )
    .order("updated_at", { ascending: false });

  // Apply server-side filter
  switch (filter) {
    case "facebook":
      query = query.eq("source_type", "iq_setter");
      break;
    case "direct":
      query = query.eq("source_type", "direct");
      break;
    case "campaign":
      query = query.eq("source_type", "campaign");
      break;
    case "website":
      query = query.eq("source_type", "website");
      break;
    case "nudged":
      query = query.gt("nudge_count", 0);
      break;
    case "opted_out":
      query = query.eq("opted_out", true);
      break;
    case "human_mode":
      query = query.eq("mode", "human");
      break;
    // replied_to_nudge / ignored_nudge / upcoming_nudge applied below
    //   after fetch (need cross-row reasoning or join).
    default:
      break;
  }

  // Non-superadmin RBAC
  if (appUser && appUser.role !== "superadmin" && appUser.allowed_phones.length > 0) {
    query = query.in("phone", appUser.allowed_phones);
  } else if (appUser && appUser.role !== "superadmin" && appUser.allowed_phones.length === 0) {
    return Response.json([]);
  }

  const { data: conversations, error } = await query;

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  if (!conversations || conversations.length === 0) {
    return Response.json([]);
  }

  // Last message per conversation
  const conversationIds = conversations.map((c) => c.id);
  const { data: lastMessages } = await supabase
    .from("messages")
    .select("conversation_id, role, content, created_at")
    .in("conversation_id", conversationIds)
    .order("created_at", { ascending: false });

  const lastMsgMap = new Map<string, string>();
  const lastUserMsgAtMap = new Map<string, string>();
  for (const msg of lastMessages || []) {
    if (!lastMsgMap.has(msg.conversation_id)) {
      lastMsgMap.set(msg.conversation_id, msg.content);
    }
    if (msg.role === "user" && !lastUserMsgAtMap.has(msg.conversation_id)) {
      lastUserMsgAtMap.set(msg.conversation_id, msg.created_at);
    }
  }

  // Pending nudge jobs per conversation (drives upcoming_nudge filter + next_nudge_at)
  const { data: pendingJobs } = await supabase
    .from("nudge_jobs")
    .select("conversation_id, scheduled_for, status")
    .in("conversation_id", conversationIds)
    .in("status", ["pending", "sending"]);

  const pendingMap = new Map<string, string>();
  for (const j of pendingJobs || []) {
    const cur = pendingMap.get(j.conversation_id);
    if (!cur || new Date(j.scheduled_for) < new Date(cur)) {
      pendingMap.set(j.conversation_id, j.scheduled_for);
    }
  }

  // Batch lead + campaign metadata for source display
  const leadIds = Array.from(
    new Set(conversations.map((c) => c.source_lead_id).filter(Boolean) as string[])
  );
  const campaignIds = Array.from(
    new Set(conversations.map((c) => c.source_campaign_id).filter(Boolean) as string[])
  );

  const [{ data: leadRows }, { data: campaignRows }] = await Promise.all([
    leadIds.length
      ? supabase
          .from("leads")
          .select("id, lead_source, lead_type, template_sent, created_at")
          .in("id", leadIds)
      : Promise.resolve({ data: [] as Array<{ id: string; lead_source: string; lead_type: string; template_sent: string | null; created_at: string }> }),
    campaignIds.length
      ? supabase
          .from("campaigns")
          .select("id, name, template_name, created_at")
          .in("id", campaignIds)
      : Promise.resolve({ data: [] as Array<{ id: string; name: string; template_name: string; created_at: string }> }),
  ]);

  const leadMap = new Map((leadRows ?? []).map((l) => [l.id, l]));
  const campaignMap = new Map((campaignRows ?? []).map((c) => [c.id, c]));

  type ConvoRow = (typeof conversations)[number];
  function buildSource(convo: ConvoRow): ConversationSource {
    if (convo.source_type === "iq_setter" && convo.source_lead_id) {
      const lead = leadMap.get(convo.source_lead_id);
      return {
        type: "iq_setter",
        label: lead?.lead_source ?? "IQ Setter",
        secondary: lead?.lead_type ?? null,
        template: lead?.template_sent ?? null,
        received_at: lead?.created_at ?? convo.created_at,
      };
    }
    if (convo.source_type === "campaign" && convo.source_campaign_id) {
      const camp = campaignMap.get(convo.source_campaign_id);
      return {
        type: "campaign",
        label: camp?.name ?? "Campaign",
        secondary: null,
        template: camp?.template_name ?? null,
        received_at: camp?.created_at ?? convo.created_at,
      };
    }
    if (convo.source_type === "website") {
      return {
        type: "website",
        label: "Website",
        secondary: null,
        template: null,
        received_at: convo.created_at,
      };
    }
    return {
      type: "direct",
      label: "Direct",
      secondary: null,
      template: null,
      received_at: convo.created_at,
    };
  }

  const enriched = conversations.map((convo) => {
    const nudgeCount = convo.nudge_count ?? 0;
    const lastNudgeAt = convo.last_nudge_at ?? null;
    const lastInbound = convo.last_inbound_at ?? lastUserMsgAtMap.get(convo.id) ?? null;
    const repliedToNudge =
      !!(lastNudgeAt && lastInbound && new Date(lastInbound) > new Date(lastNudgeAt));
    const ignoredNudge = nudgeCount > 0 && !repliedToNudge;
    const nextNudgeAt = pendingMap.get(convo.id) ?? null;
    return {
      ...convo,
      last_message: lastMsgMap.get(convo.id) ?? null,
      last_user_message_at: lastUserMsgAtMap.get(convo.id) ?? null,
      source: buildSource(convo),
      opted_out: convo.opted_out ?? false,
      nudges_disabled: convo.nudges_disabled ?? false,
      nudge_count: nudgeCount,
      last_nudge_at: lastNudgeAt,
      last_inbound_at: lastInbound,
      last_outbound_at: convo.last_outbound_at ?? null,
      has_pending_nudge: nextNudgeAt !== null,
      next_nudge_at: nextNudgeAt,
      replied_to_nudge: repliedToNudge,
      ignored_nudge: ignoredNudge,
    };
  });

  // Post-filter for cross-row / derived predicates
  let filtered = enriched;
  if (filter === "upcoming_nudge") {
    filtered = enriched.filter((c) => c.has_pending_nudge);
  } else if (filter === "replied_to_nudge") {
    filtered = enriched.filter((c) => c.replied_to_nudge);
  } else if (filter === "ignored_nudge") {
    filtered = enriched.filter((c) => c.ignored_nudge);
  }

  return Response.json(filtered);
}
