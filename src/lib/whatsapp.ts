export async function sendWhatsAppMedia(
  to: string,
  mediaType: "image" | "audio" | "video" | "document",
  mediaUrl: string,
  caption?: string,
  filename?: string
) {
  const mediaObject: Record<string, string> = { link: mediaUrl };
  if (caption) mediaObject.caption = caption;
  if (mediaType === "document" && filename) mediaObject.filename = filename;

  const res = await fetch(
    `https://graph.facebook.com/v22.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: mediaType,
        [mediaType]: mediaObject,
      }),
    }
  );
  const data = await res.json();
  if (!res.ok || data.error) {
    console.error("WhatsApp Media API error:", JSON.stringify(data));
  }
  return data;
}

export async function sendWhatsAppMessage(to: string, body: string) {
  const res = await fetch(
    `https://graph.facebook.com/v22.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body },
      }),
    }
  );
  const data = await res.json();
  if (!res.ok || data.error) {
    const errMsg = JSON.stringify(data);
    console.error("WhatsApp API error:", errMsg);
    throw new Error(`WhatsApp API error: ${errMsg}`);
  }
  return data;
}

export async function sendWhatsAppTemplate(
  to: string,
  templateName: string,
  languageCode: string
) {
  const res = await fetch(
    `https://graph.facebook.com/v22.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
          name: templateName,
          language: { code: languageCode },
        },
      }),
    }
  );
  const data = await res.json();
  if (!res.ok || data.error) {
    const errMsg = JSON.stringify(data);
    console.error("WhatsApp Template API error:", errMsg);
    throw new Error(`WhatsApp Template API error: ${errMsg}`);
  }
  return data;
}
