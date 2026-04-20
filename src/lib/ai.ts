import OpenAI from "openai";
import { PROPERTY_SYSTEM_PROMPT } from "@/lib/system-prompt";
import { supabase } from "@/lib/supabase";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function getSettings() {
  const { data } = await supabase
    .from("settings")
    .select("system_prompt, ai_model, temperature, max_context_messages, auto_reply_enabled")
    .eq("id", 1)
    .single();
  return data;
}

export async function getAIResponse(
  messages: { role: "user" | "assistant"; content: string }[]
) {
  const settings = await getSettings();

  const systemPrompt = settings?.system_prompt?.trim()
    ? settings.system_prompt
    : PROPERTY_SYSTEM_PROMPT;

  const model = settings?.ai_model || process.env.AI_MODEL || "gpt-4o-mini";
  const temperature = settings?.temperature ?? 0.7;
  const maxContext = settings?.max_context_messages ?? 20;

  const trimmedMessages = messages.slice(-maxContext);

  const completion = await openai.chat.completions.create({
    model,
    temperature,
    messages: [
      { role: "system", content: systemPrompt },
      ...trimmedMessages,
    ],
  });

  const raw = completion.choices[0]?.message?.content || "Sorry, I couldn't generate a response.";
  return stripMarkdown(raw);
}

function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*\*(.+?)\*\*\*/g, "$1")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "• ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function isAutoReplyEnabled(): Promise<boolean> {
  const settings = await getSettings();
  return settings?.auto_reply_enabled ?? true;
}
