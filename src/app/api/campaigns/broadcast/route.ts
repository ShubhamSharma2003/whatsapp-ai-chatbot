import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  const { name, templateName, templateLanguage, phones, templateParams, headerImageUrl, templateBody } = await request.json();

  console.log("Broadcast — headerImageUrl:", headerImageUrl);

  if (!name || !templateName || !phones?.length) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Create campaign record
  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .insert({
      name,
      template_name: templateName,
      template_language: templateLanguage || "en",
      status: "sending",
      total_recipients: phones.length,
    })
    .select()
    .single();

  if (campaignError || !campaign) {
    return NextResponse.json({ error: "Failed to create campaign" }, { status: 500 });
  }

  // Insert all recipients as pending
  const recipientRows = phones.map((phone: string) => ({
    campaign_id: campaign.id,
    phone: phone.trim(),
    status: "pending",
  }));
  await supabase.from("campaign_recipients").insert(recipientRows);

  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

  let sentCount = 0;
  let failedCount = 0;
  const errors: Record<string, string> = {};

  for (const phone of phones) {
    const cleanPhone = phone.trim();
    try {
      const components = [
        ...(headerImageUrl
          ? [{ type: "header", parameters: [{ type: "image", image: { link: headerImageUrl } }] }]
          : []),
        ...(templateParams && Object.keys(templateParams).length > 0
          ? [{
              type: "body",
              parameters: Object.keys(templateParams)
                .sort((a, b) => Number(a) - Number(b))
                .map((key) => ({ type: "text", text: templateParams[key] })),
            }]
          : []),
      ];

      const metaPayload = {
        messaging_product: "whatsapp",
        to: cleanPhone,
        type: "template",
        template: {
          name: templateName,
          language: { code: templateLanguage || "en" },
          components,
        },
      };

      console.log("Sending to Meta:", JSON.stringify(metaPayload));

      const res = await fetch(
        `https://graph.facebook.com/v22.0/${phoneNumberId}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(metaPayload),
        }
      );
      const result = await res.json();

      if (res.ok && !result.error) {
        await supabase
          .from("campaign_recipients")
          .update({ status: "sent" })
          .eq("campaign_id", campaign.id)
          .eq("phone", cleanPhone);
        sentCount++;

        // Store broadcast message in conversations so it appears on the dashboard
        try {
          // Find or create conversation for this phone
          let { data: conversation } = await supabase
            .from("conversations")
            .select("id")
            .eq("phone", cleanPhone)
            .single();

          if (!conversation) {
            const { data: newConvo } = await supabase
              .from("conversations")
              .insert({ phone: cleanPhone })
              .select("id")
              .single();
            conversation = newConvo;
          }

          if (conversation) {
            // Build the full resolved message from the template body
            let resolvedBody = templateBody || "";
            if (templateParams) {
              resolvedBody = resolvedBody.replace(/\{\{(\d+)\}\}/g, (_: string, num: string) => templateParams[num] || `{{${num}}}`);
            }
            const messageContent = `📢 Broadcast: ${templateName}\n${resolvedBody}${headerImageUrl ? `\n[Image: ${headerImageUrl}]` : ""}`;

            const waMessageId = result.messages?.[0]?.id || null;

            await supabase.from("messages").insert({
              conversation_id: conversation.id,
              role: "assistant",
              content: messageContent,
              ...(waMessageId ? { whatsapp_msg_id: waMessageId } : {}),
            });

            await supabase
              .from("conversations")
              .update({ updated_at: new Date().toISOString() })
              .eq("id", conversation.id);
          }
        } catch (convErr) {
          console.error("Failed to store broadcast in conversation for", cleanPhone, convErr);
        }
      } else {
        const errorMsg = result.error?.message || JSON.stringify(result);
        console.error(`Meta API error for ${cleanPhone}:`, JSON.stringify(result));
        errors[cleanPhone] = errorMsg;
        await supabase
          .from("campaign_recipients")
          .update({ status: "failed", error: errorMsg })
          .eq("campaign_id", campaign.id)
          .eq("phone", cleanPhone);
        failedCount++;
      }
    } catch (e) {
      console.error("Network error for", cleanPhone, e);
      await supabase
        .from("campaign_recipients")
        .update({ status: "failed", error: "Network error" })
        .eq("campaign_id", campaign.id)
        .eq("phone", cleanPhone);
      failedCount++;
    }
  }

  await supabase
    .from("campaigns")
    .update({ status: "done", sent_count: sentCount, failed_count: failedCount })
    .eq("id", campaign.id);

  return NextResponse.json({ success: true, campaignId: campaign.id, sentCount, failedCount, errors });
}
