"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import type { AiCallCampaign, AiCallCampaignStatus } from "@/lib/types";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import SidebarNav, { MobileNavToggle } from "@/components/ui/SidebarNav";
import { Skeleton } from "@/components/ui/Loaders";

const STATUS_TONE: Record<
  AiCallCampaignStatus,
  { label: string; bg: string; ink: string; border: string; pulse?: boolean }
> = {
  draft: { label: "Draft", bg: "var(--surface-2)", ink: "var(--muted)", border: "var(--line)" },
  running: { label: "Running", bg: "var(--accent-soft)", ink: "var(--accent-ink)", border: "var(--accent)", pulse: true },
  paused: { label: "Paused", bg: "var(--warn-soft)", ink: "var(--warn-ink)", border: "var(--warn)" },
  done: { label: "Done", bg: "var(--accent-soft)", ink: "var(--accent-ink)", border: "var(--accent)" },
  failed: { label: "Failed", bg: "var(--danger-soft)", ink: "var(--danger-ink)", border: "var(--danger)" },
};

function StatusBadge({ status }: { status: AiCallCampaignStatus }) {
  const t = STATUS_TONE[status] ?? STATUS_TONE.draft;
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10.5px] font-semibold uppercase tracking-wider"
      style={{ background: t.bg, color: t.ink, border: `1px solid ${t.border}30` }}
    >
      <span
        className={`w-1 h-1 rounded-full ${t.pulse ? "animate-pulse-soft" : ""}`}
        style={{ background: t.border }}
      />
      {t.label}
    </span>
  );
}

function parseCsv(text: string): Array<{ phone: string; name: string }> {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const phoneIdx = headers.indexOf("phone") !== -1 ? headers.indexOf("phone") : headers.indexOf("number");
  const nameIdx = headers.indexOf("name");
  if (phoneIdx === -1) return [];
  return lines
    .slice(1)
    .map((line) => {
      const cols = line.split(",");
      return {
        phone: (cols[phoneIdx] ?? "").trim(),
        name: nameIdx !== -1 ? (cols[nameIdx] ?? "").trim() : "",
      };
    })
    .filter((r) => r.phone);
}

export default function AiCallingCampaignsPage() {
  const [campaigns, setCampaigns] = useState<AiCallCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [step, setStep] = useState(1);
  const [campaignName, setCampaignName] = useState("");
  const [recipients, setRecipients] = useState<Array<{ phone: string; name: string }>>([]);
  const [csvError, setCsvError] = useState("");
  const [scheduleMode, setScheduleMode] = useState<"now" | "later">("now");
  const [scheduledAt, setScheduledAt] = useState("");
  const [creating, setCreating] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function loadCampaigns() {
    const res = await fetch("/api/ai-calling/campaigns");
    const data = await res.json();
    setCampaigns(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  useEffect(() => {
    loadCampaigns();
    const sb = createSupabaseBrowserClient();
    const channel = sb
      .channel("ai_call_campaigns")
      .on("postgres_changes", { event: "*", schema: "public", table: "ai_call_campaigns" }, () => {
        loadCampaigns();
      })
      .subscribe();
    return () => {
      sb.removeChannel(channel);
    };
  }, []);

  async function handleAction(id: string, action: "start" | "pause" | "resume" | "stop") {
    await fetch(`/api/ai-calling/campaigns/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    await loadCampaigns();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const parsed = parseCsv(text);
      if (parsed.length === 0) {
        setCsvError('CSV must have a "phone" or "number" column and at least one row');
        setRecipients([]);
      } else {
        setCsvError("");
        setRecipients(parsed);
      }
    };
    reader.readAsText(file);
  }

  async function handleCreate() {
    setCreating(true);
    await fetch("/api/ai-calling/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: campaignName,
        recipients,
        scheduled_at:
          scheduleMode === "later" && scheduledAt ? new Date(scheduledAt).toISOString() : null,
      }),
    });
    setCreating(false);
    setShowModal(false);
    setStep(1);
    setCampaignName("");
    setRecipients([]);
    setScheduleMode("now");
    setScheduledAt("");
  }

  return (
    <div className="flex h-screen bg-paper">
      <SidebarNav active="/ai-calling" open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="px-5 md:px-10 py-6 border-b border-line bg-surface flex-shrink-0">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <MobileNavToggle onClick={() => setSidebarOpen(true)} />
              <div>
                <p className="eyebrow">AI Calling</p>
                <h1 className="font-display text-[28px] leading-none tracking-tight text-ink mt-2">
                  Voice campaigns
                </h1>
              </div>
            </div>
            <button
              onClick={() => setShowModal(true)}
              className="btn-accent flex items-center gap-2"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              New campaign
            </button>
          </div>

          <nav className="flex gap-1 mt-7 -mb-px overflow-x-auto" role="tablist">
            <span
              className="relative px-4 py-2.5 text-[13px] font-medium text-ink"
            >
              Campaigns
              <span className="absolute -bottom-px left-0 right-0 h-[2px]" style={{ background: "var(--accent)" }} />
            </span>
            <Link
              href="/ai-calling/logs"
              className="px-4 py-2.5 text-[13px] font-medium text-muted hover:text-ink transition-colors"
            >
              Call logs
            </Link>
          </nav>
        </header>

        <div className="flex-1 overflow-auto p-5 md:p-10">
          {loading ? (
            <div className="space-y-3 max-w-5xl">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} height={56} className="rounded-lg" />
              ))}
            </div>
          ) : campaigns.length === 0 ? (
            <div className="bg-surface border border-line rounded-lg py-20 px-8 text-center max-w-xl mx-auto">
              <div className="w-14 h-14 mx-auto rounded-full flex items-center justify-center mb-4" style={{ background: "var(--accent-soft)", border: "1px solid var(--accent)40" }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.63 3.18 2 2 0 0 1 3.6 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.56a16 16 0 0 0 6.29 6.29l.97-.97a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
                </svg>
              </div>
              <h3 className="font-display text-[20px] tracking-tight text-ink">No campaigns yet</h3>
              <p className="text-[13px] text-muted mt-2 mb-5 leading-relaxed">
                Upload a recipient list, schedule the dial, and let the AI agent run the calls.
              </p>
              <button
                onClick={() => setShowModal(true)}
                className="btn-accent text-[13px]"
              >
                Create your first campaign
              </button>
            </div>
          ) : (
            <div className="bg-surface border border-line rounded-lg overflow-hidden">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="bg-surface-2 border-b border-line">
                    <Th>Name</Th>
                    <Th>Status</Th>
                    <Th>Progress</Th>
                    <Th>Scheduled</Th>
                    <Th>Created</Th>
                    <Th>Actions</Th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map((c) => {
                    const pct =
                      c.total_recipients > 0
                        ? Math.round((c.called_count / c.total_recipients) * 100)
                        : 0;
                    return (
                      <tr key={c.id} className="border-b border-line/60 hover:bg-hover transition-colors">
                        <td className="px-4 py-3.5 text-ink font-medium">{c.name}</td>
                        <td className="px-4 py-3.5">
                          <StatusBadge status={c.status} />
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-3">
                            <div className="w-28 h-1.5 rounded-full overflow-hidden bg-paper-2">
                              <div
                                className="h-full rounded-full transition-all duration-500"
                                style={{ background: "var(--accent)", width: `${pct}%` }}
                              />
                            </div>
                            <span className="text-muted text-[12px] tnum">
                              {c.called_count}/{c.total_recipients}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-muted tnum">
                          {c.scheduled_at ? new Date(c.scheduled_at).toLocaleString() : "—"}
                        </td>
                        <td className="px-4 py-3.5 text-muted tnum">
                          {new Date(c.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex gap-2">
                            {c.status === "draft" && (
                              <ActionBtn onClick={() => handleAction(c.id, "start")} variant="primary">
                                Start
                              </ActionBtn>
                            )}
                            {c.status === "running" && (
                              <>
                                <ActionBtn onClick={() => handleAction(c.id, "pause")} variant="warn">
                                  Pause
                                </ActionBtn>
                                <ActionBtn onClick={() => handleAction(c.id, "stop")} variant="danger">
                                  Stop
                                </ActionBtn>
                              </>
                            )}
                            {c.status === "paused" && (
                              <>
                                <ActionBtn onClick={() => handleAction(c.id, "resume")} variant="primary">
                                  Resume
                                </ActionBtn>
                                <ActionBtn onClick={() => handleAction(c.id, "stop")} variant="danger">
                                  Stop
                                </ActionBtn>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(14, 20, 16, 0.45)" }}>
          <div
            className="w-full max-w-md rounded-lg flex flex-col gap-5 bg-surface border border-line p-6 animate-fade-in-up"
            style={{ boxShadow: "var(--shadow-lg)" }}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="eyebrow text-[10px]">Step {step} of 3</p>
                <h2 className="font-display text-[20px] tracking-tight text-ink mt-1.5 leading-none">
                  {step === 1 ? "Name your campaign" : step === 2 ? "Upload recipients" : "Schedule dial"}
                </h2>
              </div>
              <button
                onClick={() => {
                  setShowModal(false);
                  setStep(1);
                }}
                className="w-8 h-8 rounded-md hover:bg-hover flex items-center justify-center text-muted hover:text-ink transition-colors"
                aria-label="Close"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Progress dots */}
            <div className="flex gap-1.5">
              {[1, 2, 3].map((i) => (
                <span
                  key={i}
                  className="flex-1 h-1 rounded-full transition-all"
                  style={{
                    background: i <= step ? "var(--accent)" : "var(--line)",
                  }}
                />
              ))}
            </div>

            {step === 1 && (
              <>
                <div>
                  <label className="eyebrow text-[10px] block mb-2">Campaign name</label>
                  <input
                    type="text"
                    value={campaignName}
                    onChange={(e) => setCampaignName(e.target.value)}
                    className="w-full bg-surface-2 border border-line rounded-md px-4 py-3 text-[14px] text-ink placeholder:text-faint focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft transition-all"
                    placeholder="e.g. April Follow-up"
                    autoFocus
                  />
                </div>
                <button
                  disabled={!campaignName.trim()}
                  onClick={() => setStep(2)}
                  className="btn-accent self-end text-[13px] disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
                >
                  Next →
                </button>
              </>
            )}

            {step === 2 && (
              <>
                <div>
                  <label className="eyebrow text-[10px] block mb-2">CSV — columns: name, phone</label>
                  <div
                    className="flex flex-col items-center justify-center gap-2 rounded-md py-10 cursor-pointer border-2 border-dashed border-line-2 hover:border-accent hover:bg-accent-tint transition-all"
                    onClick={() => fileRef.current?.click()}
                  >
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                    <span className="text-[13px] text-muted">Click to upload CSV</span>
                    <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFileChange} />
                  </div>
                  {csvError && (
                    <p className="mt-2 text-[12px]" style={{ color: "var(--danger-ink)" }}>
                      {csvError}
                    </p>
                  )}
                  {recipients.length > 0 && (
                    <div className="mt-4 bg-accent-soft border border-accent/30 rounded-md p-3" style={{ borderColor: "var(--accent)40" }}>
                      <p className="text-[12.5px] mb-2 font-medium tnum" style={{ color: "var(--accent-ink)" }}>
                        ✓ {recipients.length} contacts loaded
                      </p>
                      <table className="w-full text-[12px]">
                        <thead>
                          <tr className="text-subtle">
                            <th className="text-left pb-1.5 font-medium">Phone</th>
                            <th className="text-left pb-1.5 font-medium">Name</th>
                          </tr>
                        </thead>
                        <tbody>
                          {recipients.slice(0, 5).map((r, i) => (
                            <tr key={i} className="text-ink">
                              <td className="py-0.5 font-mono tnum">{r.phone}</td>
                              <td className="py-0.5">{r.name || "—"}</td>
                            </tr>
                          ))}
                          {recipients.length > 5 && (
                            <tr>
                              <td colSpan={2} className="text-subtle pt-1">
                                …and {recipients.length - 5} more
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
                <div className="flex gap-3 self-end">
                  <button onClick={() => setStep(1)} className="btn-ghost text-[13px]">
                    ← Back
                  </button>
                  <button
                    disabled={recipients.length === 0}
                    onClick={() => setStep(3)}
                    className="btn-accent text-[13px] disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
                  >
                    Next →
                  </button>
                </div>
              </>
            )}

            {step === 3 && (
              <>
                <div className="flex flex-col gap-3">
                  <p className="eyebrow text-[10px]">Schedule</p>
                  {(["now", "later"] as const).map((m) => (
                    <label
                      key={m}
                      className="flex items-center gap-3 cursor-pointer rounded-md px-3 py-2.5 transition-colors"
                      style={{
                        background: scheduleMode === m ? "var(--accent-tint)" : "var(--surface-2)",
                        border: `1px solid ${scheduleMode === m ? "var(--accent)" : "var(--line)"}`,
                      }}
                    >
                      <input
                        type="radio"
                        value={m}
                        checked={scheduleMode === m}
                        onChange={() => setScheduleMode(m)}
                      />
                      <div>
                        <p className="text-[13.5px] text-ink font-medium">
                          {m === "now" ? "Start immediately" : "Schedule for later"}
                        </p>
                        <p className="text-[11px] text-muted mt-0.5">
                          {m === "now"
                            ? "Begin dialing as soon as the campaign is created."
                            : "Pick a date and time below."}
                        </p>
                      </div>
                    </label>
                  ))}
                  {scheduleMode === "later" && (
                    <input
                      type="datetime-local"
                      value={scheduledAt}
                      onChange={(e) => setScheduledAt(e.target.value)}
                      className="bg-surface-2 border border-line rounded-md px-3 py-2.5 text-[13.5px] text-ink focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft transition-all"
                    />
                  )}
                </div>
                <div className="flex gap-3 self-end">
                  <button onClick={() => setStep(2)} className="btn-ghost text-[13px]">
                    ← Back
                  </button>
                  <button
                    disabled={creating || (scheduleMode === "later" && !scheduledAt)}
                    onClick={handleCreate}
                    className="btn-accent text-[13px] flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
                  >
                    {creating ? (
                      <>
                        <Skeleton width={12} height={12} className="rounded-full bg-white/30" />
                        Creating…
                      </>
                    ) : (
                      "Create campaign"
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="text-left px-4 py-3 eyebrow text-[10px]">
      {children}
    </th>
  );
}

function ActionBtn({
  children,
  onClick,
  variant,
}: {
  children: React.ReactNode;
  onClick: () => void;
  variant: "primary" | "warn" | "danger";
}) {
  const styles = {
    primary: { bg: "var(--accent)", color: "white" },
    warn: { bg: "var(--warn)", color: "white" },
    danger: { bg: "var(--danger)", color: "white" },
  }[variant];
  return (
    <button
      onClick={onClick}
      className="px-3 py-1 rounded-md text-[11.5px] font-medium transition-opacity hover:opacity-85"
      style={{ background: styles.bg, color: styles.color }}
    >
      {children}
    </button>
  );
}
