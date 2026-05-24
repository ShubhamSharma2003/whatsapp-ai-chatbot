"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import SidebarNav, { MobileNavToggle } from "@/components/ui/SidebarNav";
import { Skeleton } from "@/components/ui/Loaders";
import type { NudgeAnalytics } from "@/lib/nudge-analytics";

export default function NudgeAnalyticsPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [analytics, setAnalytics] = useState<NudgeAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/nudges/analytics");
    const data = await res.json();
    if (data && !data.error) setAnalytics(data as NudgeAnalytics);
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchAnalytics();
  }, [fetchAnalytics]);

  return (
    <div className="flex h-screen bg-paper">
      <SidebarNav
        active="/nudges/analytics"
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="px-5 md:px-10 py-6 border-b border-line bg-surface flex-shrink-0">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <MobileNavToggle onClick={() => setSidebarOpen(true)} />
              <div className="min-w-0">
                <p className="eyebrow">Re-engagement · Reports</p>
                <h1 className="font-display text-[28px] leading-none tracking-tight text-ink mt-2">
                  Nudge Analytics
                </h1>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href="/nudges"
                className="px-4 py-2.5 rounded-md text-[13px] font-medium border border-line text-ink hover:bg-hover"
              >
                ← Back to rules
              </Link>
              <button
                onClick={fetchAnalytics}
                disabled={loading}
                className="px-4 py-2.5 rounded-md text-[13px] font-medium text-white disabled:opacity-40"
                style={{
                  background:
                    "linear-gradient(135deg, #14A871 0%, #0A7350 60%, #064D33 100%)",
                }}
              >
                {loading ? "Refreshing…" : "↻ Refresh"}
              </button>
            </div>
          </div>
          <p className="text-[12.5px] text-muted mt-3 max-w-2xl leading-relaxed">
            Per-rule funnel, failure reasons, skip reasons, daily timeseries, and
            recent activity. Window: last 14 days.
          </p>
        </header>

        <div className="flex-1 overflow-y-auto p-5 md:p-10">
          <AnalyticsView analytics={analytics} loading={loading} />
        </div>
      </div>
    </div>
  );
}

function AnalyticsView({
  analytics,
  loading,
}: {
  analytics: NudgeAnalytics | null;
  loading: boolean;
}) {
  if (loading && !analytics) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} height={100} className="rounded-lg" />
        ))}
      </div>
    );
  }
  if (!analytics) {
    return (
      <div className="bg-surface border border-line rounded-lg py-16 px-8 text-center">
        <p className="text-[14px] text-ink">No analytics data yet.</p>
      </div>
    );
  }

  const { overview, rules, errors, skips, daily, recent_failures, recent_sends } = analytics;
  const maxDaily = Math.max(1, ...daily.map((d) => d.sent + d.failed + d.skipped));

  return (
    <div className="space-y-6 max-w-7xl">
      <p className="text-[11.5px] text-subtle">
        Generated {new Date(analytics.generated_at).toLocaleString()}
      </p>

      <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Stat label="Total attempts" value={overview.total_attempts} />
        <Stat label="Sent" value={overview.sent} tone="var(--accent)" />
        <Stat label="Failed" value={overview.failed} tone="var(--danger-ink)" />
        <Stat label="Skipped" value={overview.skipped} tone="var(--muted)" />
        <Stat label="Unique recipients" value={overview.unique_recipients} />
        <Stat
          label="Reply rate"
          value={`${overview.reply_rate_pct}%`}
          tone="var(--emerald)"
        />
      </section>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Pending" value={overview.pending} tone="var(--info)" />
        <Stat label="In flight" value={overview.in_flight} tone="var(--info)" />
        <Stat
          label="Replied after nudge"
          value={overview.replied_after_nudge}
          tone="var(--emerald)"
        />
        <Stat label="Ignored" value={overview.ignored} tone="var(--warn-ink)" />
      </section>

      <section className="bg-surface border border-line rounded-lg p-5">
        <h3 className="font-display text-[15px] tracking-tight text-ink mb-3">
          Sends per day · last 14d
        </h3>
        <div className="flex items-end gap-1.5 h-32">
          {daily.map((d) => {
            const total = d.sent + d.failed + d.skipped;
            const h = (total / maxDaily) * 100;
            return (
              <div
                key={d.day}
                className="flex-1 flex flex-col items-center justify-end gap-1 group"
                title={`${d.day} · sent ${d.sent} · failed ${d.failed} · skipped ${d.skipped}`}
              >
                <div
                  className="w-full rounded-t flex flex-col-reverse overflow-hidden"
                  style={{ height: `${h}%`, minHeight: total > 0 ? 4 : 0 }}
                >
                  {d.sent > 0 && (
                    <div
                      style={{
                        height: `${(d.sent / total) * 100}%`,
                        background: "var(--accent)",
                      }}
                    />
                  )}
                  {d.failed > 0 && (
                    <div
                      style={{
                        height: `${(d.failed / total) * 100}%`,
                        background: "var(--danger)",
                      }}
                    />
                  )}
                  {d.skipped > 0 && (
                    <div
                      style={{
                        height: `${(d.skipped / total) * 100}%`,
                        background: "var(--muted)",
                      }}
                    />
                  )}
                </div>
                <span className="text-[9px] text-subtle tnum">{d.day.slice(5)}</span>
              </div>
            );
          })}
        </div>
        <div className="flex gap-4 mt-3 text-[11px] text-muted">
          <Legend color="var(--accent)" label="Sent" />
          <Legend color="var(--danger)" label="Failed" />
          <Legend color="var(--muted)" label="Skipped" />
        </div>
      </section>

      <section className="bg-surface border border-line rounded-lg overflow-hidden">
        <header className="px-5 py-3 border-b border-line">
          <h3 className="font-display text-[15px] tracking-tight text-ink">
            Per-rule performance
          </h3>
        </header>
        {rules.length === 0 ? (
          <p className="text-[12.5px] text-muted px-5 py-6">No rules configured.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="text-left text-[10.5px] uppercase tracking-wider text-subtle border-b border-line">
                  <th className="px-5 py-2.5">Rule</th>
                  <th className="px-2 py-2.5">Source</th>
                  <th className="px-2 py-2.5">Template</th>
                  <th className="px-2 py-2.5 text-right">Sent</th>
                  <th className="px-2 py-2.5 text-right">Failed</th>
                  <th className="px-2 py-2.5 text-right">Skipped</th>
                  <th className="px-2 py-2.5 text-right">Pending</th>
                  <th className="px-2 py-2.5 text-right">Replied</th>
                  <th className="px-5 py-2.5 text-right">Reply %</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((r) => (
                  <tr key={r.rule_id} className="border-b border-line/40">
                    <td className="px-5 py-2.5">
                      <div className="text-ink truncate max-w-[200px]">{r.rule_name}</div>
                      <div className="text-[10px] text-subtle">
                        #{r.attempt_number} · {r.delay_hours}h
                        {!r.enabled && " · disabled"}
                      </div>
                    </td>
                    <td className="px-2 py-2.5 text-muted font-mono text-[11px]">
                      {r.source_type ?? "any"}
                      {r.lead_type && <div className="text-subtle">{r.lead_type}</div>}
                    </td>
                    <td className="px-2 py-2.5 text-muted font-mono text-[11px] truncate max-w-[160px]">
                      {r.template_name}
                      <div className="text-subtle">{r.template_category}</div>
                    </td>
                    <td className="px-2 py-2.5 text-right tnum text-ink">{r.sent}</td>
                    <td className="px-2 py-2.5 text-right tnum" style={{ color: "var(--danger-ink)" }}>
                      {r.failed}
                    </td>
                    <td className="px-2 py-2.5 text-right tnum text-muted">{r.skipped}</td>
                    <td className="px-2 py-2.5 text-right tnum" style={{ color: "var(--info)" }}>
                      {r.pending}
                    </td>
                    <td className="px-2 py-2.5 text-right tnum" style={{ color: "var(--emerald-deep)" }}>
                      {r.replied_after_nudge}
                    </td>
                    <td className="px-5 py-2.5 text-right tnum text-ink font-medium">
                      {r.reply_rate_pct}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="bg-surface border border-line rounded-lg overflow-hidden">
        <header className="px-5 py-3 border-b border-line flex items-center justify-between">
          <h3 className="font-display text-[15px] tracking-tight text-ink">
            Failure reasons
          </h3>
          <span className="text-[11px] text-subtle">{errors.length} unique errors</span>
        </header>
        {errors.length === 0 ? (
          <p className="text-[12.5px] text-muted px-5 py-6">No failures.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="text-left text-[10.5px] uppercase tracking-wider text-subtle border-b border-line">
                  <th className="px-5 py-2.5">Error</th>
                  <th className="px-2 py-2.5">Rules</th>
                  <th className="px-2 py-2.5 text-right">Count</th>
                  <th className="px-2 py-2.5 text-right">Unique phones</th>
                  <th className="px-5 py-2.5">Last seen</th>
                </tr>
              </thead>
              <tbody>
                {errors.map((e, i) => (
                  <tr key={i} className="border-b border-line/40">
                    <td className="px-5 py-2.5 text-ink font-mono text-[11.5px]">
                      {e.error}
                    </td>
                    <td className="px-2 py-2.5 text-muted text-[11px]">
                      {e.rule_names.join(", ")}
                    </td>
                    <td className="px-2 py-2.5 text-right tnum" style={{ color: "var(--danger-ink)" }}>
                      {e.count}
                    </td>
                    <td className="px-2 py-2.5 text-right tnum text-muted">
                      {e.unique_phones}
                    </td>
                    <td className="px-5 py-2.5 text-subtle text-[11px]">
                      {e.last_seen ? new Date(e.last_seen).toLocaleString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="bg-surface border border-line rounded-lg overflow-hidden">
        <header className="px-5 py-3 border-b border-line">
          <h3 className="font-display text-[15px] tracking-tight text-ink">
            Skip reasons
          </h3>
        </header>
        {skips.length === 0 ? (
          <p className="text-[12.5px] text-muted px-5 py-6">No skipped jobs.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="text-left text-[10.5px] uppercase tracking-wider text-subtle border-b border-line">
                  <th className="px-5 py-2.5">Reason</th>
                  <th className="px-2 py-2.5">Rules</th>
                  <th className="px-5 py-2.5 text-right">Count</th>
                </tr>
              </thead>
              <tbody>
                {skips.map((s, i) => (
                  <tr key={i} className="border-b border-line/40">
                    <td className="px-5 py-2.5 text-ink font-mono text-[11.5px]">
                      {s.skip_reason}
                    </td>
                    <td className="px-2 py-2.5 text-muted text-[11px]">
                      {s.rule_names.join(", ")}
                    </td>
                    <td className="px-5 py-2.5 text-right tnum text-muted">{s.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="grid lg:grid-cols-2 gap-6">
        <div className="bg-surface border border-line rounded-lg overflow-hidden">
          <header className="px-5 py-3 border-b border-line">
            <h3 className="font-display text-[15px] tracking-tight text-ink">
              Recent failures
            </h3>
          </header>
          {recent_failures.length === 0 ? (
            <p className="text-[12.5px] text-muted px-5 py-6">No failures.</p>
          ) : (
            <div className="divide-y divide-line/40 max-h-96 overflow-y-auto">
              {recent_failures.map((f) => (
                <div key={f.job_id} className="px-5 py-3 text-[12px]">
                  <div className="flex justify-between gap-3">
                    <span className="font-mono text-ink">{f.phone}</span>
                    <span className="text-subtle text-[10.5px]">
                      {f.last_attempt_at
                        ? new Date(f.last_attempt_at).toLocaleString()
                        : "—"}
                    </span>
                  </div>
                  <div className="text-muted text-[11px] mt-0.5 truncate">
                    {f.rule_name} · #{f.attempt_number}
                  </div>
                  <div
                    className="text-[11px] mt-1 font-mono"
                    style={{ color: "var(--danger-ink)" }}
                  >
                    {f.error || "—"}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-surface border border-line rounded-lg overflow-hidden">
          <header className="px-5 py-3 border-b border-line">
            <h3 className="font-display text-[15px] tracking-tight text-ink">
              Recent sends
            </h3>
          </header>
          {recent_sends.length === 0 ? (
            <p className="text-[12.5px] text-muted px-5 py-6">No sends yet.</p>
          ) : (
            <div className="divide-y divide-line/40 max-h-96 overflow-y-auto">
              {recent_sends.map((s) => (
                <div key={s.job_id} className="px-5 py-3 text-[12px]">
                  <div className="flex justify-between gap-3">
                    <span className="font-mono text-ink">{s.phone}</span>
                    <span className="text-subtle text-[10.5px]">
                      {s.sent_at ? new Date(s.sent_at).toLocaleString() : "—"}
                    </span>
                  </div>
                  <div className="text-muted text-[11px] mt-0.5 truncate">
                    {s.rule_name}
                  </div>
                  {s.replied ? (
                    <span
                      className="inline-block text-[10px] mt-1 px-1.5 py-0.5 rounded font-semibold uppercase tracking-wider"
                      style={{
                        background: "var(--emerald-soft)",
                        color: "var(--emerald-deep)",
                      }}
                    >
                      Replied
                    </span>
                  ) : (
                    <span
                      className="inline-block text-[10px] mt-1 px-1.5 py-0.5 rounded font-semibold uppercase tracking-wider"
                      style={{
                        background: "var(--surface-2)",
                        color: "var(--muted)",
                      }}
                    >
                      No reply
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone?: string;
}) {
  return (
    <div className="bg-surface border border-line rounded-lg px-4 py-3">
      <p className="text-[10.5px] uppercase tracking-wider text-subtle font-medium">
        {label}
      </p>
      <p
        className="text-[22px] font-display tracking-tight mt-1 tnum"
        style={{ color: tone ?? "var(--ink)" }}
      >
        {value}
      </p>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="w-2.5 h-2.5 rounded-sm"
        style={{ background: color }}
      />
      {label}
    </span>
  );
}
