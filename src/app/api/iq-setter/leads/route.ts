import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import {
  sendWhatsAppMedia,
  sendWhatsAppMessage,
  sendWhatsAppTemplate,
} from "@/lib/whatsapp";
import {
  flattenTemplateParam,
  mediaTypeFromMime,
  renderTemplateBody,
  resolveLeadTypeTemplate,
  resolveTemplateBodyParams,
} from "@/lib/lead-types";
import { getDirectFormConfig, runDirectFormSequence } from "@/lib/direct-form";

const REQUIRED_FIELDS = ["lead_id", "phone", "name", "lead_source", "lead_type"] as const;

// Hardcoded fallback used only when no DB row matches and no default row exists.
// Preserves pre-migration behavior so deploys are safe even before any lead_type_templates rows exist.
const FALLBACK_TEMPLATE_NAME = "order_tracking_link_bi";
const FALLBACK_TEMPLATE_LANGUAGE = "en";
const FALLBACK_TEMPLATE_HEADER_IMAGE_URL =
  "https://wlaimpmijyogcuhacqnv.supabase.co/storage/v1/object/public/campaign-images/campaign-headers/1777179532533.png";
const FALLBACK_TEMPLATE_BODY_TEXT =
  "Thanks for your enquiry! To help you better, may I understand your requirement so our 20+ years of real estate experience can serve you in the best way: 1) Investment or self-use, 2) Your preferred budget, 3) Suitable time for a call or meeting. This will help us suggest the most suitable options for you 😊";

// Fallback to "sir" when name is missing, blank, or has no letter characters
// (covers mojibake like "????? ???" from upstream encoding issues)
function sanitizeName(raw: string | null | undefined): string {
  if (!raw) return "sir";
  const trimmed = raw.replace(/\s+/g, " ").trim();
  if (!trimmed) return "sir";
  if (!/\p{L}/u.test(trimmed)) return "sir";
  return trimmed;
}

export async function GET() {
  return Response.json({ status: "ok" });
}

export async function POST(request: NextRequest) {
  console.log("[iq-setter/leads] NEXT_PUBLIC_SUPABASE_URL:", process.env.NEXT_PUBLIC_SUPABASE_URL ? "set" : "MISSING");
  console.log("[iq-setter/leads] SUPABASE_SERVICE_ROLE_KEY:", process.env.SUPABASE_SERVICE_ROLE_KEY ? "set" : "MISSING");
  console.log("[iq-setter/leads] IQ_SETTER_API_KEY:", process.env.IQ_SETTER_API_KEY ? "set" : "MISSING");

  // Auth
  const apiKey = request.headers.get("x-api-key");
  if (!apiKey || apiKey !== process.env.IQ_SETTER_API_KEY) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Parse + validate
  const body = await request.json();
  console.log("[iq-setter/leads] incoming payload:", JSON.stringify(body));
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

  // Resolve template config from DB (exact lead_type → default → null)
  const tpl = await resolveLeadTypeTemplate(lead_type);

  // Insert lead record (link template id when matched)
  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .insert({
      lead_id,
      phone,
      name,
      lead_source,
      lead_type,
      lead_type_template_id: tpl?.id ?? null,
      status: "received",
    })
    .select()
    .single();
  console.log("[iq-setter/leads] lead insert result:", { data: lead, error: leadError });

  if (leadError) {
    console.error("Failed to insert lead:", leadError);
    return Response.json({ error: "Failed to create lead" }, { status: 500 });
  }

  // Find or create conversation
  const { data: existingConv } = await supabase
    .from("conversations")
    .select("id, source_type, opted_out, active_lead_type")
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
    // Backfill IQ Setter origin if conversation had no source yet, and pin lead_type
    const updates: Record<string, unknown> = {};
    if (!existingConv.source_type) {
      updates.source_type = "iq_setter";
      updates.source_lead_id = lead.id;
    }
    if (existingConv.active_lead_type !== lead_type) {
      updates.active_lead_type = lead_type;
    }
    if (Object.keys(updates).length > 0) {
      await supabase.from("conversations").update(updates).eq("id", existingConv.id);
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
          active_lead_type: lead_type,
        },
        { onConflict: "phone" }
      )
      .select()
      .single();
    console.log("[iq-setter/leads] conversation upsert result:", { data: newConv, error: newConvError });

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

  // ─── Direct-form takeover ───
  // If the global Direct-form sequence is enabled, use it for IQ Setter leads
  // too (treated as default reply across Facebook/web/other sources). Falls
  // through to the lead-type-template flow below when not configured.
  const directFormCfg = await getDirectFormConfig();
  if (
    conversationId &&
    directFormCfg?.enabled &&
    directFormCfg.messages.length > 0
  ) {
    const dfResult = await runDirectFormSequence({
      phone,
      name,
      conversationId,
      messages: directFormCfg.messages,
    });
    await supabase
      .from("conversations")
      .update({
        direct_form_template_sent_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", conversationId);
    const status = dfResult.errors.length === 0 ? "template_sent" : "partial";
    await supabase
      .from("leads")
      .update({
        status,
        template_sent: directFormCfg.messages.find((m) => m.type === "template")
          ?.template_name ?? null,
        error: dfResult.errors.length ? dfResult.errors.join(" | ") : null,
      })
      .eq("id", lead.id);

    return Response.json({
      success: true,
      message: "Lead received",
      template_used: "direct_form",
      sent: {
        directFormSent: dfResult.sentCount,
        errors: dfResult.errors,
      },
    });
  }

  // ─── Fallback: legacy lead-type send sequence: template → brochure → extra info ───
  const cleanName = sanitizeName(name);
  const sendResults = {
    templateSent: false,
    brochureSent: false,
    extraInfoSent: false,
    errors: [] as string[],
  };

  // 1. Welcome template
  const templateName = tpl?.template_name ?? FALLBACK_TEMPLATE_NAME;
  const templateLanguage = tpl?.template_language ?? FALLBACK_TEMPLATE_LANGUAGE;
  const templateHeaderImage =
    tpl?.template_header_image_url ?? FALLBACK_TEMPLATE_HEADER_IMAGE_URL;
  const templateBodyText = tpl?.template_body_text || FALLBACK_TEMPLATE_BODY_TEXT;
  const templateBodyParams = resolveTemplateBodyParams(tpl?.template_body_params, {
    name: cleanName,
    bodyText: templateBodyText,
  });
  // Meta rejects newlines/tabs/4+ spaces in body params (error 132018) — flatten for the API
  // call only; the DB/messages copy keeps the original line breaks for readability.
  const wireParams = templateBodyParams.map(flattenTemplateParam);

  try {
    await sendWhatsAppTemplate(
      phone,
      templateName,
      templateLanguage,
      wireParams,
      templateHeaderImage || undefined
    );
    sendResults.templateSent = true;
    if (conversationId) {
      await supabase.from("messages").insert({
        conversation_id: conversationId,
        role: "assistant",
        content: renderTemplateBody(templateBodyText, templateBodyParams),
        media_url: templateHeaderImage || null,
        media_type: templateHeaderImage ? "image" : null,
      });
    }
  } catch (err) {
    console.error("Failed to send WhatsApp template:", err);
    sendResults.errors.push(`template:${String(err)}`);
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

  // 2. Brochure (only when configured)
  if (tpl?.brochure_url) {
    try {
      const mediaType = mediaTypeFromMime(tpl.brochure_mime);
      await sendWhatsAppMedia(
        phone,
        mediaType,
        tpl.brochure_url,
        tpl.brochure_caption ?? undefined,
        mediaType === "document"
          ? tpl.brochure_filename ?? "brochure.pdf"
          : undefined
      );
      sendResults.brochureSent = true;
      if (conversationId) {
        await supabase.from("messages").insert({
          conversation_id: conversationId,
          role: "assistant",
          content: tpl.brochure_caption ?? "",
          media_url: tpl.brochure_url,
          media_type: mediaType,
        });
      }
    } catch (err) {
      console.error("Failed to send brochure:", err);
      sendResults.errors.push(`brochure:${String(err)}`);
    }
  }

  // 3. Extra info text (only when configured + non-empty)
  if (tpl?.extra_info_text && tpl.extra_info_text.trim()) {
    try {
      await sendWhatsAppMessage(phone, tpl.extra_info_text);
      sendResults.extraInfoSent = true;
      if (conversationId) {
        await supabase.from("messages").insert({
          conversation_id: conversationId,
          role: "assistant",
          content: tpl.extra_info_text,
        });
      }
    } catch (err) {
      console.error("Failed to send extra info:", err);
      sendResults.errors.push(`extra_info:${String(err)}`);
    }
  }

  // Final lead status
  const finalStatus = sendResults.errors.length === 0 ? "template_sent" : "partial";
  await supabase
    .from("leads")
    .update({
      status: finalStatus,
      template_sent: templateName,
      error: sendResults.errors.length ? sendResults.errors.join(" | ") : null,
    })
    .eq("id", lead.id);

  return Response.json({
    success: true,
    message: "Lead received",
    template_used: tpl?.lead_type ?? "fallback",
    sent: sendResults,
  });
}
