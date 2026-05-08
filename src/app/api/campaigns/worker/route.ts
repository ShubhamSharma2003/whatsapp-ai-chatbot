import { NextRequest, NextResponse } from "next/server";
import { runCampaignWorker } from "@/lib/campaign-worker";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const workerSecret = process.env.WORKER_SECRET;

  if (!cronSecret && !workerSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const valid =
    (cronSecret && authHeader === `Bearer ${cronSecret}`) ||
    (workerSecret && authHeader === `Bearer ${workerSecret}`);
  if (!valid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runCampaignWorker();
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }
  return NextResponse.json(result);
}

export async function GET(request: NextRequest) {
  return POST(request);
}
