import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendWhatsAppMedia, sendWhatsAppMessage } from "@/lib/whatsapp";
import { getAIResponse, isAutoReplyEnabled, getDefaultConversationMode } from "@/lib/ai";
import {
  getCompanyProfileAttachment,
  getDirectFormConfig,
  matchesDirectFormPhrase,
  runDirectFormSequence,
} from "@/lib/direct-form";

const OPT_OUT_KEYWORDS = new Set([
  "stop",
  "unsubscribe",
  "cancel",
  "end",
  "quit",
  "stop all",
]);
const OPT_OUT_CONFIRMATION =
  "You've been unsubscribed and will no longer receive messages from us.";

// Phrase baked into the website's floating WhatsApp-button prefill text.
// First inbound message containing this exact phrase tags the convo as
// 'website'. Phrase IS the message content, so it is NOT stripped — the AI
// sees it as a normal greeting and replies accordingly.
const WEBSITE_BUTTON_PHRASE =
  "Hi! I'm interested in a property. Could you please help me?";

function normalizeForMarker(s: string): string {
  return s.toLowerCase().replace(/[\s​]+/g, " ").trim();
}

function hasWebsiteButtonPhrase(text: string): boolean {
  return normalizeForMarker(text).includes(normalizeForMarker(WEBSITE_BUTTON_PHRASE));
}

function isOptOutKeyword(raw: string): boolean {
  const normalized = raw.trim().toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "");
  return OPT_OUT_KEYWORDS.has(normalized);
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(challenge, { status: 200 });
  }

  return new Response("Forbidden", { status: 403 });
}

export async function POST(request: NextRequest) {
  const body = await request.json();

  // Only process whatsapp_business_account events
  if (body.object !== "whatsapp_business_account") {
    return Response.json({ status: "ignored" });
  }

  const entry = body.entry?.[0];
  const changes = entry?.changes?.[0];
  const value = changes?.value;

  // ─── Handle status updates (delivered, read) for campaign tracking ───
  if (value?.statuses?.length && !value?.messages?.length) {
    for (const status of value.statuses) {
      const msgId = status.id;
      const statusName = status.status; // sent, delivered, read, failed

      if (statusName === "delivered") {
        const { data: recipient } = await supabase
          .from("campaign_recipients")
          .update({ status: "delivered", delivered_at: new Date().toISOString() })
          .eq("whatsapp_msg_id", msgId)
          .eq("status", "sent")
          .select("campaign_id")
          .single();
        if (recipient) {
          await supabase.rpc("increment_campaign_counter", {
            p_campaign_id: recipient.campaign_id,
            p_column: "delivered_count",
            p_delta: 1,
          });
        }
      } else if (statusName === "read") {
        const { data: recipient } = await supabase
          .from("campaign_recipients")
          .update({ status: "read", read_at: new Date().toISOString() })
          .eq("whatsapp_msg_id", msgId)
          .in("status", ["sent", "delivered"])
          .select("campaign_id, delivered_at")
          .single();
        if (recipient) {
          if (!recipient.delivered_at) {
            await supabase
              .from("campaign_recipients")
              .update({ delivered_at: new Date().toISOString() })
              .eq("whatsapp_msg_id", msgId);
            await supabase.rpc("increment_campaign_counter", {
              p_campaign_id: recipient.campaign_id,
              p_column: "delivered_count",
              p_delta: 1,
            });
          }
          await supabase.rpc("increment_campaign_counter", {
            p_campaign_id: recipient.campaign_id,
            p_column: "read_count",
            p_delta: 1,
          });
        }
      }
    }
    return Response.json({ status: "status_processed" });
  }

  // Only process actual messages
  if (!value?.messages?.[0]) {
    return Response.json({ status: "no_message" });
  }

  const message = value.messages[0];
  const contact = value.contacts?.[0];
  const phone = message.from;
  const name = contact?.profile?.name || null;
  const whatsappMsgId = message.id;

  // Determine message text — handle text, button replies, and interactive replies
  let text: string | null = null;
  let isButtonReply = false;

  if (message.type === "text") {
    text = message.text.body;
  } else if (message.type === "button") {
    // User clicked a QUICK_REPLY button on a template
    text = message.button?.text || message.button?.payload || null;
    isButtonReply = true;
  } else if (message.type === "interactive") {
    // Interactive list/button reply
    const interactive = message.interactive;
    if (interactive?.type === "button_reply") {
      text = interactive.button_reply?.title || null;
      isButtonReply = true;
    } else if (interactive?.type === "list_reply") {
      text = interactive.list_reply?.title || null;
      isButtonReply = true;
    }
  } else {
    // Ignore media and other non-text types
    return Response.json({ status: "non_text" });
  }

  if (!text) {
    return Response.json({ status: "empty_message" });
  }

  // Website button prefills its full phrase as the message body — match it
  // directly. No stripping: the phrase IS the user's question, so it stays
  // in storage and AI history as the opening turn.
  const hasWebsiteMarker = !isButtonReply && hasWebsiteButtonPhrase(text);

  try {
    // ─── Look up context recipient FIRST so a new conversation can be
    //     tagged with its source origin at insert time ───
    let repliedToCampaignId: string | null = null;
    let contextRecipient: { campaign_id: string; replied_at: string | null } | null = null;
    const contextMsgId = message.context?.id;
    if (contextMsgId) {
      const { data: recipient } = await supabase
        .from("campaign_recipients")
        .select("campaign_id, replied_at")
        .eq("whatsapp_msg_id", contextMsgId)
        .single();
      if (recipient) {
        contextRecipient = recipient;
        repliedToCampaignId = recipient.campaign_id;
      }
    }

    // Find or create conversation
    let { data: conversation, error: convoError } = await supabase
      .from("conversations")
      .select("*")
      .eq("phone", phone)
      .single();

    let convoSourceType: "campaign" | "direct" | "website" | null = null;
    if (!conversation) {
      const sourceType: "campaign" | "direct" | "website" = repliedToCampaignId
        ? "campaign"
        : hasWebsiteMarker
        ? "website"
        : "direct";
      convoSourceType = sourceType;
      // Campaign-originated chats always start in agent mode (button reply will
      // route through AI). Direct/website inbound respects the global default.
      const initialMode = repliedToCampaignId
        ? "agent"
        : await getDefaultConversationMode();
      const { data: newConvo, error: insertConvoError } = await supabase
        .from("conversations")
        .insert({
          phone,
          name,
          mode: initialMode,
          source_type: sourceType,
          source_campaign_id: repliedToCampaignId,
        })
        .select()
        .single();
      if (insertConvoError) {
        console.error("❌ Failed to create conversation:", insertConvoError);
        return Response.json({ error: insertConvoError.message }, { status: 500 });
      }
      conversation = newConvo;
    } else {
      // Existing conversation: backfill name + upgrade direct→website when the
      // marker arrives on a follow-up (returning visitor who clicked the
      // website button after a prior organic chat).
      const updates: Record<string, unknown> = {};
      if (name && name !== conversation.name) updates.name = name;
      if (hasWebsiteMarker && conversation.source_type === "direct") {
        updates.source_type = "website";
        conversation.source_type = "website";
      }
      if (Object.keys(updates).length > 0) {
        await supabase
          .from("conversations")
          .update(updates)
          .eq("id", conversation.id);
      }
    }

    if (!conversation) {
      console.error("❌ No conversation available");
      return Response.json({ error: "Failed to create conversation" }, { status: 500 });
    }

    // ─── Track campaign reply (counters + active campaign pinning) ───
    if (contextRecipient && repliedToCampaignId) {
      // Mark first reply only
      if (!contextRecipient.replied_at) {
        await supabase
          .from("campaign_recipients")
          .update({ replied_at: new Date().toISOString() })
          .eq("whatsapp_msg_id", contextMsgId);
        await supabase.rpc("increment_campaign_counter", {
          p_campaign_id: repliedToCampaignId,
          p_column: "replied_count",
          p_delta: 1,
        });
      }

      // Pin this campaign to the conversation so all follow-up messages
      // use the same campaign knowledge base (even without quoting the original)
      if (conversation.active_campaign_id !== repliedToCampaignId) {
        await supabase
          .from("conversations")
          .update({ active_campaign_id: repliedToCampaignId })
          .eq("id", conversation.id);
        conversation.active_campaign_id = repliedToCampaignId;
      }
    }

    // Store user message (ignore duplicates)
    const { error: insertError } = await supabase.from("messages").insert({
      conversation_id: conversation.id,
      role: "user",
      content: text,
      whatsapp_msg_id: whatsappMsgId,
      campaign_id: repliedToCampaignId,
    }).select();

    if (insertError?.code === "23505") {
      return Response.json({ status: "duplicate" });
    }
    if (insertError) {
      console.error("❌ Failed to store message:", insertError);
      return Response.json({ error: insertError.message }, { status: 500 });
    }

    // Update conversation timestamp
    await supabase
      .from("conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", conversation.id);

    // ─── Opt-out handling ───
    // If user already opted out: store message (already done above), stay silent.
    if (conversation.opted_out) {
      return Response.json({ status: "opted_out_silent" });
    }

    // Newly triggering opt-out keyword: flag, send single confirmation, stop.
    if (!isButtonReply && isOptOutKeyword(text)) {
      await supabase
        .from("conversations")
        .update({
          opted_out: true,
          opted_out_at: new Date().toISOString(),
          mode: "human",
        })
        .eq("id", conversation.id);

      try {
        await sendWhatsAppMessage(phone, OPT_OUT_CONFIRMATION);
        await supabase.from("messages").insert({
          conversation_id: conversation.id,
          role: "assistant",
          content: OPT_OUT_CONFIRMATION,
        });
      } catch (err) {
        console.error("Failed to send opt-out confirmation:", err);
      }

      return Response.json({ status: "opted_out" });
    }

    // ─── Direct-form welcome sequence ───
    // Fires once per direct- or website-source conversation. For 'direct'
    // (Meta lead-form preamble) the configured trigger phrase must match.
    // For 'website' (floating WA-button click) the [#WEB] marker is the
    // trigger — checked at the top of this handler — so phrase match is
    // skipped. The `direct_form_template_sent_at` stamp is the idempotency
    // gate. Not gated on isNewConvo because CTWA flows can prefix a "Hi" tap
    // before the form text arrives.
    const convoIsDirect =
      convoSourceType === "direct" || conversation.source_type === "direct";
    const convoIsWebsite =
      convoSourceType === "website" || conversation.source_type === "website";
    let directFormJustFired = false;
    if (
      (convoIsDirect || convoIsWebsite) &&
      !isButtonReply &&
      !conversation.direct_form_template_sent_at
    ) {
      const cfg = await getDirectFormConfig();
      const phraseOk = convoIsWebsite
        ? hasWebsiteMarker
        : cfg
        ? matchesDirectFormPhrase(text, cfg.phrase)
        : false;
      if (cfg?.enabled && cfg.messages.length > 0 && phraseOk) {
        await runDirectFormSequence({
          phone,
          name,
          conversationId: conversation.id,
          messages: cfg.messages,
        });
        await supabase
          .from("conversations")
          .update({
            direct_form_template_sent_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", conversation.id);
        directFormJustFired = true;
      }
    }

    // ─── Determine whether AI should auto-reply ───
    // Button replies from campaign templates ALWAYS trigger AI chat (switch to agent mode)
    let shouldAutoReply = false;

    if (isButtonReply && repliedToCampaignId) {
      // Campaign button click → always start AI chat, switch conversation to agent mode
      await supabase
        .from("conversations")
        .update({ mode: "agent" })
        .eq("id", conversation.id);
      shouldAutoReply = true;
    } else {
      // Normal message — follow existing logic
      const autoReply = await isAutoReplyEnabled();
      shouldAutoReply = conversation.mode !== "human" && autoReply;
    }

    if (!shouldAutoReply) {
      return Response.json({ status: "stored_for_human" });
    }

    // Skip AI for this turn when the direct-form welcome sequence already
    // sent the lead a template + brochure. The next inbound message picks up
    // AI as normal.
    if (directFormJustFired) {
      return Response.json({ status: "direct_form_sent" });
    }

    // Fetch conversation history with media flags so we can detect prior brochure sends
    const { data: historyDesc } = await supabase
      .from("messages")
      .select("role, content, media_type")
      .eq("conversation_id", conversation.id)
      .order("created_at", { ascending: false })
      .limit(20);
    const history = (historyDesc || []).reverse();

    // Fetch campaign-specific knowledge base if conversation is linked to a campaign
    let campaignSystemPrompt: string | null = null;
    const activeCampaignId = conversation.active_campaign_id || repliedToCampaignId;
    if (activeCampaignId) {
      const { data: campaign } = await supabase
        .from("campaigns")
        .select("system_prompt")
        .eq("id", activeCampaignId)
        .single();
      campaignSystemPrompt = campaign?.system_prompt || null;
    }

    // Fetch lead-type knowledge base for IQ Setter conversations
    let leadTypeSystemPrompt: string | null = null;
    if (conversation.active_lead_type) {
      const { data: lt } = await supabase
        .from("lead_type_templates")
        .select("system_prompt")
        .eq("lead_type", conversation.active_lead_type)
        .maybeSingle();
      leadTypeSystemPrompt = lt?.system_prompt || null;
    }

    // Detect prior assistant turns so the AI doesn't re-greet or re-offer the brochure.
    // 'document' or 'image' from an assistant role implies brochure or template header was sent.
    const assistantTurns = history.filter((m) => m.role === "assistant");
    const alreadyGreeted = assistantTurns.length > 0;
    const brochureSent = assistantTurns.some(
      (m) => m.media_type === "document" || m.media_type === "image"
    );

    // Get AI response
    const aiResponse = await getAIResponse(
      (history || []).map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      {
        campaignSystemPrompt,
        leadTypeSystemPrompt,
        alreadyGreeted,
        brochureSent,
      }
    );

    // Send response via WhatsApp
    await sendWhatsAppMessage(phone, aiResponse);

    // Store AI response
    await supabase.from("messages").insert({
      conversation_id: conversation.id,
      role: "assistant",
      content: aiResponse,
    });

    // ─── Auto-attach company profile when AI announces it ───
    // The system prompt tells the AI to mention sharing the profile on first
    // reply, but the AI can't actually deliver the file. If we haven't already
    // sent a brochure to this lead and the AI's text references the profile,
    // ship the configured PDF as a follow-up so the promise is kept.
    if (
      !brochureSent &&
      /company\s+profile|company['’]?s\s+profile|share\s+(?:the\s+)?profile/i.test(
        aiResponse
      )
    ) {
      const attachment = await getCompanyProfileAttachment();
      if (attachment) {
        try {
          await sendWhatsAppMedia(
            phone,
            "document",
            attachment.url,
            undefined,
            attachment.filename
          );
          await supabase.from("messages").insert({
            conversation_id: conversation.id,
            role: "assistant",
            content: "",
            media_url: attachment.url,
            media_type: "document",
          });
        } catch (err) {
          console.error("Failed to auto-send company profile:", err);
        }
      }
    }

    // Update conversation timestamp again
    await supabase
      .from("conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", conversation.id);

    return Response.json({ status: "replied" });
  } catch (error) {
    console.error("Webhook error:", error);
    return Response.json({ status: "error" }, { status: 500 });
  }
}
