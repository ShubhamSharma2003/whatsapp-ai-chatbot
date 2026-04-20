import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BATCH_SIZE = 5;
const META_VERSION = "v22.0";

type CampaignCache = {
  id: string;
  template_name: string;
  template_language: string;
  template_params: Record<string, string> | null;
  header_image_url: string | null;
  template_body: string | null;
  status: string;
};

async function fetchCampaign(id: string, cache: Map<string, CampaignCache>) {
  if (cache.has(id)) return cache.get(id)!;
  const { data } = await supabase
    .from("campaigns")
    .select("id, template_name, template_language, template_params, header_image_url, template_body, status")
    .eq("id", id)
    .single();
  if (data) cache.set(id, data as CampaignCache);
  return data as CampaignCache | null;
}

function buildMetaPayload(campaign: CampaignCache, phone: string) {
  const components: unknown[] = [];
  if (campaign.header_image_url) {
    components.push({
      type: "header",
      parameters: [{ type: "image", image: { link: campaign.header_image_url } }],
    });
  }
  if (campaign.template_params && Object.keys(campaign.template_params).length > 0) {
    const params = campaign.template_params;
    components.push({
      type: "body",
      parameters: Object.keys(params)
        .sort((a, b) => Number(a) - Number(b))
        .map((key) => ({ type: "text", text: params[key] })),
    });
  }
  return {
    messaging_product: "whatsapp",
    to: phone,
    type: "template",
    template: {
      name: campaign.template_name,
      language: { code: campaign.template_language || "en" },
      components,
    },
  };
}

async function storeBroadcastInConversation(
  campaign: CampaignCache,
  phone: string,
  waMessageId: string | null
) {
  let { data: conversation } = await supabase
    .from("conversations")
    .select("id")
    .eq("phone", phone)
    .single();

  if (!conversation) {
    const { data: newConvo } = await supabase
      .from("conversations")
      .insert({ phone })
      .select("id")
      .single();
    conversation = newConvo;
  }
  if (!conversation) return;

  let resolvedBody = campaign.template_body || "";
  const params = campaign.template_params;
  if (params) {
    resolvedBody = resolvedBody.replace(/\{\{(\d+)\}\}/g, (_: string, num: string) =>
      params[num] ?? `{{${num}}}`
    );
  }
  const messageContent =
    `📢 Broadcast: ${campaign.template_name}\n${resolvedBody}` +
    (campaign.header_image_url ? `\n[Image: ${campaign.header_image_url}]` : "");

  await supabase.from("messages").insert({
    conversation_id: conversation.id,
    role: "assistant",
    content: messageContent,
    campaign_id: campaign.id,
    ...(waMessageId ? { whatsapp_msg_id: waMessageId } : {}),
  });

  await supabase
    .from("conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversation.id);
}

async function finalizeCompletedCampaigns(campaignIds: string[]) {
  for (const id of campaignIds) {
    const { count: pending } = await supabase
      .from("campaign_recipients")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", id)
      .in("status", ["pending", "sending"]);

    if ((pending ?? 0) === 0) {
      const { count: sent } = await supabase
        .from("campaign_recipients")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", id)
        .in("status", ["sent", "delivered", "read"]);
      const { count: failed } = await supabase
        .from("campaign_recipients")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", id)
        .eq("status", "failed");

      await supabase
        .from("campaigns")
        .update({
          status: "done",
          sent_count: sent ?? 0,
          failed_count: failed ?? 0,
        })
        .eq("id", id);
    }
  }
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const workerSecret = process.env.WORKER_SECRET;

  if (cronSecret || workerSecret) {
    const valid =
      (cronSecret && authHeader === `Bearer ${cronSecret}`) ||
      (workerSecret && authHeader === `Bearer ${workerSecret}`);
    if (!valid) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // Reclaim any rows stuck in 'sending' from a previous crashed worker
  await supabase.rpc("reclaim_stuck_sending", { p_older_than_seconds: 120 });

  const { data: claimed, error: claimErr } = await supabase.rpc(
    "claim_pending_recipients",
    { p_limit: BATCH_SIZE }
  );

  if (claimErr) {
    return NextResponse.json({ error: claimErr.message }, { status: 500 });
  }
  if (!claimed || claimed.length === 0) {
    return NextResponse.json({ processed: 0, sent: 0, failed: 0 });
  }

  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const campaignCache = new Map<string, CampaignCache>();
  const touchedCampaigns = new Set<string>();

  let sentCount = 0;
  let failedCount = 0;

  for (const row of claimed as { id: string; campaign_id: string; phone: string }[]) {
    touchedCampaigns.add(row.campaign_id);
    const campaign = await fetchCampaign(row.campaign_id, campaignCache);
    if (!campaign) {
      await supabase
        .from("campaign_recipients")
        .update({ status: "failed", error: "Campaign missing" })
        .eq("id", row.id);
      failedCount++;
      continue;
    }

    try {
      const res = await fetch(
        `https://graph.facebook.com/${META_VERSION}/${phoneNumberId}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(buildMetaPayload(campaign, row.phone)),
        }
      );
      const result = await res.json();

      if (res.ok && !result.error) {
        const waMessageId = result.messages?.[0]?.id || null;
        await supabase
          .from("campaign_recipients")
          .update({ status: "sent", whatsapp_msg_id: waMessageId })
          .eq("id", row.id);
        sentCount++;
        try {
          await storeBroadcastInConversation(campaign, row.phone, waMessageId);
        } catch (convErr) {
          console.error("Broadcast conversation insert failed:", row.phone, convErr);
        }
      } else {
        const errorMsg = result.error?.message || JSON.stringify(result);
        await supabase
          .from("campaign_recipients")
          .update({ status: "failed", error: errorMsg })
          .eq("id", row.id);
        failedCount++;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Network error";
      await supabase
        .from("campaign_recipients")
        .update({ status: "failed", error: msg })
        .eq("id", row.id);
      failedCount++;
    }
  }

  await finalizeCompletedCampaigns([...touchedCampaigns]);

  return NextResponse.json({
    processed: claimed.length,
    sent: sentCount,
    failed: failedCount,
  });
}

export async function GET(request: NextRequest) {
  return POST(request);
}
