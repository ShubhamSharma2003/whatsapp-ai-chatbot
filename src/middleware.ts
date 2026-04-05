import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

const SUPERADMIN_EMAIL = "admin@uniselrealty.com";

// Map route prefixes to required features
const FEATURE_ROUTES: Record<string, string> = {
  "/campaigns": "campaigns",
  "/settings": "settings",
  "/admin": "admin",
};

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const { pathname } = request.nextUrl;

  // Allow login and auth callback through
  if (pathname.startsWith("/login") || pathname.startsWith("/auth/callback")) {
    if (session && pathname.startsWith("/login")) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return supabaseResponse;
  }

  // Allow API routes and static assets through without auth
  if (
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/favicon")
  ) {
    return supabaseResponse;
  }

  // Redirect unauthenticated users to login
  if (!session) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Check app_users record for feature-based access on protected pages
  const email = session.user.email;
  const isSuperAdmin = email === SUPERADMIN_EMAIL;

  if (!isSuperAdmin) {
    // Check if this route requires a specific feature
    for (const [routePrefix, feature] of Object.entries(FEATURE_ROUTES)) {
      if (pathname.startsWith(routePrefix)) {
        // Fetch user's allowed features using service role
        const adminClient = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!
        );
        const { data: appUser } = await adminClient
          .from("app_users")
          .select("allowed_features")
          .eq("id", session.user.id)
          .single();

        if (
          !appUser ||
          !appUser.allowed_features.includes(feature)
        ) {
          // Redirect to home with no access
          return NextResponse.redirect(new URL("/", request.url));
        }
        break;
      }
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
