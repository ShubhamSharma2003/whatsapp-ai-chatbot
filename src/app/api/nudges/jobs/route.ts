import { NextResponse, type NextRequest } from "next/server";
import { getCurrentAppUser, hasFeature } from "@/lib/auth";
import { listRecentNudgeJobs } from "@/lib/nudge";

const NUDGES_FEATURE = "nudges";

export async function GET(request: NextRequest) {
  const appUser = await getCurrentAppUser();
  if (!appUser || !hasFeature(appUser, NUDGES_FEATURE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const limit = Number(request.nextUrl.searchParams.get("limit") ?? 100);
  const jobs = await listRecentNudgeJobs(Number.isFinite(limit) ? limit : 100);
  return NextResponse.json(jobs);
}
