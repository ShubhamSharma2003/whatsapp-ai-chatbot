import { createSupabaseServerClient } from "./supabase-server";
import { getSupabase } from "./supabase";
import type { AppUser } from "./types";

const SUPERADMIN_EMAIL = "admin@uniselrealty.com";

/**
 * Get the current authenticated user's app_user record.
 * Auto-provisions superadmin row on first login.
 */
export async function getCurrentAppUser(): Promise<AppUser | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = getSupabase();
  const { data, error } = await admin
    .from("app_users")
    .select("*")
    .eq("id", user.id)
    .single();

  if (data) return data as AppUser;

  // Auto-provision superadmin on first login
  if (user.email === SUPERADMIN_EMAIL) {
    const { data: created, error: insertError } = await admin
      .from("app_users")
      .upsert({
        id: user.id,
        email: user.email,
        role: "superadmin",
        allowed_features: ["dashboard", "campaigns", "settings", "admin"],
        allowed_phones: [],
      }, { onConflict: "id" })
      .select()
      .single();
    if (insertError) {
      console.error("Failed to provision superadmin:", insertError.message);
      return null;
    }
    return created as AppUser;
  }

  return null;
}

export function isSuperAdmin(appUser: AppUser): boolean {
  return appUser.role === "superadmin";
}

export function hasFeature(appUser: AppUser, feature: string): boolean {
  if (appUser.role === "superadmin") return true;
  return appUser.allowed_features.includes(feature as AppUser["allowed_features"][number]);
}

export function canAccessPhone(appUser: AppUser, phone: string): boolean {
  if (appUser.role === "superadmin") return true;
  if (appUser.allowed_phones.length === 0) return false;
  return appUser.allowed_phones.includes(phone);
}
