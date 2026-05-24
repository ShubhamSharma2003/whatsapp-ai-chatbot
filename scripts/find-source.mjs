import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => l && !l.startsWith("#") && l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// Check all tables that could contain the "consultants will contact" string
const tables = [
  { name: "settings", cols: ["system_prompt"] },
  { name: "campaigns", cols: ["name", "system_prompt", "message_template"] },
  { name: "lead_type_templates", cols: ["template_body_text", "extra_info_text", "brochure_caption", "system_prompt"] },
  { name: "nudge_rules", cols: ["name", "template_body_text", "free_form_fallback"] },
];

for (const t of tables) {
  const colsStr = t.cols.join(", ");
  let q = sb.from(t.name).select(`id, ${colsStr}`);
  for (const c of t.cols) q = q.or(`${c}.ilike.%consultants will contact%,${c}.ilike.%consultants will contact%`);
  const { data, error } = await q;
  if (error) {
    console.log(`SKIP ${t.name}:`, error.message);
    continue;
  }
  console.log(`\n=== ${t.name} (${data?.length || 0} matching rows) ===`);
  for (const row of data || []) console.log(JSON.stringify(row, null, 2));
}

// Also check what's pinned to the test conversation
const { data: convo } = await sb
  .from("conversations")
  .select("*")
  .eq("id", "c7696d9c-4a92-4a98-9e0e-97e60db6964e")
  .single();
console.log("\n=== TEST CONVERSATION ===\n", JSON.stringify(convo, null, 2));

// Direct text scan over all settings columns just in case
const { data: s } = await sb.from("settings").select("*").eq("id", 1).single();
console.log("\n=== ALL SETTINGS KEYS ===\n", Object.keys(s ?? {}));
for (const [k, v] of Object.entries(s ?? {})) {
  if (typeof v === "string" && /consultants?\s+will\s+contact/i.test(v)) {
    console.log(`MATCH in settings.${k}:`, v.slice(0, 200));
  }
}
