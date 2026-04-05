import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/auth";

// GET /api/me — get current user profile & permissions
export async function GET() {
  const appUser = await getCurrentAppUser();
  if (!appUser) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(appUser);
}
