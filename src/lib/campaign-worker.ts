import { supabase } from "@/lib/supabase";
import { sendTemplate, SendResult } from "@/lib/campaign-send";

const BATCH_SIZE = 20;

type CampaignCache = {
  id: string;
  template_name: string;
  template_language: string;
  template_params: Record<string, string> | null;
  header_image_url: string | null;
  header_media_type: "image" | "document" | "video" | null;
  header_filename: string | null;
  template_body: string | null;
  status: string;
};

async function fetchCampaign(id: string, cache: Map<string, CampaignCache>) {
  if (cache.has(id)) return cache.get(id)!;
  const { data } = await supabase
    .from("campaigns")
    .select(
      "id, template_name, template_language, template_params, header_image_url, header_media_type, header_filename, template_body, status"
    )
    .eq("id", id)
    .single();
  if (data) cache.set(id, data as CampaignCache);
  return data as CampaignCache | null;
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

export async function runCampaignWorker(): Promise<{
  processed: number;
  sent: number;
  failed: number;
  error?: string;
}> {
  await supabase.rpc("reclaim_stuck_sending", { p_older_than_seconds: 120 });

  const { data: claimed, error: claimErr } = await supabase.rpc(
    "claim_pending_recipients",
    { p_limit: BATCH_SIZE }
  );

  if (claimErr) {
    return { processed: 0, sent: 0, failed: 0, error: claimErr.message };
  }
  if (!claimed || claimed.length === 0) {
    return { processed: 0, sent: 0, failed: 0 };
  }

  type ClaimRow = { id: string; campaign_id: string; phone: string };
  const rows = claimed as ClaimRow[];

  const campaignCache = new Map<string, CampaignCache>();
  const touchedCampaigns = new Set<string>();
  const uniqueCampaignIds = [...new Set(rows.map((r) => r.campaign_id))];
  await Promise.all(uniqueCampaignIds.map((id) => fetchCampaign(id, campaignCache)));

  type RowResult = { row: ClaimRow; result: SendResult };

  const results: RowResult[] = await Promise.all(
    rows.map(async (row): Promise<RowResult> => {
      touchedCampaigns.add(row.campaign_id);
      const campaign = campaignCache.get(row.campaign_id);
      if (!campaign) {
        return {
          row,
          result: {
            phone: row.phone,
            ok: false,
            waMessageId: null,
            errorMsg: "Campaign missing",
          },
        };
      }
      const result = await sendTemplate({
        templateName: campaign.template_name,
        templateLanguage: campaign.template_language,
        templateParams: campaign.template_params,
        headerImageUrl: campaign.header_image_url,
        headerMediaType: campaign.header_media_type,
        headerFilename: campaign.header_filename,
        phone: row.phone,
      });
      return { row, result };
    })
  );

  let sentCount = 0;
  let failedCount = 0;

  await Promise.all(
    results.map(({ row, result }) => {
      if (result.ok) {
        sentCount++;
        return supabase
          .from("campaign_recipients")
          .update({ status: "sent", whatsapp_msg_id: result.waMessageId })
          .eq("id", row.id);
      }
      failedCount++;
      return supabase
        .from("campaign_recipients")
        .update({ status: "failed", error: result.errorMsg })
        .eq("id", row.id);
    })
  );

  await finalizeCompletedCampaigns([...touchedCampaigns]);

  return {
    processed: claimed.length,
    sent: sentCount,
    failed: failedCount,
  };
}
