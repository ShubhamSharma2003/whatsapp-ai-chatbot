import { NextResponse, type NextRequest } from "next/server";
import { getCurrentAppUser, hasFeature } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { normalizeLeadType, listLeadTypeTemplates } from "@/lib/lead-types";

const LEAD_TYPES_FEATURE = "lead_types";

// GET /api/lead-types — list all configs
export async function GET() {
  const appUser = await getCurrentAppUser();
  if (!appUser || !hasFeature(appUser, LEAD_TYPES_FEATURE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const data = await listLeadTypeTemplates();
  return NextResponse.json(data);
}

// POST /api/lead-types — create new config
export async function POST(request: NextRequest) {
  const appUser = await getCurrentAppUser();
  if (!appUser || !hasFeature(appUser, LEAD_TYPES_FEATURE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const slug = normalizeLeadType(String(body.lead_type ?? ""));
  if (!slug) {
    return NextResponse.json(
      {
        error:
          "Invalid lead_type. Use letters, digits, spaces, _, - (1-64 chars).",
      },
      { status: 400 }
    );
  }
  if (!body.template_name || typeof body.template_name !== "string") {
    return NextResponse.json(
      { error: "template_name is required" },
      { status: 400 }
    );
  }
  if (!body.display_name || typeof body.display_name !== "string") {
    return NextResponse.json(
      { error: "display_name is required" },
      { status: 400 }
    );
  }

  const admin = getSupabase();

  // If marked default, unset existing default first (single-default invariant)
  if (body.is_default === true) {
    await admin
      .from("lead_type_templates")
      .update({ is_default: false })
      .eq("is_default", true);
  }

  const { data, error } = await admin
    .from("lead_type_templates")
    .insert({
      lead_type: slug,
      display_name: body.display_name,
      enabled: body.enabled ?? true,
      is_default: body.is_default ?? false,
      template_name: body.template_name,
      template_language: body.template_language || "en",
      template_header_image_url: body.template_header_image_url || null,
      template_body_text: body.template_body_text || "",
      template_body_params: body.template_body_params ?? [],
      brochure_url: body.brochure_url || null,
      brochure_filename: body.brochure_filename || null,
      brochure_mime: body.brochure_mime || null,
      brochure_caption: body.brochure_caption || null,
      extra_info_text: body.extra_info_text || null,
      system_prompt: body.system_prompt || null,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: `Lead type "${slug}" already exists` },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}
