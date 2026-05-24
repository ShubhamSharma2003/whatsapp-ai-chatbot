import { NextResponse } from "next/server";
import { getCurrentAppUser, hasFeature } from "@/lib/auth";
import { computeNudgeAnalytics } from "@/lib/nudge-analytics";

const NUDGES_FEATURE = "nudges";

export const dynamic = "force-dynamic";

export async function GET() {
  const appUser = await getCurrentAppUser();
  if (!appUser || !hasFeature(appUser, NUDGES_FEATURE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const data = await computeNudgeAnalytics();
  return NextResponse.json(data);
}
