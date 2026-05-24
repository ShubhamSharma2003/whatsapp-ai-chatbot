import { NextResponse, type NextRequest } from "next/server";
import { getCurrentAppUser, isSuperAdmin } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";

const BUCKET = "project-media";

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; mediaId: string }> }
) {
  const appUser = await getCurrentAppUser();
  if (!appUser || !isSuperAdmin(appUser)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id: projectId, mediaId } = await ctx.params;

  const admin = getSupabase();
  const { data: row } = await admin
    .from("project_media")
    .select("url")
    .eq("id", mediaId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // DB delete first — if storage cleanup later fails, we orphan a file but
  // never leave a DB row pointing at a dead URL.
  const { error: dbErr } = await admin
    .from("project_media")
    .delete()
    .eq("id", mediaId);
  if (dbErr) {
    return NextResponse.json({ error: dbErr.message }, { status: 400 });
  }

  // Best-effort storage cleanup. Object path lives inside the public URL.
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const idx = row.url.indexOf(marker);
  if (idx >= 0) {
    const objectPath = row.url.slice(idx + marker.length);
    const { error: storageErr } = await admin.storage
      .from(BUCKET)
      .remove([objectPath]);
    if (storageErr) {
      console.warn(
        `Orphaned storage object after row delete: ${objectPath}`,
        storageErr
      );
    }
  }

  return NextResponse.json({ ok: true });
}
