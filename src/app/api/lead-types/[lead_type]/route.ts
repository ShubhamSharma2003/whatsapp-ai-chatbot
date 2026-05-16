import { NextResponse, type NextRequest } from "next/server";
import { getCurrentAppUser, hasFeature } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { getLeadTypeTemplate, normalizeLeadType } from "@/lib/lead-types";

const LEAD_TYPES_FEATURE = "lead_types";

const UPDATABLE_FIELDS = [
  "display_name",
  "enabled",
  "is_default",
  "reply_strategy",
  "template_name",
  "template_language",
  "template_header_image_url",
  "template_body_text",
  "template_body_params",
  "brochure_url",
  "brochure_filename",
  "brochure_mime",
  "brochure_caption",
  "extra_info_text",
  "system_prompt",
] as const;

// GET /api/lead-types/[lead_type]
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ lead_type: string }> }
) {
  const appUser = await getCurrentAppUser();
  if (!appUser || !hasFeature(appUser, LEAD_TYPES_FEATURE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { lead_type } = await params;
  const slug = normalizeLeadType(lead_type);
  if (!slug) return NextResponse.json({ error: "Invalid lead_type" }, { status: 400 });
  const data = await getLeadTypeTemplate(slug);
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(data);
}

// PATCH /api/lead-types/[lead_type] — partial update
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ lead_type: string }> }
) {
  const appUser = await getCurrentAppUser();
  if (!appUser || !hasFeature(appUser, LEAD_TYPES_FEATURE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { lead_type } = await params;
  const slug = normalizeLeadType(lead_type);
  if (!slug) return NextResponse.json({ error: "Invalid lead_type" }, { status: 400 });

  const body = await request.json();
  const updates: Record<string, unknown> = {};
  for (const f of UPDATABLE_FIELDS) {
    if (body[f] !== undefined) updates[f] = body[f];
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const admin = getSupabase();

  // Single-default invariant: if marking this row default, unset others first
  if (updates.is_default === true) {
    await admin
      .from("lead_type_templates")
      .update({ is_default: false })
      .eq("is_default", true)
      .neq("lead_type", slug);
  }

  const { data, error } = await admin
    .from("lead_type_templates")
    .update(updates)
    .eq("lead_type", slug)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

// DELETE /api/lead-types/[lead_type]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ lead_type: string }> }
) {
  const appUser = await getCurrentAppUser();
  if (!appUser || !hasFeature(appUser, LEAD_TYPES_FEATURE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { lead_type } = await params;
  const slug = normalizeLeadType(lead_type);
  if (!slug) return NextResponse.json({ error: "Invalid lead_type" }, { status: 400 });

  const admin = getSupabase();
  const { error } = await admin
    .from("lead_type_templates")
    .delete()
    .eq("lead_type", slug);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
