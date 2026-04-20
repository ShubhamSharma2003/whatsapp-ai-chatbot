import { describe, it, expect } from "vitest";
import { resolveSystemPrompt } from "../ai";
import { PROPERTY_SYSTEM_PROMPT } from "../system-prompt";

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
