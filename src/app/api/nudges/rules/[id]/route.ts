import { NextResponse, type NextRequest } from "next/server";
import { getCurrentAppUser, hasFeature } from "@/lib/auth";
import {
  deleteNudgeRule,
  getNudgeRule,
  updateNudgeRule,
  type NudgeRuleInput,
} from "@/lib/nudge";
import { parseRuleInput } from "../route";

const NUDGES_FEATURE = "nudges";

// GET /api/nudges/rules/[id]
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const appUser = await getCurrentAppUser();
  if (!appUser || !hasFeature(appUser, NUDGES_FEATURE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const rule = await getNudgeRule(id);
  if (!rule) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(rule);
}

// PATCH /api/nudges/rules/[id]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const appUser = await getCurrentAppUser();
  if (!appUser || !hasFeature(appUser, NUDGES_FEATURE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const body = await request.json();

  // Two modes:
  //   Full payload (from rule editor)  → parse + validate fully
  //   Partial toggle (enabled flip)    → allow narrow update
  if (
    typeof body === "object" &&
    body !== null &&
    Object.keys(body).length === 1 &&
    typeof (body as { enabled?: unknown }).enabled === "boolean"
  ) {
    const { data, error } = await updateNudgeRule(id, {
      enabled: (body as { enabled: boolean }).enabled,
    } as Partial<NudgeRuleInput>);
    if (error) return NextResponse.json({ error }, { status: 500 });
    return NextResponse.json(data);
  }

  const parsed = parseRuleInput(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const { data, error } = await updateNudgeRule(id, parsed.input);
  if (error) {
    if (error.includes("duplicate") || error.includes("unique")) {
      return NextResponse.json(
        { error: "A rule with this targeting + attempt number already exists" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error }, { status: 500 });
  }
  return NextResponse.json(data);
}

// DELETE /api/nudges/rules/[id]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const appUser = await getCurrentAppUser();
  if (!appUser || !hasFeature(appUser, NUDGES_FEATURE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const error = await deleteNudgeRule(id);
  if (error) return NextResponse.json({ error }, { status: 500 });
  return NextResponse.json({ ok: true });
}
