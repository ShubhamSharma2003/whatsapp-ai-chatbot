"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import SidebarNav, { MobileNavToggle } from "@/components/ui/SidebarNav";
import { Orbit, Skeleton, Dots } from "@/components/ui/Loaders";

type Tab = "broadcast" | "templates" | "history" | "report";

type TemplateButton = {
  type: string;
  text: string;
  url?: string;
  phone_number?: string;
};

type TemplateComponent = {
  type: string;
  format?: string;
  text?: string;
  buttons?: TemplateButton[];
  example?: { header_handle?: string[]; body_text?: string[][] };
};

type Template = {
  id: string;
  name: string;
  status: string;
  language: string;
  category: string;
  components: TemplateComponent[];
};

type Campaign = {
  id: string;
  name: string;
  template_name: string;
  template_language: string;
  status: string;
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  delivered_count: number;
  read_count: number;
  replied_count: number;
  has_buttons: boolean;
  template_buttons: TemplateButton[] | null;
  created_at: string;
};

type CampaignRecipient = {
  phone: string;
  status: string;
  error: string | null;
  whatsapp_msg_id: string | null;
  delivered_at: string | null;
  read_at: string | null;
  replied_at: string | null;
  created_at: string;
};

type CampaignReport = {
  campaign: Campaign;
  recipients: CampaignRecipient[];
  summary: {
    total: number;
    sent: number;
    delivered: number;
    read: number;
    replied: number;
    failed: number;
    delivery_rate: number;
    read_rate: number;
    reply_rate: number;
  };
};

const STATUS_TONE: Record<string, { bg: string; ink: string; border: string; label: string }> = {
  done: { bg: "var(--accent-soft)", ink: "var(--accent-ink)", border: "var(--accent)", label: "Done" },
  sending: { bg: "var(--info-soft)", ink: "var(--info)", border: "var(--info)", label: "Sending" },
  failed: { bg: "var(--danger-soft)", ink: "var(--danger-ink)", border: "var(--danger)", label: "Failed" },
  sent: { bg: "var(--info-soft)", ink: "var(--info)", border: "var(--info)", label: "Sent" },
  delivered: { bg: "var(--accent-soft)", ink: "var(--accent-ink)", border: "var(--accent)", label: "Delivered" },
  read: { bg: "var(--purple-soft)", ink: "var(--purple)", border: "var(--purple)", label: "Read" },
  replied: { bg: "var(--warn-soft)", ink: "var(--warn-ink)", border: "var(--warn)", label: "Replied" },
};

function StatusChip({ status }: { status: string }) {
  const t = STATUS_TONE[status] ?? {
    bg: "var(--surface-2)",
    ink: "var(--muted)",
    border: "var(--line)",
    label: status,
  };
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider"
      style={{
        background: t.bg,
        color: t.ink,
        border: `1px solid ${t.border}30`,
      }}
    >
      <span className="w-1 h-1 rounded-full" style={{ background: t.border }} />
      {t.label || status}
    </span>
  );
}

export default function CampaignsPage() {
  const [tab, setTab] = useState<Tab>("broadcast");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [history, setHistory] = useState<Campaign[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [report, setReport] = useState<CampaignReport | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);

  const filteredRecipients =
    report?.recipients.filter((r) => {
      if (statusFilter.length === 0) return true;
      return statusFilter.includes(r.status);
    }) ?? [];

  // Broadcast form state
  const [campaignName, setCampaignName] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [templateParams, setTemplateParams] = useState<Record<string, string>>({});
  const [headerImageUrl, setHeaderImageUrl] = useState("");
  const [headerImagePreview, setHeaderImagePreview] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);
  const headerImageRef = useRef<HTMLInputElement>(null);
  const [campaignSystemPrompt, setCampaignSystemPrompt] = useState("");
  const [manualNumbers, setManualNumbers] = useState("");
  const [csvPhones, setCsvPhones] = useState<string[]>([]);
  const [csvFileName, setCsvFileName] = useState("");
  const [launching, setLaunching] = useState(false);
  const [result, setResult] = useState<{ sentCount: number; failedCount: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleHeaderImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setHeaderImagePreview(URL.createObjectURL(file));
    setUploadingImage(true);
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/campaigns/upload-image", { method: "POST", body: form });
    const data = await res.json();
    setUploadingImage(false);
    if (data.url) setHeaderImageUrl(data.url);
  }

  function hasImageHeader(template: Template | null): boolean {
    if (!template) return false;
    const header = template.components?.find((c) => c.type === "HEADER");
    return header?.format === "IMAGE";
  }

  function getFooterText(template: Template | null): string | null {
    if (!template) return null;
    return template.components?.find((c) => c.type === "FOOTER")?.text || null;
  }

  function getButtons(template: Template | null): TemplateButton[] {
    if (!template) return [];
    const buttonsComp = template.components?.find((c) => c.type === "BUTTONS");
    return buttonsComp?.buttons || [];
  }

  function getPlaceholders(template: Template | null): string[] {
    if (!template) return [];
    const body = template.components?.find((c) => c.type === "BODY")?.text || "";
    const matches = body.match(/\{\{(\d+)\}\}/g) || [];
    const nums = [...new Set(matches.map((m) => m.replace(/\{\{|\}\}/g, "")))];
    return nums.sort((a, b) => Number(a) - Number(b));
  }

  const fetchTemplates = useCallback(async () => {
    setLoadingTemplates(true);
    const res = await fetch("/api/campaigns/templates");
    const data = await res.json();
    setTemplates(Array.isArray(data) ? data : []);
    setLoadingTemplates(false);
  }, []);

  const fetchHistory = useCallback(async () => {
    setLoadingHistory(true);
    const res = await fetch("/api/campaigns/history");
    const data = await res.json();
    setHistory(Array.isArray(data) ? data : []);
    setLoadingHistory(false);
  }, []);

  const fetchReport = useCallback(async (campaignId: string) => {
    setLoadingReport(true);
    setReport(null);
    setStatusFilter([]);
    const res = await fetch(`/api/campaigns/${campaignId}/report`);
    const data = await res.json();
    if (data.campaign) setReport(data);
    setLoadingReport(false);
  }, []);

  const exportReportCSV = useCallback(() => {
    if (!report) return;
    const { campaign, recipients, summary } = report;
    const esc = (v: string) =>
      v.includes(",") || v.includes('"') || v.includes("\n")
        ? `"${v.replace(/"/g, '""')}"`
        : v;

    const lines: string[] = [];
    lines.push("Campaign Report");
    lines.push(`Campaign Name,${esc(campaign.name)}`);
    lines.push(`Template,${esc(campaign.template_name)}`);
    lines.push(`Language,${esc(campaign.template_language)}`);
    lines.push(`Status,${esc(campaign.status)}`);
    lines.push(`Created,${esc(campaign.created_at)}`);
    lines.push("");
    lines.push("Summary");
    lines.push(`Total Recipients,${summary.total}`);
    lines.push(`Sent,${summary.sent}`);
    lines.push(`Delivered,${summary.delivered}`);
    lines.push(`Read,${summary.read}`);
    lines.push(`Replied,${summary.replied}`);
    lines.push(`Failed,${summary.failed}`);
    lines.push(`Delivery Rate,${summary.delivery_rate}%`);
    lines.push(`Read Rate,${summary.read_rate}%`);
    lines.push(`Reply Rate,${summary.reply_rate}%`);
    lines.push("");
    lines.push("Phone,Status,Delivered At,Read At,Replied At,Error");
    for (const r of recipients) {
      lines.push(
        [
          esc(r.phone),
          esc(r.status),
          r.delivered_at ? esc(r.delivered_at) : "",
          r.read_at ? esc(r.read_at) : "",
          r.replied_at ? esc(r.replied_at) : "",
          r.error ? esc(r.error) : "",
        ].join(",")
      );
    }

    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${campaign.name.replace(/[^a-zA-Z0-9_-]/g, "_")}_report.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [report]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  useEffect(() => {
    if (tab === "history") fetchHistory();
  }, [tab, fetchHistory]);

  function handleCsvUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
      const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
      const phoneCol = headers.indexOf("phonenumber");
      const phones: string[] = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(",");
        const phone = phoneCol >= 0 ? cols[phoneCol]?.trim() : cols[0]?.trim();
        if (phone) phones.push(phone);
      }
      setCsvPhones(phones);
    };
    reader.readAsText(file);
  }

  function getAllPhones(): string[] {
    const manual = manualNumbers
      .split(/[\n,]+/)
      .map((p) => p.trim())
      .filter(Boolean);
    return [...new Set([...manual, ...csvPhones])];
  }

  async function handleLaunch() {
    if (!campaignName || !selectedTemplate) return;
    const phones = getAllPhones();
    if (!phones.length) return;
    setLaunching(true);
    setResult(null);
    const res = await fetch("/api/campaigns/broadcast", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: campaignName,
        templateName: selectedTemplate.name,
        templateLanguage: selectedTemplate.language,
        phones,
        templateParams,
        headerImageUrl: headerImageUrl || undefined,
        templateBody:
          selectedTemplate.components?.find((c) => c.type === "BODY")?.text || "",
        templateButtons: getButtons(selectedTemplate),
        systemPrompt: campaignSystemPrompt || undefined,
      }),
    });
    const data = await res.json();
    setLaunching(false);
    if (data.success) {
      setResult({ sentCount: data.sentCount, failedCount: data.failedCount });
      setCampaignName("");
      setSelectedTemplate(null);
      setTemplateParams({});
      setHeaderImageUrl("");
      setHeaderImagePreview("");
      setManualNumbers("");
      setCsvPhones([]);
      setCsvFileName("");
      setCampaignSystemPrompt("");
    }
  }

  const rawPreviewText = selectedTemplate?.components?.find((c) => c.type === "BODY")?.text || null;
  const previewText = rawPreviewText
    ? rawPreviewText.replace(/\{\{(\d+)\}\}/g, (_, num) => templateParams[num] || `{{${num}}}`)
    : null;
  const allPhones = getAllPhones();

  function formatDate(str: string) {
    return new Date(str).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
  }

  const TAB_LIST: { id: Tab; label: string }[] = [
    { id: "broadcast", label: "Compose" },
    { id: "templates", label: "Templates" },
    { id: "history", label: "History" },
    ...(tab === "report" ? [{ id: "report" as Tab, label: "Report" }] : []),
  ];

  return (
    <div className="flex h-screen bg-paper">
      <SidebarNav active="/campaigns" open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="px-5 md:px-10 py-6 border-b border-line bg-surface flex-shrink-0">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <MobileNavToggle onClick={() => setSidebarOpen(true)} />
              <div className="min-w-0">
                <p className="eyebrow">Outbound</p>
                <h1 className="font-display text-[28px] leading-none tracking-tight text-ink mt-2">
                  Broadcasts
                </h1>
              </div>
            </div>

            <div className="hidden sm:flex items-center gap-2 text-[11.5px] text-muted">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              Meta-approved templates only
            </div>
          </div>

          {/* Tabs */}
          <nav className="flex gap-1 mt-7 -mb-px overflow-x-auto" role="tablist">
            {TAB_LIST.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                role="tab"
                aria-selected={tab === t.id}
                className="relative px-4 py-2.5 text-[13px] font-medium transition-colors min-w-fit"
                style={{ color: tab === t.id ? "var(--ink)" : "var(--muted)" }}
              >
                {t.label}
                <span
                  className="absolute -bottom-px left-0 right-0 h-[2px] transition-all"
                  style={{ background: tab === t.id ? "var(--accent)" : "transparent" }}
                />
              </button>
            ))}
          </nav>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {/* COMPOSE */}
          {tab === "broadcast" && (
            <div className="grid lg:grid-cols-[1fr_auto] gap-8 p-5 md:p-10 max-w-7xl">
              <div className="space-y-6 min-w-0">
                {/* Step 1 — Identity */}
                <FormStep step={1} title="Campaign identity" desc="Give this broadcast a memorable name.">
                  <input
                    type="text"
                    value={campaignName}
                    onChange={(e) => setCampaignName(e.target.value)}
                    placeholder="e.g. Summer Launch · DLF Central 67"
                    className="w-full bg-surface-2 border border-line rounded-md px-4 py-3 text-[14px] text-ink placeholder:text-faint focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft transition-all"
                  />
                </FormStep>

                {/* Step 2 — Template */}
                <FormStep step={2} title="Choose template" desc="Pick from your Meta-approved library.">
                  {loadingTemplates ? (
                    <p className="text-[13px] text-muted py-2">Loading templates…</p>
                  ) : (
                    <select
                      value={selectedTemplate?.name || ""}
                      onChange={(e) => {
                        const t = templates.find((t) => t.name === e.target.value) || null;
                        setSelectedTemplate(t);
                        setTemplateParams({});
                        setHeaderImageUrl("");
                        setHeaderImagePreview("");
                      }}
                      className="w-full bg-surface-2 border border-line rounded-md px-4 py-3 text-[14px] text-ink focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft transition-all appearance-none cursor-pointer"
                    >
                      <option value="">— Select template —</option>
                      {templates.map((t) => (
                        <option key={t.id} value={t.name}>
                          {t.name} ({t.language})
                        </option>
                      ))}
                    </select>
                  )}
                  {templates.length === 0 && !loadingTemplates && (
                    <p className="text-[12px] text-muted mt-2">No approved templates found in your Meta account.</p>
                  )}

                  {selectedTemplate &&
                    (hasImageHeader(selectedTemplate) || getPlaceholders(selectedTemplate).length > 0) && (
                      <div className="mt-5 pt-5 border-t border-line space-y-3">
                        <p className="eyebrow text-[10px]">Variables</p>

                        {hasImageHeader(selectedTemplate) && (
                          <div className="flex items-start gap-3">
                            <span className="text-[11px] text-subtle font-mono w-16 flex-shrink-0 pt-2.5 uppercase tracking-wider">
                              Header
                            </span>
                            <div className="flex-1">
                              {headerImagePreview ? (
                                <div className="relative inline-block">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={headerImagePreview}
                                    alt=""
                                    className="h-24 rounded-md object-cover border border-line"
                                  />
                                  {uploadingImage && (
                                    <div className="absolute inset-0 bg-ink/40 rounded-md flex items-center justify-center">
                                      <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                                      </svg>
                                    </div>
                                  )}
                                  {!uploadingImage && headerImageUrl && (
                                    <div className="absolute -top-2 -right-2 w-5 h-5 rounded-full flex items-center justify-center" style={{ background: "var(--accent)" }}>
                                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="20 6 9 17 4 12" />
                                      </svg>
                                    </div>
                                  )}
                                  <button
                                    onClick={() => {
                                      setHeaderImagePreview("");
                                      setHeaderImageUrl("");
                                    }}
                                    className="absolute -top-2 -left-2 w-5 h-5 rounded-full flex items-center justify-center"
                                    style={{ background: "var(--danger)" }}
                                  >
                                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                      <line x1="18" y1="6" x2="6" y2="18" />
                                      <line x1="6" y1="6" x2="18" y2="18" />
                                    </svg>
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => headerImageRef.current?.click()}
                                  className="flex items-center gap-2 px-4 py-2.5 bg-surface-2 border border-dashed border-line-2 rounded-md text-[12.5px] text-muted hover:border-accent hover:text-ink transition-all"
                                >
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="16 16 12 12 8 16" />
                                    <line x1="12" y1="12" x2="12" y2="21" />
                                    <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
                                  </svg>
                                  Upload header image
                                </button>
                              )}
                              <input
                                ref={headerImageRef}
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={handleHeaderImageUpload}
                              />
                            </div>
                          </div>
                        )}

                        {getPlaceholders(selectedTemplate).map((num) => {
                          const exampleBody = selectedTemplate.components?.find((c) => c.type === "BODY");
                          const examples = exampleBody?.example?.body_text?.[0] || [];
                          const exampleHint = examples[Number(num) - 1];
                          return (
                            <div key={num} className="flex items-center gap-3">
                              <span className="text-[11px] text-subtle font-mono w-16 flex-shrink-0 uppercase tracking-wider">
                                {`{{${num}}}`}
                              </span>
                              <input
                                type="text"
                                value={templateParams[num] || ""}
                                onChange={(e) =>
                                  setTemplateParams((prev) => ({ ...prev, [num]: e.target.value }))
                                }
                                placeholder={exampleHint || `Value for {{${num}}}`}
                                className="flex-1 bg-surface-2 border border-line rounded-md px-3 py-2 text-[13.5px] text-ink placeholder:text-faint focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft transition-all"
                              />
                            </div>
                          );
                        })}
                      </div>
                    )}
                </FormStep>

                {/* Step 3 — Recipients */}
                <FormStep step={3} title="Recipients" desc="Paste numbers or upload a CSV with a phoneNumber column.">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <p className="eyebrow text-[10px] mb-2">Manual entry</p>
                      <textarea
                        value={manualNumbers}
                        onChange={(e) => setManualNumbers(e.target.value)}
                        placeholder={"918877665544\n919199000000"}
                        rows={5}
                        className="w-full bg-surface-2 border border-line rounded-md px-3 py-2.5 text-[13px] text-ink placeholder:text-faint focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft transition-all resize-none font-mono"
                      />
                    </div>
                    <div>
                      <p className="eyebrow text-[10px] mb-2">CSV / Excel</p>
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full h-[124px] border border-dashed border-line-2 rounded-md flex flex-col items-center justify-center gap-2 hover:border-accent hover:bg-accent-tint transition-all cursor-pointer text-muted hover:text-ink"
                      >
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="16 16 12 12 8 16" />
                          <line x1="12" y1="12" x2="12" y2="21" />
                          <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
                        </svg>
                        <span className="text-[12.5px]">{csvFileName ? csvFileName : "Drop file or click"}</span>
                        {csvPhones.length > 0 && (
                          <span className="text-[10.5px] text-accent font-medium tnum">
                            {csvPhones.length} numbers loaded
                          </span>
                        )}
                      </button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".csv,.xlsx,.xls"
                        className="hidden"
                        onChange={handleCsvUpload}
                      />
                    </div>
                  </div>

                  <div className="mt-4 flex items-start gap-3 px-4 py-3 rounded-md" style={{ background: "var(--warn-soft)", border: "1px solid var(--warn)25" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--warn-ink)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 flex-shrink-0">
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                      <line x1="12" y1="9" x2="12" y2="13" />
                      <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                    <p className="text-[12px] leading-relaxed" style={{ color: "var(--warn-ink)" }}>
                      Your CSV must include a column named{" "}
                      <code className="font-mono px-1.5 py-0.5 rounded" style={{ background: "rgba(180, 83, 9, 0.12)" }}>
                        phoneNumber
                      </code>{" "}
                      for the recipient numbers.
                    </p>
                  </div>
                </FormStep>

                {/* Step 4 — Knowledge */}
                <FormStep step={4} title="Campaign knowledge base" desc="Used as the AI's system prompt when replying to recipients. Leave blank to use global settings.">
                  <textarea
                    value={campaignSystemPrompt}
                    onChange={(e) => setCampaignSystemPrompt(e.target.value)}
                    placeholder={`You are Pallavi, a senior investment consultant at Unisel Realty.\n\nThis campaign is about DLF Central 67 — premium SCO plots in Sector 67, Gurugram starting at ₹7.25 Cr…`}
                    rows={8}
                    className="w-full bg-surface-2 border border-line rounded-md px-3 py-3 text-[13px] text-ink placeholder:text-faint focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft transition-all resize-none font-mono leading-relaxed"
                  />
                </FormStep>

                {result && (
                  <div className="rounded-md px-4 py-3 flex items-center gap-3" style={{ background: "var(--accent-soft)", border: "1px solid var(--accent)40" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    <p className="text-[13.5px]" style={{ color: "var(--accent-ink)" }}>
                      Campaign sent — <span className="font-semibold tnum">{result.sentCount}</span> delivered, <span className="font-semibold tnum">{result.failedCount}</span> failed.
                    </p>
                  </div>
                )}

                <button
                  onClick={handleLaunch}
                  disabled={launching || !campaignName || !selectedTemplate || allPhones.length === 0}
                  className="w-full flex items-center justify-center gap-3 py-4 rounded-xl text-[14.5px] font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed text-white relative overflow-hidden group"
                  style={{
                    background: "linear-gradient(135deg, #14A871 0%, #0A7350 50%, #064D33 100%)",
                    boxShadow: "0 12px 28px -8px rgba(14, 138, 95, 0.45)",
                  }}
                >
                  <span
                    className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{
                      background:
                        "linear-gradient(120deg, transparent 30%, rgba(255,255,255,0.18) 50%, transparent 70%)",
                    }}
                  />
                  {launching ? (
                    <>
                      <Dots />
                      <span className="relative">Sending broadcast…</span>
                    </>
                  ) : (
                    <>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="relative">
                        <path d="M22 2L11 13" />
                        <polygon points="22 2 15 22 11 13 2 9 22 2" />
                      </svg>
                      <span className="relative">Launch broadcast</span>
                      {allPhones.length > 0 && (
                        <span className="opacity-70 font-mono tnum relative">· {allPhones.length} recipients</span>
                      )}
                    </>
                  )}
                </button>
              </div>

              {/* Phone preview */}
              <div className="hidden lg:flex flex-col items-center gap-4 sticky top-0 self-start pt-2">
                <p className="eyebrow text-[10px]">Live preview</p>
                <div
                  className="w-[260px] h-[460px] rounded-[40px] flex flex-col overflow-hidden relative shadow-lg"
                  style={{
                    background: "var(--paper-2)",
                    border: "8px solid var(--ink)",
                    boxShadow: "var(--shadow-lg)",
                  }}
                >
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-20 h-5 rounded-b-2xl z-10" style={{ background: "var(--ink)" }} />
                  <div className="flex-1 flex flex-col items-start justify-end p-4 pb-6 pt-12">
                    {selectedTemplate ? (
                      <div className="max-w-[92%] flex flex-col gap-1">
                        <div className="bg-white rounded-xl rounded-tl-sm shadow-sm overflow-hidden">
                          {headerImagePreview && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={headerImagePreview} alt="" className="w-full h-24 object-cover" />
                          )}
                          <div className="px-3 py-2.5">
                            <p className="text-[11px] text-gray-800 leading-relaxed whitespace-pre-wrap">
                              {previewText || `Template: ${selectedTemplate.name}`}
                            </p>
                            {getFooterText(selectedTemplate) && (
                              <p className="text-[9px] text-gray-400 mt-1.5 border-t border-gray-100 pt-1.5">
                                {getFooterText(selectedTemplate)}
                              </p>
                            )}
                            <p className="text-[9px] text-gray-400 mt-1 text-right tnum">10:45 AM</p>
                          </div>
                        </div>
                        {getButtons(selectedTemplate).map((btn, i) => (
                          <div
                            key={i}
                            className="bg-white rounded-xl shadow-sm px-3 py-2 flex items-center justify-center gap-1.5"
                          >
                            <span className="text-[10.5px] font-medium" style={{ color: "var(--info)" }}>
                              {btn.text}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex-1 flex flex-col items-center justify-center w-full gap-2 mb-12">
                        <svg
                          width="32"
                          height="32"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="rgba(0,0,0,0.18)"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <rect x="2" y="3" width="20" height="14" rx="2" />
                          <line x1="8" y1="21" x2="16" y2="21" />
                          <line x1="12" y1="17" x2="12" y2="21" />
                        </svg>
                        <p className="text-[10.5px] text-gray-500 text-center px-4">
                          Select a template to see live preview
                        </p>
                      </div>
                    )}
                  </div>
                </div>
                <p className="text-[10px] text-subtle text-center max-w-[200px] leading-relaxed uppercase tracking-wider">
                  Simulated render. Actual delivery may vary by handset.
                </p>
              </div>
            </div>
          )}

          {/* TEMPLATES */}
          {tab === "templates" && (
            <div className="p-5 md:p-10">
              <div className="flex items-center justify-between mb-6">
                <p className="text-[12.5px] text-muted tnum">
                  {templates.length} approved template{templates.length !== 1 ? "s" : ""}
                </p>
                <button
                  onClick={fetchTemplates}
                  className="text-[12.5px] text-muted hover:text-ink transition-colors flex items-center gap-1.5"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="23 4 23 10 17 10" />
                    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                  </svg>
                  Refresh
                </button>
              </div>

              {loadingTemplates ? (
                <div className="flex flex-col items-center gap-3 py-16"><Orbit size="md" /><p className="text-[12px] text-subtle uppercase tracking-wider">Loading templates</p></div>
              ) : templates.length === 0 ? (
                <div className="bg-surface border border-line rounded-lg py-16 px-8 text-center">
                  <p className="text-[14px] text-ink">No approved templates found.</p>
                  <p className="text-[12.5px] text-muted mt-2">Submit templates via Meta Business Manager.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {templates.map((t) => {
                    const body = t.components?.find((c) => c.type === "BODY")?.text;
                    const footer = t.components?.find((c) => c.type === "FOOTER")?.text;
                    const buttons = t.components?.find((c) => c.type === "BUTTONS")?.buttons || [];
                    return (
                      <article
                        key={t.id}
                        className="bg-surface border border-line rounded-lg p-5 space-y-3 hover:border-line-2 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-display text-[15px] font-semibold text-ink leading-tight tracking-tight">
                            {t.name}
                          </p>
                          <StatusChip status={t.status.toLowerCase()} />
                        </div>
                        {body && <p className="text-[12.5px] text-muted leading-relaxed line-clamp-3">{body}</p>}
                        {footer && (
                          <p className="text-[11px] text-subtle leading-relaxed border-t border-line pt-2">{footer}</p>
                        )}
                        {buttons.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {buttons.map((btn, i) => (
                              <span
                                key={i}
                                className="text-[10.5px] px-2 py-1 rounded-md font-medium flex items-center gap-1"
                                style={{
                                  background: "var(--info-soft)",
                                  color: "var(--info)",
                                  border: "1px solid var(--info)20",
                                }}
                              >
                                {btn.text}
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="chip">{t.language}</span>
                          <span className="chip">{t.category}</span>
                        </div>
                        <button
                          onClick={() => {
                            setSelectedTemplate(t);
                            setTab("broadcast");
                          }}
                          className="w-full text-[12.5px] py-2 rounded-md transition-all border"
                          style={{
                            color: "var(--accent-ink)",
                            background: "var(--accent-tint)",
                            borderColor: "var(--accent)40",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = "var(--accent-soft)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = "var(--accent-tint)";
                          }}
                        >
                          Use in campaign →
                        </button>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* REPORT */}
          {tab === "report" && (
            <div className="p-5 md:p-10">
              {loadingReport ? (
                <div className="flex flex-col items-center gap-3 py-20"><Orbit size="lg" /><p className="text-[12px] text-subtle uppercase tracking-wider">Loading report</p></div>
              ) : !report ? (
                <p className="text-[13px] text-muted py-12 text-center">No report data available.</p>
              ) : (
                <div className="space-y-6">
                  <header className="flex items-start justify-between flex-wrap gap-4">
                    <div>
                      <p className="eyebrow">Campaign report</p>
                      <h2 className="font-display text-[28px] tracking-tight text-ink mt-2 leading-tight">
                        {report.campaign.name}
                      </h2>
                      <p className="text-[12.5px] text-muted mt-1">
                        Template <span className="font-mono text-ink">{report.campaign.template_name}</span> · {formatDate(report.campaign.created_at)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={exportReportCSV}
                        className="btn-ghost flex items-center gap-1.5 text-[12.5px]"
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="7 10 12 15 17 10" />
                          <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                        Export CSV
                      </button>
                      <button
                        onClick={() => fetchReport(report.campaign.id)}
                        className="btn-ghost flex items-center gap-1.5 text-[12.5px]"
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="23 4 23 10 17 10" />
                          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                        </svg>
                        Refresh
                      </button>
                    </div>
                  </header>

                  {/* Stat grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 stagger">
                    {[
                      { label: "Total", value: report.summary.total, color: "var(--ink)", soft: "var(--surface-2)" },
                      { label: "Sent", value: report.summary.sent, color: "var(--sapphire)", soft: "var(--sapphire-soft)" },
                      { label: "Delivered", value: report.summary.delivered, color: "var(--emerald)", soft: "var(--emerald-soft)" },
                      { label: "Read", value: report.summary.read, color: "var(--violet)", soft: "var(--violet-soft)" },
                      { label: "Replied", value: report.summary.replied, color: "var(--amber)", soft: "var(--amber-soft)" },
                      { label: "Failed", value: report.summary.failed, color: "var(--coral)", soft: "var(--coral-soft)" },
                    ].map((stat) => (
                      <div
                        key={stat.label}
                        className="card card-hover p-4 relative overflow-hidden"
                      >
                        <span
                          className="absolute -top-6 -right-6 w-16 h-16 rounded-full"
                          style={{ background: stat.soft, opacity: 0.7 }}
                        />
                        <p className="font-display text-[30px] leading-none tnum relative" style={{ color: stat.color }}>
                          {stat.value}
                        </p>
                        <p className="eyebrow text-[10px] mt-2 relative">{stat.label}</p>
                        <span
                          className="absolute bottom-0 left-0 right-0 h-[3px]"
                          style={{ background: stat.color, opacity: 0.3 }}
                        />
                      </div>
                    ))}
                  </div>

                  {/* Rate bars */}
                  <section className="card p-6 space-y-5 relative overflow-hidden">
                    <span className="blob blob-emerald w-40 h-40 -top-16 -right-12 opacity-30" />
                    <p className="eyebrow relative">Performance rates</p>
                    {[
                      {
                        label: "Delivery",
                        value: report.summary.delivery_rate,
                        gradient: "linear-gradient(90deg, #14A871 0%, #0A7350 100%)",
                        track: "var(--emerald-soft)",
                      },
                      {
                        label: "Read",
                        value: report.summary.read_rate,
                        gradient: "linear-gradient(90deg, #8B79D3 0%, #4A2675 100%)",
                        track: "var(--violet-soft)",
                      },
                      {
                        label: "Reply",
                        value: report.summary.reply_rate,
                        gradient: "linear-gradient(90deg, #F4B860 0%, #B45309 100%)",
                        track: "var(--amber-soft)",
                      },
                    ].map((rate) => (
                      <div key={rate.label} className="relative">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[12.5px] text-muted font-medium">{rate.label} rate</span>
                          <span className="font-display text-[18px] text-ink tnum font-semibold">{rate.value}%</span>
                        </div>
                        <div className="h-2 rounded-full overflow-hidden" style={{ background: rate.track }}>
                          <div
                            className="h-full rounded-full transition-all duration-1000 ease-out relative"
                            style={{ background: rate.gradient, width: `${rate.value}%` }}
                          >
                            <span
                              className="absolute inset-0 opacity-50"
                              style={{
                                background:
                                  "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.4) 50%, transparent 100%)",
                                animation: "stripe-slide 2.4s ease-in-out infinite",
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </section>

                  {/* Table */}
                  <section className="bg-surface border border-line rounded-lg overflow-hidden">
                    <header className="px-5 py-4 border-b border-line flex flex-wrap items-center gap-2">
                      <p className="eyebrow mr-2">Recipients</p>
                      {[
                        { label: "All", value: "" },
                        { label: "Sent", value: "sent" },
                        { label: "Delivered", value: "delivered" },
                        { label: "Read", value: "read" },
                        { label: "Replied", value: "replied" },
                        { label: "Failed", value: "failed" },
                      ].map((chip) => {
                        const isAll = chip.value === "";
                        const isActive = isAll
                          ? statusFilter.length === 0
                          : statusFilter.includes(chip.value);
                        const tone = STATUS_TONE[chip.value] ?? null;
                        return (
                          <button
                            key={chip.label}
                            onClick={() => {
                              if (isAll) setStatusFilter([]);
                              else
                                setStatusFilter((prev) =>
                                  prev.includes(chip.value)
                                    ? prev.filter((s) => s !== chip.value)
                                    : [...prev, chip.value]
                                );
                            }}
                            className="px-2.5 py-1 rounded-full text-[10.5px] font-semibold uppercase tracking-wider border transition-all"
                            style={{
                              background: isActive
                                ? tone?.bg ?? "var(--ink)"
                                : "var(--surface-2)",
                              color: isActive
                                ? tone?.ink ?? "var(--paper)"
                                : "var(--muted)",
                              borderColor: isActive
                                ? tone?.border ?? "var(--ink)"
                                : "var(--line)",
                            }}
                          >
                            {chip.label}
                          </button>
                        );
                      })}
                    </header>
                    <div className="overflow-x-auto">
                      <table className="w-full text-[12.5px]">
                        <thead>
                          <tr className="border-b border-line bg-surface-2">
                            <Th>Phone</Th>
                            <Th>Status</Th>
                            <Th hidden="sm">Delivered</Th>
                            <Th hidden="sm">Read</Th>
                            <Th hidden="md">Replied</Th>
                            <Th hidden="lg">Error</Th>
                            <Th>Chat</Th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredRecipients.map((r) => (
                            <tr
                              key={r.phone}
                              className="border-b border-line/60 hover:bg-hover transition-colors"
                            >
                              <td className="px-4 py-3 text-ink font-mono tnum">{r.phone}</td>
                              <td className="px-4 py-3">
                                <StatusChip status={r.status} />
                              </td>
                              <td className="px-4 py-3 text-muted hidden sm:table-cell tnum">
                                {r.delivered_at ? formatDate(r.delivered_at) : "—"}
                              </td>
                              <td className="px-4 py-3 text-muted hidden sm:table-cell tnum">
                                {r.read_at ? formatDate(r.read_at) : "—"}
                              </td>
                              <td className="px-4 py-3 hidden md:table-cell tnum">
                                {r.replied_at ? (
                                  <span style={{ color: "var(--warn)" }}>{formatDate(r.replied_at)}</span>
                                ) : (
                                  <span className="text-faint">—</span>
                                )}
                              </td>
                              <td className="px-4 py-3 hidden lg:table-cell max-w-[220px] truncate" style={{ color: "var(--danger-ink)" }}>
                                {r.error || "—"}
                              </td>
                              <td className="px-4 py-3">
                                <Link
                                  href={`/?phone=${encodeURIComponent(r.phone)}`}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium text-muted hover:text-ink hover:bg-hover border border-line transition-all"
                                >
                                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                                  </svg>
                                  Open
                                </Link>
                              </td>
                            </tr>
                          ))}
                          {filteredRecipients.length === 0 && (
                            <tr>
                              <td colSpan={7} className="px-4 py-12 text-center text-[13px] text-muted">
                                No recipients match the selected filter.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </div>
              )}
            </div>
          )}

          {/* HISTORY */}
          {tab === "history" && (
            <div className="p-5 md:p-10">
              <div className="flex items-center justify-between mb-6">
                <p className="text-[12.5px] text-muted tnum">
                  {history.length} campaign{history.length !== 1 ? "s" : ""}
                </p>
                <button
                  onClick={fetchHistory}
                  className="text-[12.5px] text-muted hover:text-ink transition-colors flex items-center gap-1.5"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="23 4 23 10 17 10" />
                    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                  </svg>
                  Refresh
                </button>
              </div>

              {loadingHistory ? (
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} height={72} className="rounded-lg" />
                  ))}
                </div>
              ) : history.length === 0 ? (
                <div className="bg-surface border border-line rounded-lg py-16 px-8 text-center">
                  <p className="text-[14px] text-ink">No campaigns yet.</p>
                  <p className="text-[12.5px] text-muted mt-2">Compose your first broadcast above.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {history.map((c) => (
                    <article
                      key={c.id}
                      className="bg-surface border border-line rounded-lg px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-4 hover:border-line-2 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2.5 mb-1 flex-wrap">
                          <p className="font-display text-[15px] font-semibold text-ink truncate tracking-tight">
                            {c.name}
                          </p>
                          <StatusChip status={c.status} />
                          {c.has_buttons && (
                            <span className="chip" style={{ background: "var(--info-soft)", color: "var(--info)", border: "1px solid var(--info)25" }}>
                              Buttons
                            </span>
                          )}
                        </div>
                        <p className="text-[12px] text-muted">
                          Template <span className="font-mono text-ink">{c.template_name}</span> · {formatDate(c.created_at)}
                        </p>
                      </div>
                      <div className="flex items-center gap-5 flex-shrink-0">
                        <Stat value={c.total_recipients} label="Total" />
                        <Stat value={c.sent_count} label="Sent" color="var(--accent)" />
                        <Stat value={c.failed_count} label="Failed" color="var(--danger)" />
                        <button
                          onClick={() => {
                            fetchReport(c.id);
                            setTab("report");
                          }}
                          className="btn-ghost text-[12px] flex-shrink-0"
                        >
                          View report →
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FormStep({
  step,
  title,
  desc,
  children,
}: {
  step: number;
  title: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-surface border border-line rounded-lg p-5 md:p-6">
      <div className="flex items-baseline gap-3 mb-5">
        <span
          className="font-display text-[12px] tnum w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
          style={{
            background: "var(--paper-2)",
            color: "var(--muted)",
            border: "1px solid var(--line)",
          }}
        >
          {step}
        </span>
        <div>
          <h3 className="font-display text-[17px] tracking-tight text-ink leading-none">{title}</h3>
          <p className="text-[12.5px] text-muted mt-1.5 leading-relaxed">{desc}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function Th({ children, hidden }: { children: React.ReactNode; hidden?: "sm" | "md" | "lg" }) {
  const hideCls = hidden === "sm" ? "hidden sm:table-cell" : hidden === "md" ? "hidden md:table-cell" : hidden === "lg" ? "hidden lg:table-cell" : "";
  return (
    <th className={`text-left px-4 py-3 eyebrow text-[10px] ${hideCls}`}>{children}</th>
  );
}

function Stat({ value, label, color }: { value: number; label: string; color?: string }) {
  return (
    <div className="text-center">
      <p className="font-display text-[18px] leading-none tnum" style={{ color: color || "var(--ink)" }}>
        {value}
      </p>
      <p className="text-[10px] text-subtle uppercase tracking-wider mt-1">{label}</p>
    </div>
  );
}
