"use client";

import { useEffect, useState, useCallback } from "react";
import SidebarNav, { MobileNavToggle } from "@/components/ui/SidebarNav";
import { Orbit, Dots } from "@/components/ui/Loaders";

type Tab = "prompt" | "ai" | "behavior" | "calling" | "direct-form";

type DirectFormMessage =
  | {
      type: "template";
      template_name: string;
      template_language?: string;
      header_image_url?: string | null;
      header_media_type?: "image" | "document" | "video" | null;
      header_filename?: string | null;
      body_text?: string | null;
      body_params?: Array<
        | { type: "name" }
        | { type: "body_text" }
        | { type: "literal"; value: string }
      > | null;
    }
  | { type: "text"; text: string }
  | {
      type: "media";
      url: string;
      mime?: string | null;
      filename?: string | null;
      caption?: string | null;
    };

type Settings = {
  system_prompt: string;
  ai_model: string;
  temperature: number;
  max_context_messages: number;
  auto_reply_enabled: boolean;
  default_conversation_mode: "agent" | "human";
  agent_name: string;
  direct_form_trigger_enabled: boolean;
  direct_form_trigger_phrase: string;
  direct_form_messages: DirectFormMessage[];
};

type CallSettings = {
  vapi_api_key: string;
  vapi_phone_number_id: string;
  default_assistant_id: string;
  max_concurrent_calls: number;
};

const MODELS = [
  { value: "gpt-4o", label: "GPT-4o", note: "Most capable" },
  { value: "gpt-4o-mini", label: "GPT-4o Mini", note: "Fast & affordable" },
  { value: "gpt-4-turbo", label: "GPT-4 Turbo", note: "High quality" },
  { value: "gpt-3.5-turbo", label: "GPT-3.5 Turbo", note: "Legacy, cheapest" },
];

const TABS: { id: Tab; label: string; description: string; color: string }[] = [
  { id: "prompt", label: "Prompt", description: "Voice & persona", color: "var(--emerald)" },
  { id: "ai", label: "Model", description: "Engine & sampling", color: "var(--violet)" },
  { id: "behavior", label: "Behaviour", description: "Reply policy", color: "var(--sapphire)" },
  { id: "calling", label: "Calling", description: "VAPI keys", color: "var(--coral)" },
  { id: "direct-form", label: "Direct form", description: "Lead-form auto-reply", color: "var(--warn)" },
];

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>("prompt");
  const [settings, setSettings] = useState<Settings | null>(null);
  const [draft, setDraft] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [callSettings, setCallSettings] = useState<CallSettings | null>(null);
  const [callSettingsDraft, setCallSettingsDraft] = useState<CallSettings | null>(null);
  const [callSettingsSaving, setCallSettingsSaving] = useState(false);
  const [callSettingsSaved, setCallSettingsSaved] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const fetchSettings = useCallback(async () => {
    const res = await fetch("/api/settings");
    const data = await res.json();
    setSettings(data);
    setDraft(data);
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  useEffect(() => {
    fetch("/api/ai-calling/settings")
      .then((r) => r.json())
      .then((d) => {
        setCallSettings(d);
        setCallSettingsDraft(d);
      })
      .catch(() => {});
  }, []);

  async function handleCallSettingsSave() {
    if (!callSettingsDraft) return;
    setCallSettingsSaving(true);
    await fetch("/api/ai-calling/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(callSettingsDraft),
    });
    setCallSettingsSaving(false);
    setCallSettingsSaved(true);
    setCallSettings(callSettingsDraft);
    setTimeout(() => setCallSettingsSaved(false), 2500);
  }

  async function handleSave() {
    if (!draft) return;
    setSaving(true);
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    setSaving(false);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error("Failed to save settings:", err);
      alert(`Failed to save settings: ${err.error || res.statusText}`);
      return;
    }
    const persisted = await res.json();
    setSettings(persisted);
    setDraft(persisted);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  function updateDraft(key: keyof Settings, value: unknown) {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  const isDirty = JSON.stringify(draft) !== JSON.stringify(settings);
  const isCallSettingsDirty = JSON.stringify(callSettingsDraft) !== JSON.stringify(callSettings);
  const dirty = tab === "calling" ? isCallSettingsDirty : isDirty;
  const canSave = tab === "calling" ? !!callSettingsDraft && isCallSettingsDirty : !!draft && isDirty;

  if (!draft) {
    return (
      <div className="flex h-screen items-center justify-center bg-paper mesh-canvas">
        <div className="flex flex-col items-center gap-4">
          <Orbit size="lg" />
          <p className="eyebrow text-[10px] text-muted">Loading settings</p>
        </div>
      </div>
    );
  }


  return (
    <div className="flex h-screen bg-paper">
      <SidebarNav active="/settings" open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="px-5 md:px-10 py-6 border-b border-line bg-surface flex-shrink-0">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <MobileNavToggle onClick={() => setSidebarOpen(true)} />
              <div className="min-w-0">
                <p className="eyebrow">Configuration</p>
                <h1 className="font-display text-[28px] leading-none tracking-tight text-ink mt-2">
                  Settings
                </h1>
              </div>
            </div>

            <button
              onClick={tab === "calling" ? handleCallSettingsSave : handleSave}
              disabled={!canSave || saving || callSettingsSaving}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-[13px] font-medium transition-all relative overflow-hidden"
              style={{
                background:
                  saved || callSettingsSaved
                    ? "var(--emerald-soft)"
                    : dirty
                    ? "linear-gradient(135deg, #14A871 0%, #0A7350 100%)"
                    : "var(--surface-2)",
                color:
                  saved || callSettingsSaved ? "var(--emerald-deep)" : dirty ? "white" : "var(--subtle)",
                border: `1px solid ${
                  saved || callSettingsSaved
                    ? "var(--emerald)"
                    : dirty
                    ? "transparent"
                    : "var(--line)"
                }`,
                boxShadow: dirty
                  ? "0 6px 16px -4px rgba(14, 138, 95, 0.4)"
                  : "var(--shadow-xs)",
                cursor: !canSave ? "default" : "pointer",
              }}
            >
              {(saving || callSettingsSaving) ? (
                <>
                  <Dots />
                  Saving…
                </>
              ) : (saved || callSettingsSaved) ? (
                <>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  Saved
                </>
              ) : (
                <>
                  Save changes
                </>
              )}
            </button>
          </div>

          {/* Tab nav */}
          <nav className="flex gap-1 mt-7 -mb-px overflow-x-auto" role="tablist">
            {TABS.map((t) => {
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  role="tab"
                  aria-selected={active}
                  className="group relative px-4 py-2.5 text-[13px] font-medium transition-colors flex flex-col items-start gap-0.5 min-w-fit"
                  style={{
                    color: active ? "var(--ink)" : "var(--muted)",
                  }}
                >
                  <span className="flex items-center gap-2">
                    <span
                      className="w-1.5 h-1.5 rounded-full transition-opacity"
                      style={{
                        background: t.color,
                        opacity: active ? 1 : 0.35,
                      }}
                    />
                    {t.label}
                  </span>
                  <span className="text-[10px] uppercase tracking-wider text-subtle">
                    {t.description}
                  </span>
                  <span
                    className="absolute -bottom-px left-0 right-0 h-[2px] transition-all rounded-full"
                    style={{
                      background: active ? t.color : "transparent",
                    }}
                  />
                </button>
              );
            })}
          </nav>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 md:px-10 py-8">
          <div className="max-w-3xl space-y-6">
            {tab === "prompt" && (
              <>
                <Section
                  title="System prompt"
                  description="The core instruction passed to the AI before every conversation. Defines persona, knowledge, and behaviour."
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[11.5px] text-subtle uppercase tracking-wider tnum">
                      {draft.system_prompt.length} chars
                    </span>
                    <button
                      onClick={() => updateDraft("system_prompt", "")}
                      className="text-[12px] text-muted hover:text-ink transition-colors"
                    >
                      Clear
                    </button>
                  </div>
                  <textarea
                    value={draft.system_prompt}
                    onChange={(e) => updateDraft("system_prompt", e.target.value)}
                    rows={20}
                    className="w-full rounded-md px-4 py-3 text-[13px] leading-relaxed focus:outline-none resize-y font-mono bg-surface-2 text-ink border border-line focus:border-accent focus:ring-2 focus:ring-accent-soft transition-all"
                    style={{ minHeight: "320px" }}
                    placeholder="You are a helpful assistant…"
                  />
                  <p className="text-[12px] text-muted mt-3 leading-relaxed">
                    Tip — be specific about the AI&apos;s name, tone, what it should and shouldn&apos;t say, and how it should handle unknown questions.
                  </p>
                </Section>

                <Section
                  title="Agent name"
                  description="Used to identify the AI agent in the system prompt and UI."
                >
                  <input
                    type="text"
                    value={draft.agent_name}
                    onChange={(e) => updateDraft("agent_name", e.target.value)}
                    placeholder="Pallavi"
                    className="w-full max-w-xs bg-surface-2 border border-line rounded-md px-4 py-2.5 text-[14px] text-ink focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft transition-all"
                  />
                </Section>
              </>
            )}

            {tab === "ai" && (
              <>
                <Section
                  title="AI model"
                  description="The OpenAI model used to generate responses. More capable models cost more per message."
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {MODELS.map((m) => {
                      const active = draft.ai_model === m.value;
                      return (
                        <button
                          key={m.value}
                          onClick={() => updateDraft("ai_model", m.value)}
                          className="flex items-center gap-3 px-4 py-3.5 rounded-md text-left transition-all"
                          style={{
                            background: active ? "var(--accent-tint)" : "var(--surface-2)",
                            border: `1.5px solid ${active ? "var(--accent)" : "var(--line)"}`,
                          }}
                        >
                          <div
                            className="w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center"
                            style={{ borderColor: active ? "var(--accent)" : "var(--line-2)" }}
                          >
                            {active && (
                              <div className="w-2 h-2 rounded-full" style={{ background: "var(--accent)" }} />
                            )}
                          </div>
                          <div>
                            <p className="text-[14px] font-medium text-ink font-mono tracking-tight">{m.label}</p>
                            <p className="text-[11.5px] text-muted mt-0.5">{m.note}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-5 pt-5 border-t border-line">
                    <label className="eyebrow text-[10px] block mb-2">Custom model ID</label>
                    <input
                      type="text"
                      value={draft.ai_model}
                      onChange={(e) => updateDraft("ai_model", e.target.value)}
                      placeholder="gpt-4o-mini"
                      className="w-full max-w-xs bg-surface-2 border border-line rounded-md px-4 py-2.5 text-[13px] font-mono text-ink focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft transition-all"
                    />
                  </div>
                </Section>

                <Section
                  title="Temperature"
                  description="Controls randomness. Lower = more predictable. Higher = more creative."
                >
                  <div className="space-y-3">
                    <div className="flex items-center gap-4">
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={draft.temperature}
                        onChange={(e) => updateDraft("temperature", parseFloat(e.target.value))}
                        className="flex-1"
                      />
                      <span
                        className="w-16 text-center rounded-md px-3 py-1.5 text-[14px] font-mono font-semibold tnum bg-ink text-paper"
                      >
                        {draft.temperature.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between text-[11px] text-subtle uppercase tracking-wider">
                      <span>Deterministic</span>
                      <span>Balanced</span>
                      <span>Creative</span>
                    </div>
                  </div>
                </Section>

                <Section
                  title="Context window"
                  description="How many previous messages to send with each request. More = better replies but higher cost."
                >
                  <div className="flex items-center gap-4">
                    <input
                      type="range"
                      min="4"
                      max="50"
                      step="2"
                      value={draft.max_context_messages}
                      onChange={(e) => updateDraft("max_context_messages", parseInt(e.target.value))}
                      className="flex-1"
                    />
                    <span
                      className="w-20 text-center rounded-md px-3 py-1.5 text-[14px] font-mono font-semibold tnum bg-ink text-paper"
                    >
                      {draft.max_context_messages}
                    </span>
                  </div>
                  <p className="text-[12px] text-muted mt-3">
                    Last <span className="font-mono tnum text-ink">{draft.max_context_messages}</span> messages sent per AI request.
                  </p>
                </Section>
              </>
            )}

            {tab === "behavior" && (
              <>
                <Section
                  title="Auto-reply"
                  description="When enabled, the AI automatically responds to all incoming WhatsApp messages."
                >
                  <Toggle
                    enabled={draft.auto_reply_enabled}
                    onChange={(v) => updateDraft("auto_reply_enabled", v)}
                    label={draft.auto_reply_enabled ? "Auto-reply is ON" : "Auto-reply is OFF"}
                    sublabel={
                      draft.auto_reply_enabled
                        ? "The AI will respond to new messages automatically."
                        : "No messages will be sent automatically. Human mode only."
                    }
                  />
                </Section>

                <Section
                  title="Default conversation mode"
                  description="Applied to new conversations when first created."
                >
                  <div className="flex flex-wrap gap-3">
                    {(["agent", "human"] as const).map((mode) => {
                      const active = draft.default_conversation_mode === mode;
                      const isAgent = mode === "agent";
                      return (
                        <button
                          key={mode}
                          onClick={() => updateDraft("default_conversation_mode", mode)}
                          className="flex items-center gap-2.5 px-4 py-2.5 rounded-md text-[13.5px] font-medium capitalize transition-all"
                          style={{
                            background: active
                              ? isAgent
                                ? "var(--accent-tint)"
                                : "var(--warn-soft)"
                              : "var(--surface-2)",
                            border: `1.5px solid ${
                              active
                                ? isAgent
                                  ? "var(--accent)"
                                  : "var(--warn)"
                                : "var(--line)"
                            }`,
                            color: active
                              ? isAgent
                                ? "var(--accent-ink)"
                                : "var(--warn-ink)"
                              : "var(--muted)",
                          }}
                        >
                          <span
                            className="w-2 h-2 rounded-full"
                            style={{
                              background: active
                                ? isAgent
                                  ? "var(--accent)"
                                  : "var(--warn)"
                                : "var(--subtle)",
                            }}
                          />
                          {isAgent ? "AI Agent" : "Human"}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[12px] text-muted mt-4">
                    {draft.default_conversation_mode === "agent"
                      ? "New conversations will be handled by the AI automatically."
                      : "New conversations will wait for a human agent to reply."}
                  </p>

                  <BulkApplyMode mode={draft.default_conversation_mode} />
                </Section>

                <Section
                  title="Database schema"
                  description="Run this in your Supabase SQL Editor to create the settings table if needed."
                >
                  <pre
                    className="rounded-md p-4 text-[12px] font-mono overflow-x-auto leading-relaxed bg-surface-2 text-ink border border-line"
                  >{`CREATE TABLE IF NOT EXISTS settings (
  id int primary key default 1 check (id = 1),
  system_prompt text not null default '',
  ai_model text not null default 'gpt-4o-mini',
  temperature numeric(3,2) not null default 0.7,
  max_context_messages int not null default 20,
  auto_reply_enabled boolean not null default true,
  default_conversation_mode text not null default 'agent'
    check (default_conversation_mode in ('agent', 'human')),
  agent_name text not null default 'Pallavi',
  updated_at timestamp with time zone default now()
);`}</pre>
                </Section>
              </>
            )}

            {tab === "calling" && callSettingsDraft && (
              <>
                <Section
                  title="VAPI credentials"
                  description="Stored encrypted. These power the AI Calling pipeline."
                >
                  <div className="space-y-5">
                    <Field label="VAPI API Key">
                      <input
                        type="password"
                        value={callSettingsDraft.vapi_api_key}
                        onChange={(e) =>
                          setCallSettingsDraft((p) => (p ? { ...p, vapi_api_key: e.target.value } : p))
                        }
                        className="w-full bg-surface-2 border border-line rounded-md px-4 py-2.5 text-[14px] font-mono text-ink focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft transition-all"
                        placeholder="vapi_…"
                      />
                    </Field>
                    <Field label="Phone Number ID">
                      <input
                        type="text"
                        value={callSettingsDraft.vapi_phone_number_id}
                        onChange={(e) =>
                          setCallSettingsDraft((p) =>
                            p ? { ...p, vapi_phone_number_id: e.target.value } : p
                          )
                        }
                        className="w-full bg-surface-2 border border-line rounded-md px-4 py-2.5 text-[14px] font-mono text-ink focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft transition-all"
                        placeholder="pn_…"
                      />
                    </Field>
                    <Field label="Default Assistant ID">
                      <input
                        type="text"
                        value={callSettingsDraft.default_assistant_id}
                        onChange={(e) =>
                          setCallSettingsDraft((p) =>
                            p ? { ...p, default_assistant_id: e.target.value } : p
                          )
                        }
                        className="w-full bg-surface-2 border border-line rounded-md px-4 py-2.5 text-[14px] font-mono text-ink focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft transition-all"
                        placeholder="asst_…"
                      />
                    </Field>
                  </div>
                </Section>

                <Section
                  title="Concurrency"
                  description="Maximum simultaneous outbound calls."
                >
                  <div className="flex items-center gap-4">
                    <input
                      type="range"
                      min={1}
                      max={10}
                      value={callSettingsDraft.max_concurrent_calls}
                      onChange={(e) =>
                        setCallSettingsDraft((p) =>
                          p ? { ...p, max_concurrent_calls: Number(e.target.value) } : p
                        )
                      }
                      className="flex-1"
                    />
                    <span
                      className="w-12 text-center rounded-md px-3 py-1.5 text-[14px] font-mono font-semibold tnum bg-ink text-paper"
                    >
                      {callSettingsDraft.max_concurrent_calls}
                    </span>
                  </div>
                  <div className="flex justify-between text-[11px] text-subtle uppercase tracking-wider mt-2">
                    <span>Single line</span>
                    <span>Max 10</span>
                  </div>
                </Section>
              </>
            )}

            {tab === "direct-form" && (
              <DirectFormPanel
                draft={draft}
                onChange={(patch) =>
                  setDraft((prev) => (prev ? { ...prev, ...patch } : prev))
                }
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-surface rounded-lg border border-line overflow-hidden">
      <header className="px-6 py-5 border-b border-line bg-surface-2">
        <h3 className="font-display text-[18px] tracking-tight text-ink leading-tight">{title}</h3>
        <p className="text-[12.5px] text-muted mt-1 leading-relaxed">{description}</p>
      </header>
      <div className="px-6 py-6">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="eyebrow text-[10px] block mb-2">{label}</label>
      {children}
    </div>
  );
}

function Toggle({
  enabled,
  onChange,
  label,
  sublabel,
}: {
  enabled: boolean;
  onChange: (v: boolean) => void;
  label: string;
  sublabel: string;
}) {
  return (
    <div className="flex items-start gap-4">
      <button
        onClick={() => onChange(!enabled)}
        className="relative flex-shrink-0 w-11 h-6 rounded-full transition-colors duration-200 mt-0.5"
        style={{ background: enabled ? "var(--accent)" : "#cbd5e1" }}
        aria-pressed={enabled}
      >
        <span
          className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full transition-transform duration-200"
          style={{
            background: "white",
            transform: enabled ? "translateX(20px)" : "translateX(0px)",
            boxShadow: "0 1px 3px rgba(14, 20, 16, 0.2)",
          }}
        />
      </button>
      <div>
        <p className="text-[14px] font-medium text-ink">{label}</p>
        <p className="text-[12.5px] text-muted mt-0.5 leading-relaxed">{sublabel}</p>
      </div>
    </div>
  );
}

function BulkApplyMode({ mode }: { mode: "agent" | "human" }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ updated: number } | null>(null);

  async function apply() {
    const label = mode === "agent" ? "AI Agent" : "Human";
    if (!confirm(`Switch every existing conversation to ${label} mode? This cannot be undone.`)) {
      return;
    }
    setBusy(true);
    setResult(null);
    const res = await fetch("/api/conversations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode }),
    });
    setBusy(false);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(`Failed: ${err.error || res.statusText}`);
      return;
    }
    const data = await res.json();
    setResult({ updated: data.updated });
  }

  return (
    <div className="mt-5 pt-5 border-t border-line flex flex-wrap items-center gap-3">
      <button
        onClick={apply}
        disabled={busy}
        className="btn-ghost text-[12.5px] flex items-center gap-2 disabled:opacity-50"
      >
        {busy ? (
          <Dots />
        ) : (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
        )}
        Apply {mode === "agent" ? "AI Agent" : "Human"} mode to all existing conversations
      </button>
      {result && (
        <span className="text-[12px]" style={{ color: "var(--emerald-deep)" }}>
          ✓ {result.updated} conversation{result.updated === 1 ? "" : "s"} updated
        </span>
      )}
    </div>
  );
}

type WaTemplateButton = {
  type: string;
  text: string;
  url?: string;
  phone_number?: string;
};

type WaTemplateComponent = {
  type: string;
  format?: string;
  text?: string;
  buttons?: WaTemplateButton[];
};

type WaTemplate = {
  id: string;
  name: string;
  status: string;
  language: string;
  category: string;
  components: WaTemplateComponent[];
};

function getTemplateBody(t: WaTemplate | null): string {
  return t?.components?.find((c) => c.type === "BODY")?.text || "";
}

function getTemplateFooter(t: WaTemplate | null): string | null {
  return t?.components?.find((c) => c.type === "FOOTER")?.text || null;
}

function getTemplateButtons(t: WaTemplate | null): WaTemplateButton[] {
  return t?.components?.find((c) => c.type === "BUTTONS")?.buttons || [];
}

function getTemplateHeaderFormat(
  t: WaTemplate | null
): "IMAGE" | "DOCUMENT" | "VIDEO" | null {
  const fmt = t?.components?.find((c) => c.type === "HEADER")?.format;
  if (fmt === "IMAGE" || fmt === "DOCUMENT" || fmt === "VIDEO") return fmt;
  return null;
}

function getTemplatePlaceholders(t: WaTemplate | null): string[] {
  const body = getTemplateBody(t);
  const matches = body.match(/\{\{(\d+)\}\}/g) || [];
  return [...new Set(matches.map((m) => m.replace(/\{\{|\}\}/g, "")))].sort(
    (a, b) => Number(a) - Number(b)
  );
}

function DirectFormPanel({
  draft,
  onChange,
}: {
  draft: Settings;
  onChange: (patch: Partial<Settings>) => void;
}) {
  const messages = draft.direct_form_messages ?? [];
  const [templates, setTemplates] = useState<WaTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);

  useEffect(() => {
    setLoadingTemplates(true);
    fetch("/api/campaigns/templates")
      .then((r) => r.json())
      .then((d) => setTemplates(Array.isArray(d) ? d : []))
      .catch(() => setTemplates([]))
      .finally(() => setLoadingTemplates(false));
  }, []);

  function update(idx: number, patch: Partial<DirectFormMessage>) {
    const next = messages.map((m, i) =>
      i === idx ? ({ ...m, ...patch } as DirectFormMessage) : m
    );
    onChange({ direct_form_messages: next });
  }

  function remove(idx: number) {
    onChange({
      direct_form_messages: messages.filter((_, i) => i !== idx),
    });
  }

  function move(idx: number, dir: -1 | 1) {
    const j = idx + dir;
    if (j < 0 || j >= messages.length) return;
    const next = messages.slice();
    [next[idx], next[j]] = [next[j], next[idx]];
    onChange({ direct_form_messages: next });
  }

  function add(type: DirectFormMessage["type"]) {
    let item: DirectFormMessage;
    if (type === "template") {
      item = {
        type: "template",
        template_name: "",
        template_language: "en",
        header_image_url: null,
        body_text: "",
        body_params: [],
      };
    } else if (type === "text") {
      item = { type: "text", text: "" };
    } else {
      item = {
        type: "media",
        url: "",
        mime: null,
        filename: null,
        caption: null,
      };
    }
    onChange({ direct_form_messages: [...messages, item] });
  }

  return (
    <>
      <Section
        title="Trigger"
        description="When a NEW direct-source conversation's first inbound message contains this phrase, the message sequence below is sent in order. AI auto-reply still fires after."
      >
        <Toggle
          enabled={draft.direct_form_trigger_enabled}
          onChange={(v) => onChange({ direct_form_trigger_enabled: v })}
          label={
            draft.direct_form_trigger_enabled
              ? "Direct-form trigger is ON"
              : "Direct-form trigger is OFF"
          }
          sublabel={
            draft.direct_form_trigger_enabled
              ? "Matching first messages will receive the configured sequence."
              : "No automatic sequence will be sent on direct-form leads."
          }
        />
        <div className="mt-6">
          <label className="eyebrow text-[10px] block mb-2">Trigger phrase</label>
          <textarea
            value={draft.direct_form_trigger_phrase}
            onChange={(e) =>
              onChange({ direct_form_trigger_phrase: e.target.value })
            }
            rows={3}
            className="w-full rounded-md px-4 py-3 text-[13px] leading-relaxed focus:outline-none resize-y bg-surface-2 text-ink border border-line focus:border-accent focus:ring-2 focus:ring-accent-soft transition-all"
            placeholder="Hello! I filled out your form and would like to know more about your business."
          />
          <p className="text-[12px] text-muted mt-2">
            Case-insensitive substring match against the user&apos;s first message.
          </p>
        </div>
      </Section>

      <Section
        title="Message sequence"
        description="Sent in order, top to bottom. Mix templates (Meta-approved), free-form text, and media attachments."
      >
        <div className="space-y-3">
          {messages.length === 0 && (
            <p className="text-[12.5px] text-muted italic">
              No messages configured yet. Add one below.
            </p>
          )}
          {messages.map((msg, idx) => (
            <DirectFormMessageEditor
              key={idx}
              index={idx}
              total={messages.length}
              message={msg}
              onChange={(patch) => update(idx, patch)}
              onRemove={() => remove(idx)}
              onMove={(dir) => move(idx, dir)}
              templates={templates}
              loadingTemplates={loadingTemplates}
            />
          ))}
        </div>
        <div className="mt-5 pt-5 border-t border-line flex flex-wrap gap-2">
          <button
            onClick={() => add("template")}
            className="btn-ghost text-[12.5px]"
          >
            + Template
          </button>
          <button
            onClick={() => add("text")}
            className="btn-ghost text-[12.5px]"
          >
            + Text
          </button>
          <button
            onClick={() => add("media")}
            className="btn-ghost text-[12.5px]"
          >
            + Attachment
          </button>
        </div>
      </Section>
    </>
  );
}

function DirectFormMessageEditor({
  index,
  total,
  message,
  onChange,
  onRemove,
  onMove,
  templates,
  loadingTemplates,
}: {
  index: number;
  total: number;
  message: DirectFormMessage;
  onChange: (patch: Partial<DirectFormMessage>) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
  templates: WaTemplate[];
  loadingTemplates: boolean;
}) {
  const typeLabel =
    message.type === "template"
      ? "Template"
      : message.type === "text"
      ? "Text"
      : "Attachment";
  const typeColor =
    message.type === "template"
      ? "var(--violet)"
      : message.type === "text"
      ? "var(--sapphire)"
      : "var(--coral)";

  return (
    <div className="rounded-lg border border-line bg-surface-2 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-full"
            style={{ background: typeColor }}
          />
          <span className="text-[11.5px] uppercase tracking-wider text-subtle font-medium">
            {index + 1}. {typeLabel}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onMove(-1)}
            disabled={index === 0}
            className="text-[12px] text-muted hover:text-ink disabled:opacity-30 px-2"
            aria-label="Move up"
          >
            ↑
          </button>
          <button
            onClick={() => onMove(1)}
            disabled={index === total - 1}
            className="text-[12px] text-muted hover:text-ink disabled:opacity-30 px-2"
            aria-label="Move down"
          >
            ↓
          </button>
          <button
            onClick={onRemove}
            className="text-[12px] text-muted hover:text-ink px-2"
            aria-label="Remove"
          >
            ✕
          </button>
        </div>
      </div>

      {message.type === "template" && (
        <TemplateEditor
          message={message}
          onChange={onChange}
          templates={templates}
          loadingTemplates={loadingTemplates}
        />
      )}
      {message.type === "text" && (
        <textarea
          value={message.text}
          onChange={(e) => onChange({ text: e.target.value })}
          rows={3}
          className="w-full rounded-md px-3 py-2 text-[13px] leading-relaxed focus:outline-none resize-y bg-surface text-ink border border-line focus:border-accent focus:ring-2 focus:ring-accent-soft transition-all"
          placeholder="Free-form text message…"
        />
      )}
      {message.type === "media" && (
        <MediaEditor message={message} onChange={onChange} />
      )}
    </div>
  );
}

function TemplateEditor({
  message,
  onChange,
  templates,
  loadingTemplates,
}: {
  message: Extract<DirectFormMessage, { type: "template" }>;
  onChange: (patch: Partial<DirectFormMessage>) => void;
  templates: WaTemplate[];
  loadingTemplates: boolean;
}) {
  const selected =
    templates.find(
      (t) =>
        t.name === message.template_name &&
        t.language === (message.template_language || "en")
    ) || null;

  const placeholders = getTemplatePlaceholders(selected);
  const params = message.body_params ?? [];

  // Keep params length in sync with detected placeholders. Extras become empty
  // literals; missing ones default to {type:"literal", value:""}.
  function ensureParamCount(target: number): typeof params {
    const next = params.slice(0, target);
    while (next.length < target) {
      // First placeholder defaults to {{name}} for the common "Hi {{1}}" pattern.
      if (next.length === 0) next.push({ type: "name" });
      else next.push({ type: "literal", value: "" });
    }
    return next;
  }

  function pickTemplate(name: string) {
    if (!name) {
      onChange({ template_name: "", template_language: "en", body_params: [] });
      return;
    }
    const t = templates.find((x) => x.name === name);
    if (!t) return;
    const phCount = getTemplatePlaceholders(t).length;
    const defaultParams: Array<
      | { type: "name" }
      | { type: "body_text" }
      | { type: "literal"; value: string }
    > = [];
    for (let i = 0; i < phCount; i++) {
      defaultParams.push(
        i === 0 ? { type: "name" } : { type: "literal", value: "" }
      );
    }
    const fmt = getTemplateHeaderFormat(t);
    onChange({
      template_name: t.name,
      template_language: t.language,
      body_text: getTemplateBody(t),
      body_params: defaultParams,
      header_image_url: fmt ? message.header_image_url ?? null : null,
      header_media_type: fmt
        ? (fmt.toLowerCase() as "image" | "document" | "video")
        : null,
      header_filename: fmt === "DOCUMENT" ? message.header_filename ?? null : null,
    });
  }

  function updateParam(
    i: number,
    spec:
      | { type: "name" }
      | { type: "body_text" }
      | { type: "literal"; value: string }
  ) {
    const target = ensureParamCount(Math.max(placeholders.length, params.length));
    const next = target.map((p, idx) => (idx === i ? spec : p));
    onChange({ body_params: next });
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="eyebrow text-[10px] block mb-1.5">Approved template</label>
        {loadingTemplates ? (
          <p className="text-[12.5px] text-muted py-2">Loading templates…</p>
        ) : (
          <select
            value={message.template_name || ""}
            onChange={(e) => pickTemplate(e.target.value)}
            className="w-full bg-surface border border-line rounded-md px-3 py-2 text-[13px] text-ink focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft transition-all"
          >
            <option value="">— Select template —</option>
            {templates.map((t) => (
              <option key={t.id} value={t.name}>
                {t.name} ({t.language}) — {t.category}
              </option>
            ))}
          </select>
        )}
        {!loadingTemplates && templates.length === 0 && (
          <p className="text-[11.5px] text-muted mt-1.5">
            No approved templates found in your Meta account.
          </p>
        )}
      </div>

      {selected && (
        <TemplatePreview
          template={selected}
          headerImageUrl={message.header_image_url ?? null}
          headerFilename={message.header_filename ?? null}
          params={ensureParamCount(placeholders.length)}
        />
      )}

      {selected && getTemplateHeaderFormat(selected) && (
        <TemplateHeaderUploader
          format={getTemplateHeaderFormat(selected)!}
          url={message.header_image_url ?? null}
          filename={message.header_filename ?? null}
          onChange={(patch) => onChange(patch)}
        />
      )}

      {placeholders.length > 0 && (
        <div>
          <label className="eyebrow text-[10px] block mb-1.5">
            Body params ({placeholders.length} required)
          </label>
          <div className="space-y-1.5">
            {placeholders.map((ph, i) => {
              const filled = ensureParamCount(placeholders.length);
              const p = filled[i];
              return (
                <div key={ph} className="flex items-center gap-2">
                  <span className="text-[11px] font-mono text-subtle w-10">
                    {`{{${ph}}}`}
                  </span>
                  <select
                    value={p.type}
                    onChange={(e) => {
                      const t = e.target.value as
                        | "name"
                        | "body_text"
                        | "literal";
                      updateParam(
                        i,
                        t === "literal"
                          ? { type: "literal", value: "" }
                          : { type: t }
                      );
                    }}
                    className="bg-surface border border-line rounded-md px-2 py-1 text-[12px] text-ink focus:outline-none"
                  >
                    <option value="name">name</option>
                    <option value="body_text">body_text</option>
                    <option value="literal">literal</option>
                  </select>
                  {p.type === "literal" && (
                    <input
                      type="text"
                      value={p.value}
                      onChange={(e) =>
                        updateParam(i, {
                          type: "literal",
                          value: e.target.value,
                        })
                      }
                      className="flex-1 bg-surface border border-line rounded-md px-2 py-1 text-[12px] text-ink focus:outline-none focus:border-accent"
                      placeholder="literal text"
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function TemplateHeaderUploader({
  format,
  url,
  filename,
  onChange,
}: {
  format: "IMAGE" | "DOCUMENT" | "VIDEO";
  url: string | null;
  filename: string | null;
  onChange: (patch: Partial<Extract<DirectFormMessage, { type: "template" }>>) => void;
}) {
  const [uploading, setUploading] = useState(false);

  async function handleUpload(file: File) {
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/settings/upload-direct-attachment", {
      method: "POST",
      body: fd,
    });
    setUploading(false);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(`Upload failed: ${err.error || res.statusText}`);
      return;
    }
    const data = await res.json();
    onChange({
      header_image_url: data.url,
      header_filename: format === "DOCUMENT" ? data.filename : null,
      header_media_type: format.toLowerCase() as "image" | "document" | "video",
    });
  }

  const accept =
    format === "IMAGE"
      ? "image/*"
      : format === "VIDEO"
      ? "video/*"
      : "application/pdf,.pdf";
  const label =
    format === "IMAGE"
      ? "Header image"
      : format === "VIDEO"
      ? "Header video"
      : "Header PDF";

  return (
    <div>
      <label className="eyebrow text-[10px] block mb-1.5">{label}</label>
      <div className="flex items-center gap-3">
        <label className="btn-ghost text-[12.5px] cursor-pointer">
          {uploading ? <Dots /> : url ? "Replace" : "Upload"}
          <input
            type="file"
            accept={accept}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleUpload(f);
            }}
          />
        </label>
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="text-[12px] text-muted hover:text-ink truncate max-w-xs"
          >
            {filename || url}
          </a>
        )}
        {url && (
          <button
            type="button"
            onClick={() =>
              onChange({
                header_image_url: null,
                header_filename: null,
              })
            }
            className="text-[12px] text-muted hover:text-danger"
          >
            Remove
          </button>
        )}
      </div>
      <p className="text-[11.5px] text-muted mt-1.5">
        Required — this template has a {format} header.
      </p>
    </div>
  );
}

function TemplatePreview({
  template,
  headerImageUrl,
  headerFilename,
  params,
}: {
  template: WaTemplate;
  headerImageUrl: string | null;
  headerFilename: string | null;
  params: Array<
    | { type: "name" }
    | { type: "body_text" }
    | { type: "literal"; value: string }
  >;
}) {
  const body = getTemplateBody(template);
  const footer = getTemplateFooter(template);
  const buttons = getTemplateButtons(template);
  const headerFormat = getTemplateHeaderFormat(template);

  // Inline render of body with placeholders substituted by their resolved label
  // so the user sees a realistic preview at config time.
  function paramLabel(
    p: (typeof params)[number] | undefined,
    placeholderNum: string
  ): string {
    if (!p) return `{{${placeholderNum}}}`;
    if (p.type === "name") return "‹name›";
    if (p.type === "body_text") return "‹body_text›";
    return p.value || `{{${placeholderNum}}}`;
  }

  const rendered = body.replace(/\{\{(\d+)\}\}/g, (_, n: string) => {
    const idx = Number(n) - 1;
    return paramLabel(params[idx], n);
  });

  return (
    <div className="rounded-lg border border-line bg-[#dcf8c6]/15 p-3">
      <div className="text-[10px] uppercase tracking-wider text-subtle mb-2">
        Preview
      </div>
      <div className="rounded-md bg-white border border-line p-3 max-w-sm shadow-sm">
        {headerFormat === "IMAGE" && (
          <div className="rounded mb-2 overflow-hidden bg-surface-2 aspect-[16/9] flex items-center justify-center">
            {headerImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={headerImageUrl}
                alt="Header"
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-[11px] text-muted italic">
                Image header (upload below)
              </span>
            )}
          </div>
        )}
        {headerFormat === "VIDEO" && (
          <div className="rounded mb-2 overflow-hidden bg-surface-2 aspect-[16/9] flex items-center justify-center">
            {headerImageUrl ? (
              <video src={headerImageUrl} className="w-full h-full object-cover" muted />
            ) : (
              <span className="text-[11px] text-muted italic">
                Video header (upload below)
              </span>
            )}
          </div>
        )}
        {headerFormat === "DOCUMENT" && (
          <div className="rounded mb-2 px-3 py-2 bg-surface-2 flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            <span className="text-[11.5px] text-ink truncate">
              {headerFilename || (headerImageUrl ? "document.pdf" : "PDF header (upload below)")}
            </span>
          </div>
        )}
        <p className="text-[13px] text-ink whitespace-pre-wrap leading-relaxed">
          {rendered || (
            <span className="text-muted italic">No body text</span>
          )}
        </p>
        {footer && (
          <p className="text-[11.5px] text-muted mt-2">{footer}</p>
        )}
        {buttons.length > 0 && (
          <div className="mt-3 pt-3 border-t border-line space-y-1.5">
            {buttons.map((b, i) => (
              <div
                key={i}
                className="text-center text-[12.5px] text-[#1a73e8] py-1.5 border-t border-line first:border-t-0"
              >
                {b.text}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MediaEditor({
  message,
  onChange,
}: {
  message: Extract<DirectFormMessage, { type: "media" }>;
  onChange: (patch: Partial<DirectFormMessage>) => void;
}) {
  const [uploading, setUploading] = useState(false);

  async function handleUpload(file: File) {
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/settings/upload-direct-attachment", {
      method: "POST",
      body: fd,
    });
    setUploading(false);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(`Upload failed: ${err.error || res.statusText}`);
      return;
    }
    const data = await res.json();
    onChange({
      url: data.url,
      mime: data.mime,
      filename: data.filename,
    });
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="eyebrow text-[10px] block mb-1.5">File</label>
        <div className="flex items-center gap-3">
          <label className="btn-ghost text-[12.5px] cursor-pointer">
            {uploading ? <Dots /> : message.url ? "Replace" : "Upload"}
            <input
              type="file"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleUpload(f);
              }}
            />
          </label>
          {message.url && (
            <a
              href={message.url}
              target="_blank"
              rel="noreferrer"
              className="text-[12px] text-muted hover:text-ink truncate max-w-xs"
            >
              {message.filename || message.url}
            </a>
          )}
        </div>
        <p className="text-[11.5px] text-muted mt-1.5">
          Stored in <code className="font-mono">direct-form-attachments</code> bucket.
        </p>
      </div>
      <div>
        <label className="eyebrow text-[10px] block mb-1.5">Caption (optional)</label>
        <textarea
          value={message.caption ?? ""}
          onChange={(e) => onChange({ caption: e.target.value || null })}
          rows={2}
          className="w-full rounded-md px-3 py-2 text-[13px] leading-relaxed focus:outline-none resize-y bg-surface text-ink border border-line focus:border-accent focus:ring-2 focus:ring-accent-soft transition-all"
          placeholder="Caption shown with attachment"
        />
      </div>
    </div>
  );
}
