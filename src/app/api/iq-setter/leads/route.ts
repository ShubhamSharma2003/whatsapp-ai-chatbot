import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendWhatsAppTemplate } from "@/lib/whatsapp";

const REQUIRED_FIELDS = ["phone", "name", "lead_source", "lead_type"] as const;
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

  const { phone, name, lead_source, lead_type } = body as {
    phone: string;
    name: string;
    lead_source: string;
    lead_type: string;
  };

  // Insert lead record
  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .insert({ phone, name, lead_source, lead_type, status: "received" })
    .select()
    .single();

  if (leadError) {
    console.error("Failed to insert lead:", leadError);
    return Response.json({ error: "Failed to create lead" }, { status: 500 });
  }

  // Find or create conversation
  const { data: existingConv } = await supabase
    .from("conversations")
    .select()
    .eq("phone", phone)
    .single();

  let conversationId: string;

  if (existingConv) {
    conversationId = existingConv.id;
  } else {
    const { data: newConv, error: newConvError } = await supabase
      .from("conversations")
      .upsert({ phone, name }, { onConflict: "phone" })
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
  }

  return Response.json({ success: true, message: "Lead received" });
}
