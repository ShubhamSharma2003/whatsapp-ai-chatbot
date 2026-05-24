import { NextResponse, type NextRequest } from "next/server";
import { getCurrentAppUser, isSuperAdmin } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";

async function requireAdmin() {
  const appUser = await getCurrentAppUser();
  if (!appUser || !isSuperAdmin(appUser)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

// GET /api/admin/projects/[id] — single project + its media rows
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const forbid = await requireAdmin();
  if (forbid) return forbid;
  const { id } = await ctx.params;

  const admin = getSupabase();
  const { data: project, error: pErr } = await admin
    .from("projects")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (pErr || !project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const { data: media } = await admin
    .from("project_media")
    .select("*")
    .eq("project_id", id)
    .order("kind", { ascending: true })
    .order("sort_order", { ascending: true });

  return NextResponse.json({ ...project, media: media ?? [] });
}

// PATCH /api/admin/projects/[id]
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const forbid = await requireAdmin();
  if (forbid) return forbid;
  const { id } = await ctx.params;
  const body = await req.json();

  const updates: Record<string, unknown> = {};
  for (const key of [
    "name",
    "slug",
    "aliases",
    "short_description",
    "details_md",
    "enabled",
    "sort_order",
  ]) {
    if (key in body) updates[key] = body[key];
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No changes" }, { status: 400 });
  }

  const admin = getSupabase();
  const { data, error } = await admin
    .from("projects")
    .update(updates)
    .eq("id", id)
    .select()
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json(data);
}

// DELETE /api/admin/projects/[id]
export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const forbid = await requireAdmin();
  if (forbid) return forbid;
  const { id } = await ctx.params;

  const admin = getSupabase();
  const { error } = await admin.from("projects").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
