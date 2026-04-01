import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { PROPERTY_SYSTEM_PROMPT } from "@/lib/system-prompt";

export async function GET() {
  const { data, error } = await supabase
    .from("settings")
    .select("*")
    .eq("id", 1)
    .single();

  if (error || !data) {
    // Return defaults if row doesn't exist yet
    return Response.json({
      system_prompt: PROPERTY_SYSTEM_PROMPT,
      ai_model: process.env.AI_MODEL || "gpt-4o-mini",
      temperature: 0.7,
      max_context_messages: 20,
      auto_reply_enabled: true,
      default_conversation_mode: "agent",
      agent_name: "Pallavi",
    });
  }

  // If system_prompt is empty, return the file default
  if (!data.system_prompt?.trim()) {
    data.system_prompt = PROPERTY_SYSTEM_PROMPT;
  }

  return Response.json(data);
}

export async function PATCH(request: NextRequest) {
  const body = await request.json();

  const allowed = [
    "system_prompt",
    "ai_model",
    "temperature",
    "max_context_messages",
    "auto_reply_enabled",
    "default_conversation_mode",
    "agent_name",
  ];

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of allowed) {
    if (key in body) update[key] = body[key];
  }

  // Upsert so it works even if row doesn't exist
  const { data, error } = await supabase
    .from("settings")
    .upsert({ id: 1, ...update })
    .select()
    .single();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json(data);
}
