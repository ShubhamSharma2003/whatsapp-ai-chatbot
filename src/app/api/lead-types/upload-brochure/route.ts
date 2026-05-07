import { NextRequest, NextResponse } from "next/server";
import { getCurrentAppUser, hasFeature } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";

const LEAD_TYPES_FEATURE = "lead_types";
const BUCKET = "campaign-images";
const PREFIX = "lead-brochures";
const MAX_BYTES = 16 * 1024 * 1024; // WhatsApp document limit is 100MB but keep tight default

export async function POST(request: NextRequest) {
  const appUser = await getCurrentAppUser();
  if (!appUser || !hasFeature(appUser, LEAD_TYPES_FEATURE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `File too large (max ${MAX_BYTES / 1024 / 1024}MB)` },
      { status: 413 }
    );
  }

  const supabase = getSupabase();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const ext = safeName.includes(".") ? safeName.split(".").pop() : "bin";
  const fileName = `${PREFIX}/${Date.now()}-${safeName}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(fileName, file, { contentType: file.type, upsert: true });

  if (error) {
    console.error("Brochure upload error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(fileName);

  return NextResponse.json({
    url: data.publicUrl,
    filename: safeName,
    mime: file.type || `application/${ext}`,
    size: file.size,
  });
}
