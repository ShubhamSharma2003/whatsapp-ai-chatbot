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

  // Only process actual messages (not status updates)
  if (!value?.messages?.[0]) {
    console.log("❌ No message found. Status updates only:", value?.statuses);
    return Response.json({ status: "no_message" });
  }

  console.log("✅ Message found:", value.messages[0]);

  const message = value.messages[0];
  const contact = value.contacts?.[0];

  // Only handle text messages
  if (message.type !== "text") {
    return Response.json({ status: "non_text" });
  }

  const phone = message.from;
  const text = message.text.body;
  const name = contact?.profile?.name || null;
  const whatsappMsgId = message.id;

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

    // Store user message (ignore duplicates)
    console.log("💾 Storing message in conversation:", conversation.id);
    const { error: insertError, data: msgData } = await supabase.from("messages").insert({
      conversation_id: conversation.id,
      role: "user",
      content: text,
      whatsapp_msg_id: whatsappMsgId,
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

    // If mode is 'human' or auto-reply is disabled globally, don't auto-reply
    const autoReply = await isAutoReplyEnabled();
    if (conversation.mode === "human" || !autoReply) {
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
