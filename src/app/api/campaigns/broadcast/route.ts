import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendTemplate } from "@/lib/campaign-send";

const INLINE_THRESHOLD = 10;

export async function POST(request: NextRequest) {
  const {
    name,
    templateName,
    templateLanguage,
    phones,
    templateParams,
    headerImageUrl,
    templateBody,
    templateButtons,
    systemPrompt,
  } = await request.json();

  if (!name || !templateName || !phones?.length) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const hasButtons = Array.isArray(templateButtons) && templateButtons.length > 0;

  const seen = new Set<string>();
  const dedupedPhones: string[] = (phones as string[])
    .map((p) => p.trim())
    .filter((p) => p && !seen.has(p) && (seen.add(p), true));

  const inline = dedupedPhones.length <= INLINE_THRESHOLD;

  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .insert({
      name,
      template_name: templateName,
      template_language: templateLanguage || "en",
      status: inline ? "sending" : "pending",
      total_recipients: dedupedPhones.length,
      has_buttons: hasButtons,
      template_buttons: hasButtons ? templateButtons : null,
      template_params: templateParams || null,
      header_image_url: headerImageUrl || null,
      template_body: templateBody || null,
      system_prompt: systemPrompt?.trim() || null,
    })
    .select()
    .single();

  if (campaignError || !campaign) {
    console.error("[broadcast] Failed to insert campaign:", campaignError);
    return NextResponse.json(
      {
        error: "Failed to create campaign",
        detail: campaignError?.message ?? null,
        code: campaignError?.code ?? null,
        hint: campaignError?.hint ?? null,
      },
      { status: 500 }
    );
  }

  if (!inline) {
    const recipientRows = dedupedPhones.map((phone) => ({
      campaign_id: campaign.id,
      phone,
      status: "pending",
    }));

    const { error: insertError } = await supabase
      .from("campaign_recipients")
      .insert(recipientRows);

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      mode: "queued",
      campaignId: campaign.id,
      queued: recipientRows.length,
    });
  }

  const results = await Promise.all(
    dedupedPhones.map((phone) =>
      sendTemplate({
        templateName,
        templateLanguage: templateLanguage || "en",
        templateParams: templateParams || null,
        headerImageUrl: headerImageUrl || null,
        phone,
      })
    )
  );

  const recipientRows = results.map((r) => ({
    campaign_id: campaign.id,
    phone: r.phone,
    status: r.ok ? "sent" : "failed",
    whatsapp_msg_id: r.waMessageId,
    error: r.errorMsg,
  }));

  const { error: insertError } = await supabase
    .from("campaign_recipients")
    .insert(recipientRows);

  if (insertError) {
    console.error("[broadcast] recipients insert failed:", insertError);
  }

  const sentCount = results.filter((r) => r.ok).length;
  const failedCount = results.length - sentCount;

  await supabase
    .from("campaigns")
    .update({
      status: "done",
      sent_count: sentCount,
      failed_count: failedCount,
    })
    .eq("id", campaign.id);

  return NextResponse.json({
    success: true,
    mode: "inline",
    campaignId: campaign.id,
    sentCount,
    failedCount,
  });
}
