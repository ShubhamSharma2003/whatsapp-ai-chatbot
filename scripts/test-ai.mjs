import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
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

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

// Fetch settings + catalog
const { data: settings } = await sb.from("settings").select("*").eq("id", 1).single();
const { data: projects } = await sb.from("projects").select("id, slug, name, aliases, short_description").eq("enabled", true).order("sort_order");
const { data: media } = await sb.from("project_media").select("project_id, kind").in("project_id", projects.map((p) => p.id));

const bySlug = new Map();
const idToSlug = new Map(projects.map((p) => [p.id, p.slug]));
for (const m of media) {
  const slug = idToSlug.get(m.project_id);
  if (!bySlug.has(slug)) bySlug.set(slug, new Set());
  bySlug.get(slug).add(m.kind);
}

const catalogBlock =
  "[Project Catalog — call send_project_media to share assets]\n" +
  projects
    .map((p) => {
      const aliases = p.aliases?.length ? ` — aliases: ${p.aliases.join(", ")}` : "";
      const avail = [...(bySlug.get(p.slug) ?? [])].join(", ") || "(none)";
      return `• ${p.name} (slug=${p.slug})${aliases} — Available: ${avail}`;
    })
    .join("\n");

const systemPrompt = `${settings.system_prompt}\n\n${catalogBlock}`;

console.log("=== CATALOG BLOCK ===\n" + catalogBlock);
console.log("\n=== SYSTEM PROMPT LENGTH ===", systemPrompt.length);
console.log("=== FLAG ===", settings.project_media_enabled);

const tool = {
  type: "function",
  function: {
    name: "send_project_media",
    description:
      "Send a media asset (brochure, image, floor plan, price list, or video) for a specific project to the lead via WhatsApp. Only call when the lead explicitly asks for project assets. Use the project slug from the catalog. Do not call if the requested media_kind is not listed as Available for the project.",
    parameters: {
      type: "object",
      properties: {
        project_slug: { type: "string" },
        media_kind: { type: "string", enum: ["brochure", "image", "floor_plan", "price_list", "video"] },
      },
      required: ["project_slug", "media_kind"],
      additionalProperties: false,
    },
  },
};

const resp = await openai.chat.completions.create({
  model: settings.ai_model || "gpt-4o-mini",
  temperature: settings.temperature ?? 0.7,
  messages: [
    { role: "system", content: systemPrompt },
    { role: "user", content: "Hi" },
    { role: "assistant", content: "Hello! I'm Pallavi from Unisel Realty. How can I help you?" },
    { role: "user", content: "please send me DLF Central 67 brochure" },
  ],
  tools: [tool],
});

const msg = resp.choices[0].message;
console.log("\n=== AI RESPONSE ===");
console.log("content:", JSON.stringify(msg.content));
console.log("tool_calls:", JSON.stringify(msg.tool_calls, null, 2));
