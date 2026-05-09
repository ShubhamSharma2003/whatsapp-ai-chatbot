import { supabase } from "@/lib/supabase";
import {
  sendWhatsAppMedia,
  sendWhatsAppMessage,
  sendWhatsAppTemplate,
} from "@/lib/whatsapp";
import {
  flattenTemplateParam,
  mediaTypeFromMime,
  resolveTemplateBodyParams,
  type BodyParamSpec,
} from "@/lib/lead-types";

export type DirectFormMessage =
  | {
      type: "template";
      template_name: string;
      template_language?: string;
      header_image_url?: string | null;
      body_text?: string | null;
      body_params?: BodyParamSpec[] | null;
    }
  | { type: "text"; text: string }
  | {
      type: "media";
      url: string;
      mime?: string | null;
      filename?: string | null;
      caption?: string | null;
    };

export interface DirectFormConfig {
  enabled: boolean;
  phrase: string;
  messages: DirectFormMessage[];
}

export async function getDirectFormConfig(): Promise<DirectFormConfig | null> {
  const { data } = await supabase
    .from("settings")
    .select(
      "direct_form_trigger_enabled, direct_form_trigger_phrase, direct_form_messages"
    )
    .eq("id", 1)
    .maybeSingle();
  if (!data) return null;
  return {
    enabled: !!data.direct_form_trigger_enabled,
    phrase: (data.direct_form_trigger_phrase ?? "").trim(),
    messages: (data.direct_form_messages as DirectFormMessage[] | null) ?? [],
  };
}

export function matchesDirectFormPhrase(
  text: string,
  phrase: string
): boolean {
  if (!phrase) return false;
  return text.toLowerCase().includes(phrase.toLowerCase());
}

function sanitizeName(raw: string | null | undefined): string {
  if (!raw) return "sir";
  const trimmed = raw.replace(/\s+/g, " ").trim();
  if (!trimmed) return "sir";
  if (!/\p{L}/u.test(trimmed)) return "sir";
  return trimmed;
}

/**
 * Send the configured direct-form sequence to a recipient and persist each
 * outbound turn to the `messages` table so the UI shows them as assistant rows.
 * Errors per-step are logged but do not abort the remaining sequence — partial
 * delivery is preferable to silent total failure.
 */
export async function runDirectFormSequence(args: {
  phone: string;
  name: string | null;
  conversationId: string;
  messages: DirectFormMessage[];
}): Promise<{ sentCount: number; errors: string[] }> {
  const cleanName = sanitizeName(args.name);
  const errors: string[] = [];
  let sentCount = 0;

  for (const msg of args.messages) {
    try {
      if (msg.type === "template") {
        const bodyText = msg.body_text ?? "";
        const params = resolveTemplateBodyParams(msg.body_params ?? null, {
          name: cleanName,
          bodyText,
        }).map(flattenTemplateParam);

        await sendWhatsAppTemplate(
          args.phone,
          msg.template_name,
          msg.template_language || "en",
          params,
          msg.header_image_url || undefined
        );

        await supabase.from("messages").insert({
          conversation_id: args.conversationId,
          role: "assistant",
          content: bodyText,
          media_url: msg.header_image_url || null,
          media_type: msg.header_image_url ? "image" : null,
        });
        sentCount += 1;
      } else if (msg.type === "text") {
        if (!msg.text?.trim()) continue;
        await sendWhatsAppMessage(args.phone, msg.text);
        await supabase.from("messages").insert({
          conversation_id: args.conversationId,
          role: "assistant",
          content: msg.text,
        });
        sentCount += 1;
      } else if (msg.type === "media") {
        if (!msg.url) continue;
        const mediaType = mediaTypeFromMime(msg.mime);
        await sendWhatsAppMedia(
          args.phone,
          mediaType,
          msg.url,
          msg.caption ?? undefined,
          mediaType === "document"
            ? msg.filename ?? "file.pdf"
            : undefined
        );
        await supabase.from("messages").insert({
          conversation_id: args.conversationId,
          role: "assistant",
          content: msg.caption ?? "",
          media_url: msg.url,
          media_type: mediaType,
        });
        sentCount += 1;
      }
    } catch (err) {
      console.error("[direct-form] step failed:", msg.type, err);
      errors.push(`${msg.type}:${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { sentCount, errors };
}
