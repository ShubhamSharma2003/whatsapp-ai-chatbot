import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

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
  } = await request.json();

  if (!name || !templateName || !phones?.length) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const hasButtons = Array.isArray(templateButtons) && templateButtons.length > 0;

  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .insert({
      name,
      template_name: templateName,
      template_language: templateLanguage || "en",
      status: "sending",
      total_recipients: phones.length,
      has_buttons: hasButtons,
      template_buttons: hasButtons ? templateButtons : null,
      template_params: templateParams || null,
      header_image_url: headerImageUrl || null,
      template_body: templateBody || null,
    })
    .select()
    .single();

  if (campaignError || !campaign) {
    return NextResponse.json({ error: "Failed to create campaign" }, { status: 500 });
  }

  const seen = new Set<string>();
  const recipientRows = phones
    .map((phone: string) => phone.trim())
    .filter((p: string) => p && !seen.has(p) && (seen.add(p), true))
    .map((phone: string) => ({
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
    campaignId: campaign.id,
    queued: recipientRows.length,
  });
}
