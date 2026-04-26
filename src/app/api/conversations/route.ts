import { supabase } from "@/lib/supabase";
import { getCurrentAppUser } from "@/lib/auth";
import type { ConversationSource } from "@/lib/types";

export async function GET() {
  const appUser = await getCurrentAppUser();

  // Build query
  let query = supabase
    .from("conversations")
    .select("*")
    .order("updated_at", { ascending: false });

  // Non-superadmin users only see their allowed phones
  if (appUser && appUser.role !== "superadmin" && appUser.allowed_phones.length > 0) {
    query = query.in("phone", appUser.allowed_phones);
  } else if (appUser && appUser.role !== "superadmin" && appUser.allowed_phones.length === 0) {
    // User has no phones assigned — return empty
    return Response.json([]);
  }

  const { data: conversations, error } = await query;

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  if (!conversations || conversations.length === 0) {
    return Response.json([]);
  }

  // Single query: fetch last message for ALL conversations at once, then map in JS
  const conversationIds = conversations.map((c) => c.id);
  const { data: lastMessages } = await supabase
    .from("messages")
    .select("conversation_id, content, created_at")
    .in("conversation_id", conversationIds)
    .order("created_at", { ascending: false });

  // Build a map of conversation_id -> last message content (first occurrence = most recent)
  const lastMsgMap = new Map<string, string>();
  for (const msg of lastMessages || []) {
    if (!lastMsgMap.has(msg.conversation_id)) {
      lastMsgMap.set(msg.conversation_id, msg.content);
    }
  }

  // Batch-fetch source display data for leads and campaigns
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
    return {
      type: "direct",
      label: "Direct",
      secondary: null,
      template: null,
      received_at: convo.created_at,
    };
  }

  const withLastMessage = conversations.map((convo) => ({
    ...convo,
    last_message: lastMsgMap.get(convo.id) ?? null,
    source: buildSource(convo),
  }));

  return Response.json(withLastMessage);
}
