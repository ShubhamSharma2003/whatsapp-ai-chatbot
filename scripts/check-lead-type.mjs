import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => l && !l.startsWith("#") && l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const { data, error } = await sb
  .from("lead_type_templates")
  .select("lead_type, display_name, system_prompt")
  .eq("lead_type", "GODERJ GCR LS")
  .maybeSingle();
if (error) console.error(error);
console.log("display:", data?.display_name);
console.log("prompt_len:", data?.system_prompt?.length ?? 0);
console.log("has_consultants_fallback:", /consultants?\s+will\s+contact/i.test(data?.system_prompt || ""));
console.log("has_representatives_fallback:", /representatives\s+will\s+contact/i.test(data?.system_prompt || ""));
console.log("has_send_project_media:", /send_project_media/.test(data?.system_prompt || ""));
console.log("\n=== FULL PROMPT ===\n");
console.log(data?.system_prompt);
