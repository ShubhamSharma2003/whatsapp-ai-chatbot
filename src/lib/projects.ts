import { supabase } from "@/lib/supabase";
import type {
  Project,
  ProjectCatalogEntry,
  ProjectMedia,
  ProjectMediaKind,
} from "@/lib/types";

const MEDIA_KIND_ORDER: ProjectMediaKind[] = [
  "brochure",
  "image",
  "floor_plan",
  "price_list",
  "video",
];

/**
 * Render the project catalog as a compact prompt block.
 * Kept pure so it can be unit-tested without Supabase.
 */
export function renderCatalogBlock(entries: ProjectCatalogEntry[]): string {
  const header = "[Project Catalog — call send_project_media to share assets]";
  if (entries.length === 0) {
    return `${header}\n(no projects configured)`;
  }
  const lines = entries.map((e) => {
    const parts: string[] = [`${e.name} (slug=${e.slug})`];
    if (e.aliases.length > 0) parts.push(`aliases: ${e.aliases.join(", ")}`);
    const available =
      e.available_media.length > 0 ? e.available_media.join(", ") : "(none)";
    parts.push(`Available: ${available}`);
    return `• ${parts.join(" — ")}`;
  });
  return `${header}\n${lines.join("\n")}`;
}

/**
 * Fetch enabled projects + their media kinds in a single round-trip pair.
 * Returns catalog ordered by sort_order.
 */
export async function getProjectCatalog(): Promise<ProjectCatalogEntry[]> {
  const { data: projects, error: pErr } = await supabase
    .from("projects")
    .select("id, slug, name, aliases, short_description, enabled, sort_order")
    .eq("enabled", true)
    .order("sort_order", { ascending: true });
  if (pErr) {
    console.error("getProjectCatalog: projects fetch failed", pErr);
    return [];
  }
  const rows = (projects ?? []) as Pick<
    Project,
    "id" | "slug" | "name" | "aliases" | "short_description" | "enabled" | "sort_order"
  >[];
  if (rows.length === 0) return [];

  const idToSlug = new Map(rows.map((r) => [r.id, r.slug]));
  const ids = rows.map((r) => r.id);
  const { data: media, error: mErr } = await supabase
    .from("project_media")
    .select("kind, project_id")
    .in("project_id", ids);
  if (mErr) {
    console.error("getProjectCatalog: media fetch failed", mErr);
  }

  // Group available kinds by slug
  const bySlug = new Map<string, Set<ProjectMediaKind>>();
  for (const row of (media ?? []) as Array<{
    kind: ProjectMediaKind;
    project_id: string;
  }>) {
    const slug = idToSlug.get(row.project_id);
    if (!slug) continue;
    if (!bySlug.has(slug)) bySlug.set(slug, new Set());
    bySlug.get(slug)!.add(row.kind);
  }

  return rows.map((r) => ({
    slug: r.slug,
    name: r.name,
    aliases: r.aliases ?? [],
    short_description: r.short_description,
    available_media: MEDIA_KIND_ORDER.filter((k) =>
      bySlug.get(r.slug)?.has(k)
    ),
  }));
}

/**
 * Look up the lowest-sort_order media row for a project + kind.
 * Returns null when no asset exists (silently skipped by webhook).
 */
export async function getProjectMedia(
  slug: string,
  kind: ProjectMediaKind
): Promise<ProjectMedia | null> {
  const { data: project, error: pErr } = await supabase
    .from("projects")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (pErr || !project) {
    if (pErr) console.error("getProjectMedia: project lookup failed", pErr);
    return null;
  }
  const { data, error } = await supabase
    .from("project_media")
    .select("*")
    .eq("kind", kind)
    .eq("project_id", project.id)
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("getProjectMedia failed", error);
    return null;
  }
  return (data as ProjectMedia | null) ?? null;
}
