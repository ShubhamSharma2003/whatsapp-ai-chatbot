"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import type {
  AiCallRecipient,
  AiCallTranscript,
  AiCallCampaign,
  AiCallRecipientStatus,
} from "@/lib/types";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import SidebarNav, { MobileNavToggle } from "@/components/ui/SidebarNav";
import { Skeleton } from "@/components/ui/Loaders";

type RecipientWithTranscript = AiCallRecipient & {
  ai_call_transcripts?: AiCallTranscript | null;
};

const STATUS_TONE: Record<
  AiCallRecipientStatus,
  { label: string; bg: string; ink: string; border: string }
> = {
  pending: { label: "Pending", bg: "var(--surface-2)", ink: "var(--muted)", border: "var(--line)" },
  calling: { label: "Calling", bg: "var(--warn-soft)", ink: "var(--warn-ink)", border: "var(--warn)" },
  completed: { label: "Completed", bg: "var(--accent-soft)", ink: "var(--accent-ink)", border: "var(--accent)" },
  failed: { label: "Failed", bg: "var(--danger-soft)", ink: "var(--danger-ink)", border: "var(--danger)" },
  scheduled: { label: "Scheduled", bg: "var(--info-soft)", ink: "var(--info)", border: "var(--info)" },
};

function StatusBadge({ status }: { status: AiCallRecipientStatus }) {
  const t = STATUS_TONE[status] ?? STATUS_TONE.pending;
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10.5px] font-semibold uppercase tracking-wider"
      style={{ background: t.bg, color: t.ink, border: `1px solid ${t.border}30` }}
    >
      <span className="w-1 h-1 rounded-full" style={{ background: t.border }} />
      {t.label}
    </span>
  );
}

function formatDuration(seconds: number | null) {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function AiCallingLogsPage() {
  const [rows, setRows] = useState<RecipientWithTranscript[]>([]);
  const [campaigns, setCampaigns] = useState<AiCallCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<RecipientWithTranscript | null>(null);
  const [filterCampaign, setFilterCampaign] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterSearch, setFilterSearch] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const loadData = useCallback(async () => {
    const params = new URLSearchParams();
    if (filterCampaign) params.set("campaign_id", filterCampaign);
    if (filterStatus) params.set("status", filterStatus);
    if (filterSearch) params.set("search", filterSearch);

    const [logsRes, campaignsRes] = await Promise.all([
      fetch(`/api/ai-calling/logs?${params}`),
      fetch("/api/ai-calling/campaigns"),
    ]);
    const logsData = await logsRes.json();
    const campaignsData = await campaignsRes.json();
    setRows(Array.isArray(logsData) ? logsData : []);
    setCampaigns(Array.isArray(campaignsData) ? campaignsData : []);
    setLoading(false);
  }, [filterCampaign, filterStatus, filterSearch]);

  const loadDataRef = useRef(loadData);
  useEffect(() => {
    loadDataRef.current = loadData;
  }, [loadData]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const sb = createSupabaseBrowserClient();
    const channel = sb
      .channel("ai_call_recipients_logs")
      .on("postgres_changes", { event: "*", schema: "public", table: "ai_call_recipients" }, () => {
        loadDataRef.current();
      })
      .subscribe();
    return () => {
      sb.removeChannel(channel);
    };
  }, []);

  function exportCsv() {
    const headers = ["Name", "Phone", "Status", "Duration", "Started At", "Ended Reason", "Cost", "Retries", "Scheduled At"];
    const csvRows = rows.map((r) => [
      r.name,
      r.phone,
      r.status,
      formatDuration(r.duration_seconds),
      r.started_at ? new Date(r.started_at).toLocaleString() : "",
      r.ended_reason ?? "",
      r.ai_call_transcripts?.cost_total?.toFixed(4) ?? "",
      r.retry_count,
      r.scheduled_at ? new Date(r.scheduled_at).toLocaleString() : "",
    ]);
    const csv = [headers, ...csvRows].map((row) => row.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "call-logs.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex h-screen bg-paper">
      <SidebarNav active="/ai-calling" open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex flex-col flex-1 min-w-0">
        {/* Header */}
        <header className="px-5 md:px-10 py-6 border-b border-line bg-surface flex-shrink-0">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <MobileNavToggle onClick={() => setSidebarOpen(true)} />
              <div>
                <p className="eyebrow">AI Calling</p>
                <h1 className="font-display text-[28px] leading-none tracking-tight text-ink mt-2">
                  Call logs
                </h1>
              </div>
            </div>
            <button onClick={exportCsv} className="btn-ghost text-[13px] flex items-center gap-2">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Export CSV
            </button>
          </div>

          <nav className="flex gap-1 mt-7 -mb-px overflow-x-auto" role="tablist">
            <Link
              href="/ai-calling/campaigns"
              className="px-4 py-2.5 text-[13px] font-medium text-muted hover:text-ink transition-colors"
            >
              Campaigns
            </Link>
            <span className="relative px-4 py-2.5 text-[13px] font-medium text-ink">
              Call logs
              <span className="absolute -bottom-px left-0 right-0 h-[2px]" style={{ background: "var(--accent)" }} />
            </span>
          </nav>
        </header>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 px-5 md:px-10 py-4 border-b border-line bg-surface-2 flex-shrink-0">
          <select
            value={filterCampaign}
            onChange={(e) => setFilterCampaign(e.target.value)}
            className="bg-surface border border-line rounded-md px-3 py-2 text-[13px] text-ink focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft transition-all"
          >
            <option value="">All campaigns</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="bg-surface border border-line rounded-md px-3 py-2 text-[13px] text-ink focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft transition-all"
          >
            <option value="">All statuses</option>
            {["pending", "calling", "completed", "failed", "scheduled"].map((s) => (
              <option key={s} value={s}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle"
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              value={filterSearch}
              onChange={(e) => setFilterSearch(e.target.value)}
              placeholder="Search name or phone…"
              className="w-full bg-surface border border-line rounded-md pl-9 pr-3 py-2 text-[13px] text-ink placeholder:text-faint focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft transition-all"
            />
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="px-5 md:px-10 py-6 space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} height={48} className="rounded-md" />
              ))}
            </div>
          ) : (
            <table className="w-full text-[13px]">
              <thead className="sticky top-0 bg-surface-2 z-10">
                <tr className="border-b border-line">
                  {["Name", "Phone", "Status", "Duration", "Started", "Ended reason", "Cost", "Retries", "Scheduled", ""].map((h, i) => (
                    <th key={i} className="text-left px-4 py-3 eyebrow text-[10px] whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    className="cursor-pointer transition-colors border-b border-line/60 hover:bg-hover"
                    onClick={() => setSelected(r)}
                  >
                    <td className="px-4 py-3.5 text-ink font-medium">{r.name || "—"}</td>
                    <td className="px-4 py-3.5 text-muted font-mono tnum">{r.phone}</td>
                    <td className="px-4 py-3.5">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="px-4 py-3.5 text-muted tnum">{formatDuration(r.duration_seconds)}</td>
                    <td className="px-4 py-3.5 text-muted tnum whitespace-nowrap">
                      {r.started_at ? new Date(r.started_at).toLocaleString() : "—"}
                    </td>
                    <td className="px-4 py-3.5 text-muted max-w-[180px] truncate">{r.ended_reason ?? "—"}</td>
                    <td className="px-4 py-3.5 text-muted tnum font-mono">
                      {r.ai_call_transcripts?.cost_total ? `$${Number(r.ai_call_transcripts.cost_total).toFixed(4)}` : "—"}
                    </td>
                    <td className="px-4 py-3.5 text-muted tnum">{r.retry_count}</td>
                    <td className="px-4 py-3.5 text-muted tnum whitespace-nowrap">
                      {r.scheduled_at ? new Date(r.scheduled_at).toLocaleString() : "—"}
                    </td>
                    <td className="px-4 py-3.5">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--subtle)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={10} className="py-20 text-center text-[13px] text-muted">
                      No calls found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Detail panel */}
      {selected && (
        <aside
          className="w-full lg:w-[400px] flex-shrink-0 flex flex-col border-l border-line overflow-auto bg-surface fixed lg:static inset-y-0 right-0 z-50 animate-fade-in-up"
          style={{ boxShadow: "var(--shadow-lg)" }}
        >
          <header className="flex items-start justify-between px-6 py-5 border-b border-line">
            <div className="min-w-0">
              <p className="eyebrow text-[10px]">Call detail</p>
              <h2 className="font-display text-[20px] tracking-tight text-ink mt-1.5 leading-none truncate">
                {selected.name || "Unknown contact"}
              </h2>
              <p className="text-[12px] text-muted mt-1 font-mono tnum">{selected.phone}</p>
            </div>
            <button
              onClick={() => setSelected(null)}
              className="w-8 h-8 rounded-md hover:bg-hover flex items-center justify-center text-muted hover:text-ink transition-colors flex-shrink-0"
              aria-label="Close"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </header>

          <div className="flex flex-col gap-6 p-6">
            <div className="flex flex-col gap-2">
              <StatusBadge status={selected.status} />
              {selected.ended_reason && (
                <p className="text-[12.5px] text-muted mt-1 leading-relaxed">{selected.ended_reason}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Stat label="Duration" value={formatDuration(selected.duration_seconds)} />
              <Stat label="Retries" value={selected.retry_count.toString()} />
              <Stat
                label="Started"
                value={selected.started_at ? new Date(selected.started_at).toLocaleString() : "—"}
              />
              <Stat
                label="Ended"
                value={selected.ended_at ? new Date(selected.ended_at).toLocaleString() : "—"}
              />
            </div>

            {selected.ai_call_transcripts?.recording_url && (
              <div>
                <p className="eyebrow text-[10px] mb-2">Recording</p>
                <audio
                  controls
                  src={selected.ai_call_transcripts.recording_url}
                  className="w-full"
                />
                <a
                  href={selected.ai_call_transcripts.recording_url}
                  download
                  className="inline-flex items-center gap-1.5 mt-2 text-[12px] font-medium hover:underline"
                  style={{ color: "var(--accent-ink)" }}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  Download
                </a>
              </div>
            )}

            {selected.ai_call_transcripts?.messages && selected.ai_call_transcripts.messages.length > 0 && (
              <div>
                <p className="eyebrow text-[10px] mb-3">Transcript</p>
                <div className="flex flex-col gap-2 max-h-[280px] overflow-auto pr-1">
                  {selected.ai_call_transcripts.messages.map((m, i) => (
                    <div
                      key={i}
                      className={`px-3 py-2 rounded-lg text-[12.5px] max-w-[90%] leading-relaxed ${m.role === "assistant" ? "self-start" : "self-end"}`}
                      style={{
                        background: m.role === "assistant" ? "var(--surface-2)" : "var(--ink)",
                        color: m.role === "assistant" ? "var(--ink)" : "var(--paper)",
                        border: m.role === "assistant" ? "1px solid var(--line)" : "none",
                      }}
                    >
                      <p>{m.content}</p>
                      {m.timestamp && (
                        <p className="mt-1.5 text-[10px] tnum opacity-60">
                          {new Date(m.timestamp).toLocaleTimeString()}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {selected.ai_call_transcripts?.summary && (
              <div className="bg-accent-tint border border-accent/20 rounded-md p-4" style={{ borderColor: "var(--accent)25" }}>
                <p className="eyebrow text-[10px] mb-2" style={{ color: "var(--accent-ink)" }}>
                  AI Summary
                </p>
                <p className="text-[13px] leading-relaxed text-ink">{selected.ai_call_transcripts.summary}</p>
                {selected.ai_call_transcripts.success_evaluation && (
                  <p className="mt-3 pt-3 border-t border-accent/20 text-[12px] text-muted" style={{ borderColor: "var(--accent)25" }}>
                    Evaluation: <span className="text-ink">{selected.ai_call_transcripts.success_evaluation}</span>
                  </p>
                )}
              </div>
            )}

            {selected.ai_call_transcripts && selected.ai_call_transcripts.cost_total > 0 && (
              <div>
                <p className="eyebrow text-[10px] mb-3">Cost breakdown</p>
                <table className="w-full text-[12.5px]">
                  <tbody>
                    {Object.entries(selected.ai_call_transcripts.cost_breakdown).map(([k, v]) => (
                      <tr key={k}>
                        <td className="py-1 capitalize text-muted">{k}</td>
                        <td className="py-1 text-right text-ink font-mono tnum">${(v as number).toFixed(4)}</td>
                      </tr>
                    ))}
                    <tr className="border-t border-line">
                      <td className="pt-2 font-semibold text-ink">Total</td>
                      <td
                        className="pt-2 text-right font-display text-[16px] tnum"
                        style={{ color: "var(--accent-ink)" }}
                      >
                        ${Number(selected.ai_call_transcripts.cost_total).toFixed(4)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </aside>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface-2 border border-line rounded-md px-3 py-2.5">
      <p className="text-[10px] text-subtle uppercase tracking-wider">{label}</p>
      <p className="text-[13px] text-ink mt-1 truncate">{value}</p>
    </div>
  );
}
