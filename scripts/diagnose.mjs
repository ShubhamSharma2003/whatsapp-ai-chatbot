import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
    })
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing creds");
  process.exit(1);
}
const sb = createClient(url, key);

const out = {};

// 1. settings
const { data: s } = await sb
  .from("settings")
  .select("project_media_enabled, system_prompt, auto_reply_enabled")
  .eq("id", 1)
  .single();
out.settings = {
  project_media_enabled: s?.project_media_enabled,
  auto_reply_enabled: s?.auto_reply_enabled,
  prompt_len: s?.system_prompt?.length ?? 0,
  still_has_consultants_fallback:
    !!s?.system_prompt && /consultants?\s+will\s+contact/i.test(s.system_prompt),
  has_send_project_media_instruction:
    !!s?.system_prompt && /send_project_media/i.test(s.system_prompt),
  prompt_first_400: s?.system_prompt?.slice(0, 400),
  prompt_last_400: s?.system_prompt?.slice(-400),
};

// 2. projects + media
const { data: projects } = await sb
  .from("projects")
  .select("id, slug, name, enabled")
  .order("sort_order");
out.projects_count = projects?.length ?? 0;

const { data: media } = await sb
  .from("project_media")
  .select("id, project_id, kind, filename, url, caption")
  .order("created_at");
out.media_rows = media ?? [];

// 3. Specifically dlf-central-67
const dlfCentral = projects?.find((p) => p.slug === "dlf-central-67");
out.dlf_central_67 = {
  exists: !!dlfCentral,
  id: dlfCentral?.id,
  enabled: dlfCentral?.enabled,
  media:
    (media ?? []).filter((m) => m.project_id === dlfCentral?.id) ?? [],
};

// 4. Recent messages from conversations (last 10 outbound)
const { data: msgs } = await sb
  .from("messages")
  .select("role, content, media_type, media_kind, media_project_slug, created_at, conversation_id")
  .eq("role", "assistant")
  .order("created_at", { ascending: false })
  .limit(10);
out.recent_assistant_messages = msgs ?? [];

console.log(JSON.stringify(out, null, 2));
