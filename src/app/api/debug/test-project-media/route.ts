import { NextResponse, type NextRequest } from "next/server";
import { getAIResponse } from "@/lib/ai";
import { getProjectCatalog, getProjectMedia } from "@/lib/projects";

// TEMP — delete after verifying project_media tool calling works.
// GET /api/debug/test-project-media?msg=send%20me%20DLF%20Central%2067%20brochure
//
// Returns the AI's text + mediaSends decision WITHOUT touching WhatsApp.
// Also returns the catalog + the resolved media row (if any) so you can see
// the full pipeline from prompt → tool call → DB lookup.
export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Disabled in production" }, { status: 403 });
  }

  const msg = req.nextUrl.searchParams.get("msg") ?? "send me DLF Central 67 brochure";

  const catalog = await getProjectCatalog();

  const ai = await getAIResponse(
    [
      { role: "user", content: "Hi" },
      {
        role: "assistant",
        content:
          "Hello! I'm Pallavi from Unisel Realty. How can I help you today?",
      },
      { role: "user", content: msg },
    ],
    {
      projectMediaEnabled: true,
      alreadyGreeted: true,
    }
  );

  const resolvedMedia = [];
  for (const s of ai.mediaSends) {
    const media = await getProjectMedia(s.project_slug, s.media_kind);
    resolvedMedia.push({ request: s, found: media });
  }

  return NextResponse.json({
    input_message: msg,
    catalog,
    ai_text: ai.text,
    ai_media_sends: ai.mediaSends,
    resolved_media: resolvedMedia,
  });
}
