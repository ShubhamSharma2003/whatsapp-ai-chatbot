import { NextResponse } from "next/server";

export async function GET() {
  const wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

  const res = await fetch(
    `https://graph.facebook.com/v22.0/${wabaId}/message_templates?limit=100`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  const data = await res.json();

  if (!res.ok || data.error) {
    console.error("Meta templates error:", JSON.stringify(data));
    return NextResponse.json({ error: data.error?.message || "Failed to fetch templates" }, { status: 500 });
  }

  // Only return approved templates
  const approved = (data.data || []).filter(
    (t: { status: string }) => t.status === "APPROVED"
  );

  return NextResponse.json(approved);
}
