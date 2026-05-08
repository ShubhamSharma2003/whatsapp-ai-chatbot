const META_VERSION = "v22.0";

export type TemplateParams = Record<string, string> | null | undefined;

export type SendArgs = {
  templateName: string;
  templateLanguage: string;
  templateParams: TemplateParams;
  headerImageUrl: string | null | undefined;
  phone: string;
};

export type SendResult = {
  phone: string;
  ok: boolean;
  waMessageId: string | null;
  errorMsg: string | null;
};

function buildMetaPayload(args: SendArgs) {
  const components: unknown[] = [];
  if (args.headerImageUrl) {
    components.push({
      type: "header",
      parameters: [{ type: "image", image: { link: args.headerImageUrl } }],
    });
  }
  if (args.templateParams && Object.keys(args.templateParams).length > 0) {
    const params = args.templateParams;
    components.push({
      type: "body",
      parameters: Object.keys(params)
        .sort((a, b) => Number(a) - Number(b))
        .map((key) => ({ type: "text", text: params[key] })),
    });
  }
  return {
    messaging_product: "whatsapp",
    to: args.phone,
    type: "template",
    template: {
      name: args.templateName,
      language: { code: args.templateLanguage || "en" },
      components,
    },
  };
}

export async function sendTemplate(args: SendArgs): Promise<SendResult> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

  try {
    const res = await fetch(
      `https://graph.facebook.com/${META_VERSION}/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(buildMetaPayload(args)),
      }
    );
    const result = await res.json();
    if (res.ok && !result.error) {
      return {
        phone: args.phone,
        ok: true,
        waMessageId: result.messages?.[0]?.id || null,
        errorMsg: null,
      };
    }
    return {
      phone: args.phone,
      ok: false,
      waMessageId: null,
      errorMsg: result.error?.message || JSON.stringify(result),
    };
  } catch (e) {
    return {
      phone: args.phone,
      ok: false,
      waMessageId: null,
      errorMsg: e instanceof Error ? e.message : "Network error",
    };
  }
}
