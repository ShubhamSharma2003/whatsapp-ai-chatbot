import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendWhatsAppTemplate } from "@/lib/whatsapp";

const REQUIRED_FIELDS = ["lead_id", "phone", "name", "lead_source", "lead_type"] as const;
const PLACEHOLDER_TEMPLATE = "hello_world";
const PLACEHOLDER_LANGUAGE = "en_US";

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
    .select("id, source_type")
    .eq("phone", phone)
    .maybeSingle();

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
    await sendWhatsAppTemplate(phone, PLACEHOLDER_TEMPLATE, PLACEHOLDER_LANGUAGE);
    await supabase
      .from("leads")
      .update({ status: "template_sent", template_sent: PLACEHOLDER_TEMPLATE })
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
