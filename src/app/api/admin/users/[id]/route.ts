import { NextResponse, type NextRequest } from "next/server";
import { getCurrentAppUser, isSuperAdmin } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase";
import { createClient } from "@supabase/supabase-js";

function getAuthAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// PATCH /api/admin/users/[id] — update user permissions
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const appUser = await getCurrentAppUser();
  if (!appUser || !isSuperAdmin(appUser)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();

  const allowed: Record<string, unknown> = {};
  if (body.allowed_features !== undefined)
    allowed.allowed_features = body.allowed_features;
  if (body.allowed_phones !== undefined)
    allowed.allowed_phones = body.allowed_phones;
  if (body.password !== undefined) allowed._password = body.password;

  // Update password if provided
  if (body.password) {
    const authAdmin = getAuthAdmin();
    const { error: pwError } = await authAdmin.auth.admin.updateUserById(id, {
      password: body.password,
    });
    if (pwError) {
      return NextResponse.json({ error: pwError.message }, { status: 400 });
    }
  }

  // Update app_users row
  const updates: Record<string, unknown> = {};
  if (body.allowed_features !== undefined)
    updates.allowed_features = body.allowed_features;
  if (body.allowed_phones !== undefined)
    updates.allowed_phones = body.allowed_phones;

  if (Object.keys(updates).length > 0) {
    updates.updated_at = new Date().toISOString();
    const admin = getSupabase();
    const { data, error } = await admin
      .from("app_users")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(data);
  }

  return NextResponse.json({ ok: true });
}

// DELETE /api/admin/users/[id] — delete user
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const appUser = await getCurrentAppUser();
  if (!appUser || !isSuperAdmin(appUser)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  // Prevent deleting self
  if (id === appUser.id) {
    return NextResponse.json(
      { error: "Cannot delete yourself" },
      { status: 400 }
    );
  }

  // Delete from app_users (cascade from auth.users will also work)
  const admin = getSupabase();
  await admin.from("app_users").delete().eq("id", id);

  // Delete auth user
  const authAdmin = getAuthAdmin();
  const { error } = await authAdmin.auth.admin.deleteUser(id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
