import { NextResponse, type NextRequest } from "next/server";
import { getCurrentAppUser, isSuperAdmin } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import type { ProjectMediaKind } from "@/lib/types";

const VALID_KINDS: ProjectMediaKind[] = [
  "brochure",
  "image",
  "floor_plan",
  "price_list",
  "video",
];
const BUCKET = "project-media";

function sanitizeFilename(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 200);
}

async function requireAdmin() {
  const appUser = await getCurrentAppUser();
  if (!appUser || !isSuperAdmin(appUser)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

// POST /api/admin/projects/[id]/media — upload one file
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const forbid = await requireAdmin();
  if (forbid) return forbid;
  const { id: projectId } = await ctx.params;

  const form = await req.formData();
  const file = form.get("file");
  const kindRaw = String(form.get("kind") ?? "");
  const caption = form.get("caption") ? String(form.get("caption")) : null;
  const sortOrderRaw = form.get("sort_order");
  const sortOrder = sortOrderRaw ? Number(sortOrderRaw) : 0;

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }
  if (!VALID_KINDS.includes(kindRaw as ProjectMediaKind)) {
    return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
  }
  const kind = kindRaw as ProjectMediaKind;

  const admin = getSupabase();
  const { data: project } = await admin
    .from("projects")
    .select("slug")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const cleanName = sanitizeFilename(file.name);
  const objectPath = `${project.slug}/${kind}/${Date.now()}-${cleanName}`;
  const arrayBuffer = await file.arrayBuffer();
  const { error: upErr } = await admin.storage
    .from(BUCKET)
    .upload(objectPath, arrayBuffer, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(objectPath);
  const url = pub.publicUrl;

  const { data: row, error: insErr } = await admin
    .from("project_media")
    .insert({
      project_id: projectId,
      kind,
      url,
      filename: cleanName,
      mime: file.type || null,
      caption,
      sort_order: Number.isFinite(sortOrder) ? sortOrder : 0,
    })
    .select()
    .single();
  if (insErr) {
    // best-effort rollback of storage object
    await admin.storage.from(BUCKET).remove([objectPath]);
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  return NextResponse.json(row, { status: 201 });
}

// GET /api/admin/projects/[id]/media — list media for a project
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const forbid = await requireAdmin();
  if (forbid) return forbid;
  const { id: projectId } = await ctx.params;
  const admin = getSupabase();
  const { data, error } = await admin
    .from("project_media")
    .select("*")
    .eq("project_id", projectId)
    .order("kind", { ascending: true })
    .order("sort_order", { ascending: true });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data ?? []);
}
