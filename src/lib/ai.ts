import OpenAI from "openai";
import { PROPERTY_SYSTEM_PROMPT } from "@/lib/system-prompt";
import { supabase } from "@/lib/supabase";

let _openai: OpenAI | null = null;
function getOpenAI() {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _openai;
}

async function getSettings() {
  const { data } = await supabase
    .from("settings")
    .select(
      "system_prompt, ai_model, temperature, max_context_messages, auto_reply_enabled, default_conversation_mode"
    )
    .eq("id", 1)
    .single();
  return data;
}

/**
 * BC: campaign > global > default. Used by callers that don't have a lead-type prompt.
 */
export function resolveSystemPrompt(
  campaignPrompt: string | null | undefined,
  globalPrompt: string | null | undefined
): string {
  if (campaignPrompt?.trim()) return campaignPrompt.trim();
  if (globalPrompt?.trim()) return globalPrompt.trim();
  return PROPERTY_SYSTEM_PROMPT;
}

/**
 * Full chain: campaign > lead-type > global > default.
 * Lead-type prompt sits between campaign-specific and global so per-project knowledge
 * wins over generic settings but yields to an explicit campaign override.
 */
export function resolveSystemPromptChain(
  campaignPrompt: string | null | undefined,
  leadTypePrompt: string | null | undefined,
  globalPrompt: string | null | undefined
): string {
  if (campaignPrompt?.trim()) return campaignPrompt.trim();
  if (leadTypePrompt?.trim()) return leadTypePrompt.trim();
  if (globalPrompt?.trim()) return globalPrompt.trim();
  return PROPERTY_SYSTEM_PROMPT;
}

export interface AIResponseOptions {
  campaignSystemPrompt?: string | null;
  leadTypeSystemPrompt?: string | null;
  /** Set true when the assistant has already messaged this conversation (welcome/brochure already sent). */
  alreadyGreeted?: boolean;
  /** Set true when a brochure was sent earlier so the AI doesn't re-offer it. */
  brochureSent?: boolean;
}

export async function getAIResponse(
  messages: { role: "user" | "assistant"; content: string }[],
  options: AIResponseOptions = {}
) {
  const settings = await getSettings();

  const baseSystemPrompt = resolveSystemPromptChain(
    options.campaignSystemPrompt,
    options.leadTypeSystemPrompt,
    settings?.system_prompt
  );

  // Append a context hint so the model doesn't reintroduce itself or re-offer the brochure.
  // Done at runtime (not stored in settings) because the hint depends on per-conversation state.
  const continuationParts: string[] = [];
  if (options.alreadyGreeted) {
    continuationParts.push(
      "You have already greeted this lead and shared the welcome message. Do NOT reintroduce yourself or repeat the welcome — reply directly to the user's last message."
    );
  }
  if (options.brochureSent) {
    continuationParts.push(
      "A brochure has already been delivered to this lead in an earlier message. Do not re-send or re-offer it. Reference it only if the user asks."
    );
  }

  const systemPrompt = continuationParts.length
    ? `${baseSystemPrompt}\n\n[CONVERSATION CONTEXT]\n${continuationParts.join("\n")}`
    : baseSystemPrompt;

  const model = settings?.ai_model || process.env.AI_MODEL || "gpt-4o-mini";
  const temperature = settings?.temperature ?? 0.7;
  const maxContext = settings?.max_context_messages ?? 20;

  const trimmedMessages = messages.slice(-maxContext);

  const completion = await getOpenAI().chat.completions.create({
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

export async function getDefaultConversationMode(): Promise<"agent" | "human"> {
  const settings = await getSettings();
  return (settings?.default_conversation_mode as "agent" | "human") || "agent";
}
