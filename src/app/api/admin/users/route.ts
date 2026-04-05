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

// GET /api/admin/users — list all app_users
export async function GET() {
  const appUser = await getCurrentAppUser();
  if (!appUser || !isSuperAdmin(appUser)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = getSupabase();
  const { data, error } = await admin
    .from("app_users")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// POST /api/admin/users — create a new user
export async function POST(request: NextRequest) {
  const appUser = await getCurrentAppUser();
  if (!appUser || !isSuperAdmin(appUser)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { email, password, allowed_features, allowed_phones } = body;

  if (!email || !password) {
    return NextResponse.json(
      { error: "Email and password are required" },
      { status: 400 }
    );
  }

  // Create auth user via Supabase Admin API
  const authAdmin = getAuthAdmin();
  const { data: authData, error: authError } =
    await authAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 400 });
  }

  // Create app_users row
  const admin = getSupabase();
  const { data, error } = await admin
    .from("app_users")
    .insert({
      id: authData.user.id,
      email,
      role: "user",
      allowed_features: allowed_features || [],
      allowed_phones: allowed_phones || [],
    })
    .select()
    .single();

  if (error) {
    // Rollback: delete the auth user if app_users insert fails
    await authAdmin.auth.admin.deleteUser(authData.user.id);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
