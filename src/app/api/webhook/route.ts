import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { getAIResponse, isAutoReplyEnabled, getDefaultConversationMode } from "@/lib/ai";

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

  console.log("=== WEBHOOK RECEIVED ===");
  console.log("Full body:", JSON.stringify(body, null, 2));
  console.log("Object type:", body.object);

  // Only process whatsapp_business_account events
  if (body.object !== "whatsapp_business_account") {
    console.log("❌ Ignored - wrong object type:", body.object);
    return Response.json({ status: "ignored" });
  }

  const entry = body.entry?.[0];
  const changes = entry?.changes?.[0];
  const value = changes?.value;

  console.log("Entry:", JSON.stringify(entry, null, 2));
  console.log("Value:", JSON.stringify(value, null, 2));

  // ─── Handle status updates (delivered, read) for campaign tracking ───
  if (value?.statuses?.length && !value?.messages?.length) {
    for (const status of value.statuses) {
      const msgId = status.id;
      const statusName = status.status; // sent, delivered, read, failed
      console.log(`📊 Status update: ${msgId} → ${statusName}`);

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
    console.log("❌ No message found:", value?.statuses);
    return Response.json({ status: "no_message" });
  }

  console.log("✅ Message found:", value.messages[0]);

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
    console.log("🔘 Button reply received:", text);
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
    console.log("🔘 Interactive reply received:", text);
  } else {
    // Ignore media and other non-text types
    return Response.json({ status: "non_text" });
  }

  if (!text) {
    return Response.json({ status: "empty_message" });
  }

  try {
    console.log("📱 Processing message from:", phone);
    console.log("📝 Message text:", text);

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

    if (convoError) {
      console.log("⚠️ Conversation query error:", convoError);
    }

    if (!conversation) {
      console.log("🆕 Creating new conversation for:", phone);
      const sourceType = repliedToCampaignId ? "campaign" : "direct";
      // Campaign-originated chats always start in agent mode (button reply will
      // route through AI). Direct inbound respects the global default.
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
      console.log("✅ Conversation created:", conversation.id);
    } else if (name && name !== conversation.name) {
      console.log("📝 Updating conversation name:", name);
      await supabase
        .from("conversations")
        .update({ name })
        .eq("id", conversation.id);
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
    console.log("💾 Storing message in conversation:", conversation.id);
    const { error: insertError } = await supabase.from("messages").insert({
      conversation_id: conversation.id,
      role: "user",
      content: text,
      whatsapp_msg_id: whatsappMsgId,
      campaign_id: repliedToCampaignId,
    }).select();

    if (insertError?.code === "23505") {
      console.log("⚠️ Duplicate message, ignoring");
      return Response.json({ status: "duplicate" });
    }
    if (insertError) {
      console.error("❌ Failed to store message:", insertError);
      return Response.json({ error: insertError.message }, { status: 500 });
    }
    console.log("✅ Message stored successfully");

    // Update conversation timestamp
    await supabase
      .from("conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", conversation.id);

    // ─── Opt-out handling ───
    // If user already opted out: store message (already done above), stay silent.
    if (conversation.opted_out) {
      console.log("🚫 Opted-out user, no reply:", phone);
      return Response.json({ status: "opted_out_silent" });
    }

    // Newly triggering opt-out keyword: flag, send single confirmation, stop.
    if (!isButtonReply && isOptOutKeyword(text)) {
      console.log("🚫 Opt-out keyword received from:", phone);
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

    // ─── Determine whether AI should auto-reply ───
    // Button replies from campaign templates ALWAYS trigger AI chat (switch to agent mode)
    let shouldAutoReply = false;

    if (isButtonReply && repliedToCampaignId) {
      // Campaign button click → always start AI chat, switch conversation to agent mode
      console.log("🤖 Button click on campaign template — activating AI agent");
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

    // Fetch conversation history (last 20 messages for context)
    const { data: historyDesc } = await supabase
      .from("messages")
      .select("role, content")
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

    // Get AI response
    const aiResponse = await getAIResponse(
      (history || []).map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      campaignSystemPrompt
    );

    // Send response via WhatsApp
    const waResult = await sendWhatsAppMessage(phone, aiResponse);
    console.log("WhatsApp send result:", JSON.stringify(waResult));

    // Store AI response
    await supabase.from("messages").insert({
      conversation_id: conversation.id,
      role: "assistant",
      content: aiResponse,
    });

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
