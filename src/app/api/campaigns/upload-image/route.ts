import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get("file") as File;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const supabase = getSupabase();
  const ext = file.name.split(".").pop();
  const fileName = `campaign-headers/${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from("campaign-images")
    .upload(fileName, file, { contentType: file.type, upsert: true });

  if (error) {
    console.error("Upload error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data } = supabase.storage.from("campaign-images").getPublicUrl(fileName);

  return NextResponse.json({ url: data.publicUrl });
}
