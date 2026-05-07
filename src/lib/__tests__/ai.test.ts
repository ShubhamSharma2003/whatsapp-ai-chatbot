import { describe, it, expect } from "vitest";
import { resolveSystemPrompt, resolveSystemPromptChain } from "../ai";
import { PROPERTY_SYSTEM_PROMPT } from "../system-prompt";
import {
  resolveTemplateBodyParams,
  mediaTypeFromMime,
  normalizeLeadType,
} from "../lead-types";

describe("resolveSystemPrompt — campaign knowledge base priority", () => {
  it("uses campaign prompt when provided", () => {
    const result = resolveSystemPrompt(
      "Campaign: pitch DLF Central 67",
      "Global: pitch all projects",
    );
    expect(result).toBe("Campaign: pitch DLF Central 67");
  });

  it("falls through to global settings prompt when campaign prompt is null", () => {
    const result = resolveSystemPrompt(null, "Global: pitch all projects");
    expect(result).toBe("Global: pitch all projects");
  });

  it("falls through to global settings prompt when campaign prompt is empty string", () => {
    const result = resolveSystemPrompt("", "Global: pitch all projects");
    expect(result).toBe("Global: pitch all projects");
  });

  it("falls through to global settings prompt when campaign prompt is whitespace only", () => {
    const result = resolveSystemPrompt("   ", "Global: pitch all projects");
    expect(result).toBe("Global: pitch all projects");
  });

  it("falls through to default PROPERTY_SYSTEM_PROMPT when both campaign and global are null", () => {
    const result = resolveSystemPrompt(null, null);
    expect(result).toBe(PROPERTY_SYSTEM_PROMPT);
  });

  it("falls through to default PROPERTY_SYSTEM_PROMPT when both campaign and global are empty", () => {
    const result = resolveSystemPrompt("", "");
    expect(result).toBe(PROPERTY_SYSTEM_PROMPT);
  });

  it("falls through to default when global prompt is whitespace only", () => {
    const result = resolveSystemPrompt(null, "   ");
    expect(result).toBe(PROPERTY_SYSTEM_PROMPT);
  });

  it("trims whitespace from campaign prompt", () => {
    const result = resolveSystemPrompt(
      "  Campaign prompt  ",
      "Global prompt",
    );
    expect(result).toBe("Campaign prompt");
  });
});

describe("resolveSystemPromptChain — campaign > lead-type > global > default", () => {
  it("prefers campaign over lead-type and global", () => {
    expect(
      resolveSystemPromptChain("Campaign", "LeadType", "Global")
    ).toBe("Campaign");
  });

  it("uses lead-type when campaign is empty", () => {
    expect(resolveSystemPromptChain("", "LeadType", "Global")).toBe("LeadType");
    expect(resolveSystemPromptChain(null, "LeadType", "Global")).toBe("LeadType");
  });

  it("falls through to global when campaign and lead-type are empty", () => {
    expect(resolveSystemPromptChain(null, null, "Global")).toBe("Global");
  });

  it("falls through to default when all are empty", () => {
    expect(resolveSystemPromptChain(null, null, null)).toBe(PROPERTY_SYSTEM_PROMPT);
    expect(resolveSystemPromptChain("", "  ", "")).toBe(PROPERTY_SYSTEM_PROMPT);
  });
});

describe("resolveTemplateBodyParams", () => {
  it("defaults to [name, body_text] when no spec provided", () => {
    expect(
      resolveTemplateBodyParams(undefined, { name: "Asha", bodyText: "Hello" })
    ).toEqual(["Asha", "Hello"]);
    expect(
      resolveTemplateBodyParams([], { name: "Asha", bodyText: "Hello" })
    ).toEqual(["Asha", "Hello"]);
  });

  it("resolves name, body_text, and literal specs in order", () => {
    expect(
      resolveTemplateBodyParams(
        [
          { type: "name" },
          { type: "literal", value: "Smart World" },
          { type: "body_text" },
        ],
        { name: "Asha", bodyText: "Hello" }
      )
    ).toEqual(["Asha", "Smart World", "Hello"]);
  });
});

describe("mediaTypeFromMime", () => {
  it("maps PDFs and unknown to document", () => {
    expect(mediaTypeFromMime("application/pdf")).toBe("document");
    expect(mediaTypeFromMime(null)).toBe("document");
    expect(mediaTypeFromMime("application/msword")).toBe("document");
  });

  it("maps image, video, audio prefixes correctly", () => {
    expect(mediaTypeFromMime("image/png")).toBe("image");
    expect(mediaTypeFromMime("video/mp4")).toBe("video");
    expect(mediaTypeFromMime("audio/mpeg")).toBe("audio");
  });
});

describe("normalizeLeadType", () => {
  it("lowercases and accepts allowed slugs", () => {
    expect(normalizeLeadType("Smart_World")).toBe("smart_world");
    expect(normalizeLeadType("dlf-privana")).toBe("dlf-privana");
    expect(normalizeLeadType("office_space_2")).toBe("office_space_2");
  });

  it("rejects empty, whitespace, and invalid characters", () => {
    expect(normalizeLeadType("")).toBeNull();
    expect(normalizeLeadType("  ")).toBeNull();
    expect(normalizeLeadType("Has Space")).toBeNull();
    expect(normalizeLeadType("hello!")).toBeNull();
    expect(normalizeLeadType("a".repeat(65))).toBeNull();
  });
});
