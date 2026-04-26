import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendWhatsAppTemplate } from "@/lib/whatsapp";

const REQUIRED_FIELDS = ["lead_id", "phone", "name", "lead_source", "lead_type"] as const;
const TEMPLATE_NAME = "order_tracking_link_bi";
const TEMPLATE_LANGUAGE = "en";
const TEMPLATE_HEADER_IMAGE_URL =
  "https://wlaimpmijyogcuhacqnv.supabase.co/storage/v1/object/public/campaign-images/campaign-headers/1777179532533.png";
// Flattened: Meta rejects newlines and 4+ consecutive spaces in body variables (error 132018)
const TEMPLATE_BODY_TEXT =
  "To help you better, may I understand your requirement so our 20+ years of real estate experience can serve you in the best way: 1) Investment or self-use, 2) Your preferred budget, 3) Suitable time for a call or meeting. This will help us suggest the most suitable options for you 😊";

// Fallback to "sir" when name is missing, blank, or has no letter characters
// (covers mojibake like "????? ???" from upstream encoding issues)
function sanitizeName(raw: string | null | undefined): string {
  if (!raw) return "sir";
  const trimmed = raw.replace(/\s+/g, " ").trim();
  if (!trimmed) return "sir";
  if (!/\p{L}/u.test(trimmed)) return "sir";
  return trimmed;
}

export async function POST(request: NextRequest) {
  // Auth
  const apiKey = request.headers.get("x-api-key");
  if (!apiKey || apiKey !== process.env.IQ_SETTER_API_KEY) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Parse + validate
  const body = await request.json();
  for (const field of REQUIRED_FIELDS) {
    if (!body[field]) {
      return Response.json(
        { error: `Missing required field: ${field}` },
        { status: 400 }
      );
    }
  }

  const { lead_id, phone, name, lead_source, lead_type } = body as {
    lead_id: string;
    phone: string;
    name: string;
    lead_source: string;
    lead_type: string;
  };

  // Idempotency: same lead_id arriving twice (IQ Setter retry) returns prior result
  const { data: existingLead } = await supabase
    .from("leads")
    .select("id, status")
    .eq("lead_id", lead_id)
    .maybeSingle();

  if (existingLead) {
    return Response.json({
      success: true,
      message: "Lead already received",
      duplicate: true,
      status: existingLead.status,
    });
  }

  // Insert lead record
  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .insert({ lead_id, phone, name, lead_source, lead_type, status: "received" })
    .select()
    .single();

  if (leadError) {
    console.error("Failed to insert lead:", leadError);
    return Response.json({ error: "Failed to create lead" }, { status: 500 });
  }

  // Find or create conversation
  const { data: existingConv } = await supabase
    .from("conversations")
    .select("id, source_type, opted_out")
    .eq("phone", phone)
    .maybeSingle();

  // Honor prior opt-out: never re-send templates to unsubscribed users
  if (existingConv?.opted_out) {
    await supabase
      .from("leads")
      .update({
        status: "opted_out_skipped",
        conversation_id: existingConv.id,
      })
      .eq("id", lead.id);
    return Response.json({
      success: true,
      message: "Lead saved but recipient previously opted out; template not sent",
      opted_out: true,
    });
  }

  let conversationId: string | undefined;

  if (existingConv) {
    conversationId = existingConv.id;
    // Backfill IQ Setter origin if conversation had no source yet
    if (!existingConv.source_type) {
      await supabase
        .from("conversations")
        .update({ source_type: "iq_setter", source_lead_id: lead.id })
        .eq("id", existingConv.id);
    }
  } else {
    const { data: newConv, error: newConvError } = await supabase
      .from("conversations")
      .upsert(
        {
          phone,
          name,
          source_type: "iq_setter",
          source_lead_id: lead.id,
        },
        { onConflict: "phone" }
      )
      .select()
      .single();
    if (newConvError) {
      console.error("Failed to create conversation:", newConvError);
    }
    conversationId = newConv?.id;
  }

  // Link conversation to lead
  if (conversationId) {
    await supabase
      .from("leads")
      .update({ conversation_id: conversationId })
      .eq("id", lead.id);
  }

  // Send WhatsApp template
  try {
    await sendWhatsAppTemplate(
      phone,
      TEMPLATE_NAME,
      TEMPLATE_LANGUAGE,
      [sanitizeName(name), TEMPLATE_BODY_TEXT],
      TEMPLATE_HEADER_IMAGE_URL
    );
    await supabase
      .from("leads")
      .update({ status: "template_sent", template_sent: TEMPLATE_NAME })
      .eq("id", lead.id);
  } catch (err) {
    console.error("Failed to send WhatsApp template:", err);
    await supabase
      .from("leads")
      .update({ status: "failed", error: String(err) })
      .eq("id", lead.id);
    return Response.json(
      {
        success: false,
        message: "Lead saved but WhatsApp template failed",
        error: String(err),
      },
      { status: 502 }
    );
  }

  return Response.json({ success: true, message: "Lead received" });
}
