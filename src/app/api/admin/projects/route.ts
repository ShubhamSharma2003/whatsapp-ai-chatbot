import { NextResponse, type NextRequest } from "next/server";
import { getCurrentAppUser, isSuperAdmin } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 64);
}

// GET /api/admin/projects — list all projects (with media counts)
export async function GET() {
  const appUser = await getCurrentAppUser();
  if (!appUser || !isSuperAdmin(appUser)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = getSupabase();
  const { data: projects, error } = await admin
    .from("projects")
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Attach a flat count of media rows per project
  const ids = (projects ?? []).map((p) => p.id);
  let counts: Record<string, number> = {};
  if (ids.length > 0) {
    const { data: media } = await admin
      .from("project_media")
      .select("project_id")
      .in("project_id", ids);
    counts = (media ?? []).reduce<Record<string, number>>((acc, row) => {
      acc[row.project_id] = (acc[row.project_id] ?? 0) + 1;
      return acc;
    }, {});
  }

  return NextResponse.json(
    (projects ?? []).map((p) => ({ ...p, media_count: counts[p.id] ?? 0 }))
  );
}

// POST /api/admin/projects — create
export async function POST(request: NextRequest) {
  const appUser = await getCurrentAppUser();
  if (!appUser || !isSuperAdmin(appUser)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const name: string | undefined = body.name?.trim();
  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  const slug: string = body.slug?.trim() || slugify(name);
  if (!slug) {
    return NextResponse.json({ error: "Invalid slug" }, { status: 400 });
  }

  const admin = getSupabase();
  const { data, error } = await admin
    .from("projects")
    .insert({
      name,
      slug,
      aliases: Array.isArray(body.aliases) ? body.aliases : [],
      short_description: body.short_description ?? null,
      details_md: body.details_md ?? null,
      enabled: body.enabled ?? true,
      sort_order: typeof body.sort_order === "number" ? body.sort_order : 0,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json(data, { status: 201 });
}
