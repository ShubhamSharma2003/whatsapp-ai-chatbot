"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import type { AppUser } from "@/lib/types";

type Tab = "ai" | "prompt" | "behavior" | "calling";

type Settings = {
  system_prompt: string;
  ai_model: string;
  temperature: number;
  max_context_messages: number;
  auto_reply_enabled: boolean;
  default_conversation_mode: "agent" | "human";
  agent_name: string;
};

const MODELS = [
  { value: "gpt-4o", label: "GPT-4o", note: "Most capable" },
  { value: "gpt-4o-mini", label: "GPT-4o Mini", note: "Fast & affordable" },
  { value: "gpt-4-turbo", label: "GPT-4 Turbo", note: "High quality" },
  { value: "gpt-3.5-turbo", label: "GPT-3.5 Turbo", note: "Legacy, cheapest" },
];

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>("prompt");
  const [settings, setSettings] = useState<Settings | null>(null);
  const [draft, setDraft] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [callSettings, setCallSettings] = useState<{
    vapi_api_key: string;
    vapi_phone_number_id: string;
    default_assistant_id: string;
    max_concurrent_calls: number;
  } | null>(null);
  const [callSettingsDraft, setCallSettingsDraft] = useState<{
    vapi_api_key: string;
    vapi_phone_number_id: string;
    default_assistant_id: string;
    max_concurrent_calls: number;
  } | null>(null);
  const [callSettingsSaving, setCallSettingsSaving] = useState(false);
  const [callSettingsSaved, setCallSettingsSaved] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [appUser, setAppUser] = useState<AppUser | null>(null);

  useEffect(() => {
    fetch("/api/me").then((r) => r.json()).then(setAppUser).catch(() => {});
  }, []);

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
    fetch('/api/ai-calling/settings')
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
    await fetch('/api/ai-calling/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(callSettingsDraft),
    });
    setCallSettingsSaving(false);
    setCallSettingsSaved(true);
    setCallSettings(callSettingsDraft);
    setTimeout(() => setCallSettingsSaved(false), 2500);
  }

  const isCallSettingsDirty = JSON.stringify(callSettingsDraft) !== JSON.stringify(callSettings);

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
    setDraft((prev) => prev ? { ...prev, [key]: value } : prev);
  }

  const isDirty = JSON.stringify(draft) !== JSON.stringify(settings);

  if (!draft) {
    return (
      <div className="flex h-screen items-center justify-center" style={{ background: "#0b141a" }}>
        <svg className="animate-spin" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#00a884" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
      </div>
    );
  }

  return (
    <div className="flex h-screen" style={{ background: "#111b21" }}>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <div className={`${sidebarOpen ? "translate-x-0" : "-translate-x-full"} md:translate-x-0 fixed md:static inset-y-0 left-0 z-50 w-[260px] flex flex-col border-r transition-transform duration-200`} style={{ background: "#111b21", borderColor: "#313d45" }}>
        <div className="h-[60px] px-4 flex items-center gap-3" style={{ background: "#202c33" }}>
          <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "#00a884" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <span className="text-[15px] font-medium" style={{ color: "#e9edef" }}>WhatsApp AI</span>
        </div>
        <nav className="flex flex-col gap-0.5 py-2 flex-1">
          {[
            { href: "/", icon: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />, label: "Conversations" },
            { href: "/campaigns", icon: <><path d="M22 2L11 13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></>, label: "Campaigns" },
          ].map(({ href, icon, label }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 px-5 py-3 text-[14px] transition-colors"
              style={{ color: "#8696a0" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#202c33")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">{icon}</svg>
              {label}
            </Link>
          ))}
          {(appUser?.role === 'superadmin' || appUser?.allowed_features?.includes('ai_calling')) && (
            <Link
              href="/ai-calling"
              className="flex items-center gap-3 px-5 py-3 text-[14px] transition-colors"
              style={{ color: '#8696a0' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#202c33')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.63 3.18 2 2 0 0 1 3.6 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.56a16 16 0 0 0 6.29 6.29l.97-.97a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
              AI Calling
            </Link>
          )}
          <div className="flex items-center gap-3 px-5 py-3 text-[14px]" style={{ color: "#e9edef", background: "#2a3942" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            Settings
          </div>
          {appUser?.role === "superadmin" && (
            <Link
              href="/admin/users"
              className="flex items-center gap-3 px-5 py-3 text-[14px] transition-colors"
              style={{ color: "#8696a0" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#202c33")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              User Management
            </Link>
          )}
        </nav>
        <div className="px-3 py-3 border-t" style={{ borderColor: "#313d45" }}>
          <button
            onClick={async () => {
              const { createSupabaseBrowserClient } = await import("@/lib/supabase-browser");
              const sb = createSupabaseBrowserClient();
              await sb.auth.signOut();
              window.location.href = "/login";
            }}
            className="w-full flex items-center gap-3 px-3 py-2 rounded text-[13px] transition-colors"
            style={{ color: "#8696a0" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#202c33")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Sign out
          </button>
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <div className="h-[60px] px-4 md:px-6 flex items-center justify-between gap-3 flex-shrink-0" style={{ background: "#202c33" }}>
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(true)} className="md:hidden w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/5 transition-colors">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#aebac1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
            <div>
              <h2 className="text-[16px] font-normal" style={{ color: "#e9edef" }}>Settings</h2>
              <p className="text-[12px] hidden sm:block" style={{ color: "#8696a0" }}>Configure your AI agent</p>
            </div>
          </div>
          {/* Save button */}
          <button
            onClick={handleSave}
            disabled={saving || !isDirty}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-medium transition-all"
            style={{
              background: saved ? "rgba(0,168,132,0.15)" : isDirty ? "#00a884" : "#2a3942",
              color: saved ? "#00a884" : isDirty ? "white" : "#8696a0",
              cursor: saving || !isDirty ? "default" : "pointer",
            }}
          >
            {saving ? (
              <>
                <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
                Saving…
              </>
            ) : saved ? (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Saved
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                  <polyline points="17 21 17 13 7 13 7 21" />
                  <polyline points="7 3 7 8 15 8" />
                </svg>
                Save changes
              </>
            )}
          </button>
        </div>

        {/* Tab nav */}
        <div className="flex border-b px-4 md:px-6" style={{ background: "#202c33", borderColor: "#313d45" }}>
          {([
            { id: "prompt", label: "System Prompt", icon: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></> },
            { id: "ai", label: "AI Config", icon: <><circle cx="12" cy="8" r="4" /><path d="M12 2v2M12 14v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" /></> },
            { id: "behavior", label: "Behavior", icon: <><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" /><path d="M12 8v4l3 3" /></> },
          ] as { id: Tab; label: string; icon: React.ReactNode }[]).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="flex items-center gap-2 px-4 py-3.5 text-[13px] font-medium border-b-2 transition-all mr-1"
              style={{
                borderColor: tab === t.id ? "#00a884" : "transparent",
                color: tab === t.id ? "#00a884" : "#8696a0",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{t.icon}</svg>
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          ))}
              <button
                onClick={() => setTab('calling')}
                className="px-4 py-3 text-[13px] font-medium transition-colors whitespace-nowrap"
                style={{
                  color: tab === 'calling' ? '#00a884' : '#8696a0',
                  borderBottom: tab === 'calling' ? '2px solid #00a884' : '2px solid transparent',
                  background: 'transparent',
                }}
              >
                AI Calling
              </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8" style={{ background: "#0b141a" }}>
          <div className="max-w-3xl mx-auto space-y-5">

            {/* ── SYSTEM PROMPT TAB ── */}
            {tab === "prompt" && (
              <>
                <Section
                  title="System Prompt"
                  description="This is the core instruction given to the AI before every conversation. It defines the AI's persona, knowledge, and behavior."
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[12px]" style={{ color: "#8696a0" }}>
                        {draft.system_prompt.length} characters
                      </span>
                      <button
                        onClick={() => updateDraft("system_prompt", "")}
                        className="text-[12px] transition-colors"
                        style={{ color: "#8696a0" }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = "#e9edef")}
                        onMouseLeave={(e) => (e.currentTarget.style.color = "#8696a0")}
                      >
                        Clear
                      </button>
                    </div>
                    <textarea
                      value={draft.system_prompt}
                      onChange={(e) => updateDraft("system_prompt", e.target.value)}
                      rows={22}
                      className="w-full rounded-lg px-4 py-3 text-[13px] leading-relaxed focus:outline-none resize-y font-mono"
                      style={{
                        background: "#202c33",
                        color: "#e9edef",
                        border: "1px solid #313d45",
                        minHeight: "280px",
                      }}
                      placeholder="You are a helpful assistant..."
                    />
                    <p className="text-[12px]" style={{ color: "#8696a0" }}>
                      Tip: Be specific about the AI's name, tone, what it should and shouldn't say, and how it should handle unknown questions.
                    </p>
                  </div>
                </Section>

                <Section
                  title="Agent Name"
                  description="The name used to identify the AI agent in the system prompt and UI."
                >
                  <input
                    type="text"
                    value={draft.agent_name}
                    onChange={(e) => updateDraft("agent_name", e.target.value)}
                    placeholder="Pallavi"
                    className="w-full max-w-xs rounded-lg px-4 py-2.5 text-[14px] focus:outline-none"
                    style={{ background: "#202c33", color: "#e9edef", border: "1px solid #313d45" }}
                  />
                </Section>
              </>
            )}

            {/* ── AI CONFIG TAB ── */}
            {tab === "ai" && (
              <>
                <Section
                  title="AI Model"
                  description="The OpenAI model used to generate responses. More capable models cost more per message."
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {MODELS.map((m) => (
                      <button
                        key={m.value}
                        onClick={() => updateDraft("ai_model", m.value)}
                        className="flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-all"
                        style={{
                          background: draft.ai_model === m.value ? "rgba(0,168,132,0.12)" : "#202c33",
                          border: `1.5px solid ${draft.ai_model === m.value ? "#00a884" : "#313d45"}`,
                        }}
                      >
                        <div
                          className="w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center"
                          style={{ borderColor: draft.ai_model === m.value ? "#00a884" : "#8696a0" }}
                        >
                          {draft.ai_model === m.value && (
                            <div className="w-2 h-2 rounded-full" style={{ background: "#00a884" }} />
                          )}
                        </div>
                        <div>
                          <p className="text-[14px] font-medium" style={{ color: "#e9edef" }}>{m.label}</p>
                          <p className="text-[11px]" style={{ color: "#8696a0" }}>{m.note}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                  <div className="mt-3">
                    <label className="block text-[12px] mb-1.5" style={{ color: "#8696a0" }}>Custom model ID</label>
                    <input
                      type="text"
                      value={draft.ai_model}
                      onChange={(e) => updateDraft("ai_model", e.target.value)}
                      placeholder="gpt-4o-mini"
                      className="w-full max-w-xs rounded-lg px-4 py-2.5 text-[13px] font-mono focus:outline-none"
                      style={{ background: "#202c33", color: "#e9edef", border: "1px solid #313d45" }}
                    />
                  </div>
                </Section>

                <Section
                  title="Temperature"
                  description="Controls randomness. Lower = more predictable and factual. Higher = more creative and varied."
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
                        className="flex-1 accent-[#00a884]"
                      />
                      <span
                        className="w-12 text-center rounded px-2 py-1 text-[14px] font-mono font-semibold"
                        style={{ background: "#202c33", color: "#00a884" }}
                      >
                        {draft.temperature.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between text-[11px]" style={{ color: "#8696a0" }}>
                      <span>0.00 — Deterministic</span>
                      <span>0.50 — Balanced</span>
                      <span>1.00 — Creative</span>
                    </div>
                  </div>
                </Section>

                <Section
                  title="Context Window"
                  description="How many previous messages to send with each request. More context = better replies but higher cost."
                >
                  <div className="flex items-center gap-4">
                    <input
                      type="range"
                      min="4"
                      max="50"
                      step="2"
                      value={draft.max_context_messages}
                      onChange={(e) => updateDraft("max_context_messages", parseInt(e.target.value))}
                      className="flex-1 accent-[#00a884]"
                    />
                    <span
                      className="w-16 text-center rounded px-2 py-1 text-[14px] font-mono font-semibold"
                      style={{ background: "#202c33", color: "#00a884" }}
                    >
                      {draft.max_context_messages}
                    </span>
                  </div>
                  <p className="text-[12px] mt-2" style={{ color: "#8696a0" }}>
                    Last {draft.max_context_messages} messages sent per AI request
                  </p>
                </Section>
              </>
            )}

            {/* ── BEHAVIOR TAB ── */}
            {tab === "behavior" && (
              <>
                <Section
                  title="Auto-Reply"
                  description="When enabled, the AI automatically responds to all incoming WhatsApp messages. Disable to pause all AI replies globally."
                >
                  <Toggle
                    enabled={draft.auto_reply_enabled}
                    onChange={(v) => updateDraft("auto_reply_enabled", v)}
                    label={draft.auto_reply_enabled ? "AI auto-reply is ON" : "AI auto-reply is OFF"}
                    sublabel={draft.auto_reply_enabled ? "The AI will respond to new messages automatically." : "No messages will be sent automatically. Human mode only."}
                  />
                </Section>

                <Section
                  title="Default Conversation Mode"
                  description="The mode applied to new conversations when they are first created."
                >
                  <div className="flex gap-3">
                    {(["agent", "human"] as const).map((mode) => (
                      <button
                        key={mode}
                        onClick={() => updateDraft("default_conversation_mode", mode)}
                        className="flex items-center gap-2.5 px-4 py-2.5 rounded-lg text-[14px] font-medium capitalize transition-all"
                        style={{
                          background: draft.default_conversation_mode === mode
                            ? mode === "agent" ? "rgba(0,168,132,0.15)" : "rgba(234,179,8,0.12)"
                            : "#202c33",
                          border: `1.5px solid ${draft.default_conversation_mode === mode
                            ? mode === "agent" ? "#00a884" : "#e9b308"
                            : "#313d45"}`,
                          color: draft.default_conversation_mode === mode
                            ? mode === "agent" ? "#00a884" : "#e9b308"
                            : "#8696a0",
                        }}
                      >
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ background: draft.default_conversation_mode === mode
                            ? mode === "agent" ? "#00a884" : "#e9b308"
                            : "#8696a0" }}
                        />
                        {mode === "agent" ? "AI Agent" : "Human"}
                      </button>
                    ))}
                  </div>
                  <p className="text-[12px] mt-3" style={{ color: "#8696a0" }}>
                    {draft.default_conversation_mode === "agent"
                      ? "New conversations will be handled by the AI automatically."
                      : "New conversations will wait for a human agent to reply."}
                  </p>
                </Section>

                <Section
                  title="SQL to run in Supabase"
                  description="Run this in your Supabase SQL Editor to create the settings table if you haven't already."
                >
                  <pre
                    className="rounded-lg p-4 text-[12px] font-mono overflow-x-auto leading-relaxed"
                    style={{ background: "#202c33", color: "#8696a0", border: "1px solid #313d45" }}
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

            {/* ── AI CALLING TAB ── */}
            {tab === 'calling' && callSettingsDraft && (
              <div className="flex flex-col gap-6 max-w-xl">
                <div>
                  <label className="block text-[13px] font-medium mb-1.5" style={{ color: '#e9edef' }}>
                    VAPI API Key
                  </label>
                  <input
                    type="password"
                    value={callSettingsDraft.vapi_api_key}
                    onChange={(e) => setCallSettingsDraft((p) => p ? { ...p, vapi_api_key: e.target.value } : p)}
                    className="w-full px-3 py-2 rounded text-[14px] outline-none"
                    style={{ background: '#2a3942', color: '#e9edef', border: '1px solid #313d45' }}
                    placeholder="vapi_…"
                  />
                </div>
                <div>
                  <label className="block text-[13px] font-medium mb-1.5" style={{ color: '#e9edef' }}>
                    VAPI Phone Number ID
                  </label>
                  <input
                    type="text"
                    value={callSettingsDraft.vapi_phone_number_id}
                    onChange={(e) => setCallSettingsDraft((p) => p ? { ...p, vapi_phone_number_id: e.target.value } : p)}
                    className="w-full px-3 py-2 rounded text-[14px] outline-none"
                    style={{ background: '#2a3942', color: '#e9edef', border: '1px solid #313d45' }}
                    placeholder="pn_…"
                  />
                </div>
                <div>
                  <label className="block text-[13px] font-medium mb-1.5" style={{ color: '#e9edef' }}>
                    Default Assistant ID
                  </label>
                  <input
                    type="text"
                    value={callSettingsDraft.default_assistant_id}
                    onChange={(e) => setCallSettingsDraft((p) => p ? { ...p, default_assistant_id: e.target.value } : p)}
                    className="w-full px-3 py-2 rounded text-[14px] outline-none"
                    style={{ background: '#2a3942', color: '#e9edef', border: '1px solid #313d45' }}
                    placeholder="asst_…"
                  />
                </div>
                <div>
                  <label className="block text-[13px] font-medium mb-1.5" style={{ color: '#e9edef' }}>
                    Max Concurrent Calls: <span style={{ color: '#00a884' }}>{callSettingsDraft.max_concurrent_calls}</span>
                  </label>
                  <input
                    type="range"
                    min={1}
                    max={10}
                    value={callSettingsDraft.max_concurrent_calls}
                    onChange={(e) => setCallSettingsDraft((p) => p ? { ...p, max_concurrent_calls: Number(e.target.value) } : p)}
                    className="w-full accent-[#00a884]"
                  />
                  <div className="flex justify-between text-[11px] mt-1" style={{ color: '#8696a0' }}>
                    <span>1</span><span>10</span>
                  </div>
                </div>
                <div className="flex items-center gap-3 pt-2">
                  <button
                    onClick={handleCallSettingsSave}
                    disabled={!isCallSettingsDirty || callSettingsSaving}
                    className="px-5 py-2 rounded text-[13px] font-medium transition-colors"
                    style={{
                      background: isCallSettingsDirty ? '#00a884' : '#2a3942',
                      color: isCallSettingsDirty ? 'white' : '#8696a0',
                      cursor: isCallSettingsDirty ? 'pointer' : 'not-allowed',
                    }}
                  >
                    {callSettingsSaving ? 'Saving…' : 'Save'}
                  </button>
                  {callSettingsSaved && (
                    <span className="text-[13px]" style={{ color: '#00a884' }}>Saved</span>
                  )}
                  {isCallSettingsDirty && !callSettingsSaving && (
                    <span className="text-[13px]" style={{ color: '#8696a0' }}>Unsaved changes</span>
                  )}
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Reusable sub-components ── */

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg overflow-hidden" style={{ border: "1px solid #313d45" }}>
      <div className="px-5 py-4" style={{ background: "#202c33", borderBottom: "1px solid #313d45" }}>
        <h3 className="text-[15px] font-medium" style={{ color: "#e9edef" }}>{title}</h3>
        <p className="text-[12px] mt-0.5" style={{ color: "#8696a0" }}>{description}</p>
      </div>
      <div className="px-5 py-5" style={{ background: "#111b21" }}>
        {children}
      </div>
    </div>
  );
}

function Toggle({ enabled, onChange, label, sublabel }: {
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
        style={{ background: enabled ? "#00a884" : "#2a3942" }}
      >
        <span
          className="absolute top-0.5 w-5 h-5 rounded-full transition-transform duration-200"
          style={{
            background: "white",
            transform: enabled ? "translateX(26px)" : "translateX(2px)",
          }}
        />
      </button>
      <div>
        <p className="text-[14px] font-medium" style={{ color: "#e9edef" }}>{label}</p>
        <p className="text-[12px] mt-0.5" style={{ color: "#8696a0" }}>{sublabel}</p>
      </div>
    </div>
  );
}
