"use client";

import { useEffect, useState, useCallback } from "react";
import SidebarNav, { MobileNavToggle } from "@/components/ui/SidebarNav";
import { Orbit, Dots } from "@/components/ui/Loaders";

type Tab = "prompt" | "ai" | "behavior" | "calling";

type Settings = {
  system_prompt: string;
  ai_model: string;
  temperature: number;
  max_context_messages: number;
  auto_reply_enabled: boolean;
  default_conversation_mode: "agent" | "human";
  agent_name: string;
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
    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    setSaving(false);
    setSaved(true);
    setSettings(draft);
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
        className="relative flex-shrink-0 w-12 h-6 rounded-full transition-colors duration-200 mt-0.5"
        style={{ background: enabled ? "var(--accent)" : "var(--line-2)" }}
        aria-pressed={enabled}
      >
        <span
          className="absolute top-0.5 w-5 h-5 rounded-full transition-transform duration-200"
          style={{
            background: "white",
            transform: enabled ? "translateX(26px)" : "translateX(2px)",
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
