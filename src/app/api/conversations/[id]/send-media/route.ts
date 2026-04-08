import { NextRequest } from "next/server";
import { supabase, getSupabase } from "@/lib/supabase";
import { sendWhatsAppMedia } from "@/lib/whatsapp";

const ALLOWED_TYPES: Record<string, "image" | "audio" | "video" | "document"> = {
  "image/jpeg": "image",
  "image/png": "image",
  "image/webp": "image",
  "audio/mpeg": "audio",
  "audio/ogg": "audio",
  "audio/aac": "audio",
  "audio/amr": "audio",
  "video/mp4": "video",
  "video/3gpp": "video",
  "application/pdf": "document",
  "application/msword": "document",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "document",
  "application/vnd.ms-excel": "document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "document",
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const caption = (formData.get("caption") as string) || "";

  if (!file) {
    return Response.json({ error: "No file provided" }, { status: 400 });
  }

  const mediaType = ALLOWED_TYPES[file.type];
  if (!mediaType) {
    return Response.json(
      { error: `Unsupported file type: ${file.type}` },
      { status: 400 }
    );
  }

  // Get conversation phone number
  const { data: conversation, error: convoError } = await supabase
    .from("conversations")
    .select("phone")
    .eq("id", id)
    .single();

  if (convoError || !conversation) {
    return Response.json({ error: "Conversation not found" }, { status: 404 });
  }

  // Upload to Supabase Storage
  const sb = getSupabase();
  const ext = file.name.split(".").pop();
  const fileName = `chat-media/${id}/${Date.now()}.${ext}`;

  const { error: uploadError } = await sb.storage
    .from("campaign-images")
    .upload(fileName, file, { contentType: file.type, upsert: true });

  if (uploadError) {
    console.error("Upload error:", uploadError);
    return Response.json({ error: uploadError.message }, { status: 500 });
  }

  const { data: urlData } = sb.storage
    .from("campaign-images")
    .getPublicUrl(fileName);
  const publicUrl = urlData.publicUrl;

  // Send via WhatsApp
  await sendWhatsAppMedia(
    conversation.phone,
    mediaType,
    publicUrl,
    caption || undefined,
    mediaType === "document" ? file.name : undefined
  );

  // Store in DB
  const { data: msg, error: msgError } = await supabase
    .from("messages")
    .insert({
      conversation_id: id,
      role: "assistant",
      content: caption || `[${mediaType}]`,
      media_url: publicUrl,
      media_type: mediaType,
    })
    .select()
    .single();

  if (msgError) {
    return Response.json({ error: msgError.message }, { status: 500 });
  }

  // Update conversation timestamp
  await supabase
    .from("conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", id);

  return Response.json(msg);
}
