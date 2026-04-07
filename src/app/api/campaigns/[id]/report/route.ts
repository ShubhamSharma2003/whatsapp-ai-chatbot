import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Fetch campaign
  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .select("*")
    .eq("id", id)
    .single();

  if (campaignError || !campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  // Fetch all recipients with their statuses
  const { data: recipients } = await supabase
    .from("campaign_recipients")
    .select("phone, status, error, whatsapp_msg_id, delivered_at, read_at, replied_at, created_at")
    .eq("campaign_id", id)
    .order("created_at", { ascending: true });

  // Compute live counts from recipients (more accurate than cached counters)
  const allRecipients = recipients || [];
  const sentCount = allRecipients.filter((r) => ["sent", "delivered", "read"].includes(r.status)).length;
  const deliveredCount = allRecipients.filter((r) => ["delivered", "read"].includes(r.status) || r.delivered_at).length;
  const readCount = allRecipients.filter((r) => r.status === "read" || r.read_at).length;
  const repliedCount = allRecipients.filter((r) => r.replied_at).length;
  const failedCount = allRecipients.filter((r) => r.status === "failed").length;

  return NextResponse.json({
    campaign: {
      ...campaign,
      // Override with live-computed counts
      sent_count: sentCount,
      delivered_count: deliveredCount,
      read_count: readCount,
      replied_count: repliedCount,
      failed_count: failedCount,
    },
    recipients: allRecipients,
    summary: {
      total: campaign.total_recipients,
      sent: sentCount,
      delivered: deliveredCount,
      read: readCount,
      replied: repliedCount,
      failed: failedCount,
      delivery_rate: sentCount > 0 ? Math.round((deliveredCount / sentCount) * 100) : 0,
      read_rate: deliveredCount > 0 ? Math.round((readCount / deliveredCount) * 100) : 0,
      reply_rate: sentCount > 0 ? Math.round((repliedCount / sentCount) * 100) : 0,
    },
  });
}
