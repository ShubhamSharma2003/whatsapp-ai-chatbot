import OpenAI from "openai";
import { PROPERTY_SYSTEM_PROMPT } from "@/lib/system-prompt";
import { supabase } from "@/lib/supabase";
import { getProjectCatalog, renderCatalogBlock } from "@/lib/projects";
import type { ProjectMediaKind, ProjectMediaSend } from "@/lib/types";

let _openai: OpenAI | null = null;
function getOpenAI() {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _openai;
}

async function getSettings() {
  const { data } = await supabase
    .from("settings")
    .select(
      "system_prompt, ai_model, temperature, max_context_messages, auto_reply_enabled, default_conversation_mode, project_media_enabled"
    )
    .eq("id", 1)
    .single();
  return data;
}

export function resolveSystemPrompt(
  campaignPrompt: string | null | undefined,
  globalPrompt: string | null | undefined
): string {
  if (campaignPrompt?.trim()) return campaignPrompt.trim();
  if (globalPrompt?.trim()) return globalPrompt.trim();
  return PROPERTY_SYSTEM_PROMPT;
}

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
  alreadyGreeted?: boolean;
  brochureSent?: boolean;
  /** Override feature-flag lookup (used by tests). */
  projectMediaEnabled?: boolean;
}

export interface AIResponse {
  text: string;
  mediaSends: ProjectMediaSend[];
}

const SEND_MEDIA_TOOL = {
  type: "function" as const,
  function: {
    name: "send_project_media",
    description:
      "Send a media asset (brochure, image, floor plan, price list, or video) " +
      "for a specific project to the lead via WhatsApp. Only call when the lead " +
      "explicitly asks for project assets. Use the project slug from the catalog. " +
      "Do not call if the requested media_kind is not listed as Available for the project.",
    parameters: {
      type: "object",
      properties: {
        project_slug: {
          type: "string",
          description: "slug exactly as shown in the catalog",
        },
        media_kind: {
          type: "string",
          enum: ["brochure", "image", "floor_plan", "price_list", "video"],
        },
      },
      required: ["project_slug", "media_kind"],
      additionalProperties: false,
    },
  },
};

const MEDIA_KIND_SET = new Set<ProjectMediaKind>([
  "brochure",
  "image",
  "floor_plan",
  "price_list",
  "video",
]);

function parseToolCalls(
  toolCalls: unknown
): ProjectMediaSend[] {
  if (!Array.isArray(toolCalls)) return [];
  const sends: ProjectMediaSend[] = [];
  for (const tc of toolCalls) {
    const fn = (tc as { function?: { name?: string; arguments?: string } })
      .function;
    if (!fn || fn.name !== "send_project_media") continue;
    let args: unknown;
    try {
      args = JSON.parse(fn.arguments ?? "{}");
    } catch {
      continue;
    }
    const slug = (args as { project_slug?: unknown }).project_slug;
    const kind = (args as { media_kind?: unknown }).media_kind;
    if (typeof slug !== "string" || typeof kind !== "string") continue;
    if (!MEDIA_KIND_SET.has(kind as ProjectMediaKind)) continue;
    sends.push({ project_slug: slug, media_kind: kind as ProjectMediaKind });
  }
  return sends;
}

export async function getAIResponse(
  messages: { role: "user" | "assistant"; content: string }[],
  options: AIResponseOptions = {}
): Promise<AIResponse> {
  const settings = await getSettings();

  const featureEnabled =
    options.projectMediaEnabled ?? settings?.project_media_enabled ?? false;

  const baseSystemPrompt = resolveSystemPromptChain(
    options.campaignSystemPrompt,
    options.leadTypeSystemPrompt,
    settings?.system_prompt
  );

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

  let catalogBlock = "";
  if (featureEnabled) {
    const catalog = await getProjectCatalog();
    catalogBlock = renderCatalogBlock(catalog);
  }

  const systemPromptParts = [baseSystemPrompt];
  if (catalogBlock) systemPromptParts.push(catalogBlock);
  if (continuationParts.length > 0) {
    systemPromptParts.push(
      `[CONVERSATION CONTEXT]\n${continuationParts.join("\n")}`
    );
  }
  const systemPrompt = systemPromptParts.join("\n\n");

  const model = settings?.ai_model || process.env.AI_MODEL || "gpt-4o-mini";
  const temperature = settings?.temperature ?? 0.7;
  const maxContext = settings?.max_context_messages ?? 20;
  const trimmedMessages = messages.slice(-maxContext);

  const baseMessages = [
    { role: "system" as const, content: systemPrompt },
    ...trimmedMessages,
  ];

  const firstCall = await getOpenAI().chat.completions.create({
    model,
    temperature,
    messages: baseMessages,
    ...(featureEnabled ? { tools: [SEND_MEDIA_TOOL] } : {}),
  });

  const choice = firstCall.choices[0]?.message;
  const toolCalls = (choice as { tool_calls?: unknown })?.tool_calls;
  const rawToolCalls = Array.isArray(toolCalls) ? toolCalls : [];
  const mediaSends = featureEnabled ? parseToolCalls(toolCalls) : [];

  // No tool calls → first reply is the final text.
  if (rawToolCalls.length === 0) {
    const raw =
      choice?.content || "Sorry, I couldn't generate a response.";
    return { text: stripMarkdown(raw), mediaSends };
  }

  // Second pass: feed tool outputs back so the model produces the human text.
  // We acknowledge each tool call (even unparseable ones, so the protocol stays valid).
  const assistantTurn = {
    role: "assistant" as const,
    content: choice?.content ?? "",
    tool_calls: rawToolCalls,
  };
  const toolResults = rawToolCalls.map((tc) => ({
    role: "tool" as const,
    tool_call_id: (tc as { id: string }).id,
    content: "Delivered.",
  }));

  const secondCall = await getOpenAI().chat.completions.create({
    model,
    temperature,
    messages: [
      ...baseMessages,
      // OpenAI's chat API accepts the assistant message with tool_calls then tool replies.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      assistantTurn as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...(toolResults as any),
    ],
  });

  const raw =
    secondCall.choices[0]?.message?.content ||
    "Sorry, I couldn't generate a response.";
  return { text: stripMarkdown(raw), mediaSends };
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
