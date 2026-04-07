import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { getAIResponse, isAutoReplyEnabled } from "@/lib/ai";

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
          const { data: camp } = await supabase.from("campaigns").select("delivered_count").eq("id", recipient.campaign_id).single();
          if (camp) {
            await supabase.from("campaigns").update({ delivered_count: (camp.delivered_count || 0) + 1 }).eq("id", recipient.campaign_id);
          }
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
          // If it jumped from sent → read (skipped delivered), count both
          if (!recipient.delivered_at) {
            await supabase.from("campaign_recipients").update({ delivered_at: new Date().toISOString() }).eq("whatsapp_msg_id", msgId);
            const { data: camp } = await supabase.from("campaigns").select("delivered_count").eq("id", recipient.campaign_id).single();
            if (camp) {
              await supabase.from("campaigns").update({ delivered_count: (camp.delivered_count || 0) + 1 }).eq("id", recipient.campaign_id);
            }
          }
          const { data: camp } = await supabase.from("campaigns").select("read_count").eq("id", recipient.campaign_id).single();
          if (camp) {
            await supabase.from("campaigns").update({ read_count: (camp.read_count || 0) + 1 }).eq("id", recipient.campaign_id);
          }
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
      const { data: newConvo, error: insertConvoError } = await supabase
        .from("conversations")
        .insert({ phone, name })
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

    // ─── Track campaign reply if this is a reply to a broadcast message ───
    let repliedToCampaignId: string | null = null;

    // Check if the context references a campaign message
    const contextMsgId = message.context?.id;
    if (contextMsgId) {
      // Look up the campaign recipient by the original broadcast message id
      const { data: recipient } = await supabase
        .from("campaign_recipients")
        .select("campaign_id, replied_at")
        .eq("whatsapp_msg_id", contextMsgId)
        .single();

      if (recipient) {
        repliedToCampaignId = recipient.campaign_id;
        // Mark first reply only
        if (!recipient.replied_at) {
          await supabase
            .from("campaign_recipients")
            .update({ replied_at: new Date().toISOString() })
            .eq("whatsapp_msg_id", contextMsgId);
          // Increment replied_count on campaign
          const { data: camp } = await supabase.from("campaigns").select("replied_count").eq("id", recipient.campaign_id).single();
          if (camp) {
            await supabase.from("campaigns").update({ replied_count: (camp.replied_count || 0) + 1 }).eq("id", recipient.campaign_id);
          }
        }
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

    // Get AI response
    const aiResponse = await getAIResponse(
      (history || []).map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }))
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
