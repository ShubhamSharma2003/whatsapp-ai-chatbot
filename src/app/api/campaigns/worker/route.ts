import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BATCH_SIZE = 20;
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

  type ClaimRow = { id: string; campaign_id: string; phone: string };
  const rows = claimed as ClaimRow[];

  // Prefetch all referenced campaigns in parallel (cache populated)
  const uniqueCampaignIds = [...new Set(rows.map((r) => r.campaign_id))];
  await Promise.all(uniqueCampaignIds.map((id) => fetchCampaign(id, campaignCache)));

  type SendResult = {
    row: ClaimRow;
    ok: boolean;
    waMessageId: string | null;
    errorMsg: string | null;
  };

  // Send all Meta calls in parallel
  const results: SendResult[] = await Promise.all(
    rows.map(async (row): Promise<SendResult> => {
      touchedCampaigns.add(row.campaign_id);
      const campaign = campaignCache.get(row.campaign_id);
      if (!campaign) {
        return { row, ok: false, waMessageId: null, errorMsg: "Campaign missing" };
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
          return {
            row,
            ok: true,
            waMessageId: result.messages?.[0]?.id || null,
            errorMsg: null,
          };
        }
        return {
          row,
          ok: false,
          waMessageId: null,
          errorMsg: result.error?.message || JSON.stringify(result),
        };
      } catch (e) {
        return {
          row,
          ok: false,
          waMessageId: null,
          errorMsg: e instanceof Error ? e.message : "Network error",
        };
      }
    })
  );

  // Apply recipient status updates in parallel
  await Promise.all(
    results.map((r) => {
      if (r.ok) {
        sentCount++;
        return supabase
          .from("campaign_recipients")
          .update({ status: "sent", whatsapp_msg_id: r.waMessageId })
          .eq("id", r.row.id);
      }
      failedCount++;
      return supabase
        .from("campaign_recipients")
        .update({ status: "failed", error: r.errorMsg })
        .eq("id", r.row.id);
    })
  );

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
