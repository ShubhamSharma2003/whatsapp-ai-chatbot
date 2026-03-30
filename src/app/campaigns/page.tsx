"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";

type Tab = "broadcast" | "templates" | "history";

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
  created_at: string;
};

export default function CampaignsPage() {
  const [tab, setTab] = useState<Tab>("broadcast");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [history, setHistory] = useState<Campaign[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Broadcast form state
  const [campaignName, setCampaignName] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [templateParams, setTemplateParams] = useState<Record<string, string>>({});
  const [headerImageUrl, setHeaderImageUrl] = useState("");
  const [headerImagePreview, setHeaderImagePreview] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);
  const headerImageRef = useRef<HTMLInputElement>(null);
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

  // Extract {{1}}, {{2}}, ... placeholders from template body
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
      // Find phoneNumber column or use first column
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

  return (
    <div className="flex h-screen bg-[#0f0f0f] font-sans">
      {/* Sidebar */}
      <div className="w-[220px] flex flex-col border-r border-white/[0.06]" style={{ background: "#141414" }}>
        <div className="px-5 py-4 border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center flex-shrink-0">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <h1 className="text-sm font-semibold text-white leading-tight">WhatsApp AI</h1>
          </div>
        </div>
        <nav className="flex flex-col gap-1 p-3">
          <Link
            href="/"
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-white/50 hover:text-white/80 hover:bg-white/[0.04] transition-all"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            Conversations
          </Link>
          <Link
            href="/campaigns"
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-white bg-white/[0.08] border border-white/[0.08] transition-all"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 2L11 13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
            Campaigns
          </Link>
        </nav>
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <div className="px-8 py-5 border-b border-white/[0.06]" style={{ background: "#141414" }}>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-white">Campaigns</h2>
              <p className="text-xs text-white/40 mt-0.5">Broadcast Meta-approved templates</p>
            </div>
            {/* Tabs */}
            <div className="flex items-center gap-1 bg-white/[0.04] rounded-lg p-1 border border-white/[0.06]">
              {(["broadcast", "templates", "history"] as Tab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-4 py-1.5 rounded-md text-xs font-medium capitalize transition-all ${
                    tab === t
                      ? "bg-white/[0.1] text-white border border-white/[0.1]"
                      : "text-white/40 hover:text-white/60"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {/* BROADCAST TAB */}
          {tab === "broadcast" && (
            <div className="flex gap-6 p-8 h-full">
              {/* Form */}
              <div className="flex-1 max-w-xl">
                <div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-6 space-y-5">
                  {/* Campaign Name */}
                  <div>
                    <label className="text-xs font-medium text-white/50 uppercase tracking-wider block mb-2">Campaign Name</label>
                    <input
                      type="text"
                      value={campaignName}
                      onChange={(e) => setCampaignName(e.target.value)}
                      placeholder="Summer Launch 2026"
                      className="w-full bg-white/[0.05] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-emerald-500/40 transition-colors"
                    />
                  </div>

                  {/* Template */}
                  <div>
                    <label className="text-xs font-medium text-white/50 uppercase tracking-wider block mb-2">Template</label>
                    {loadingTemplates ? (
                      <div className="text-xs text-white/30 py-2">Loading templates...</div>
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
                        className="w-full bg-white/[0.05] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500/40 transition-colors appearance-none cursor-pointer"
                      >
                        <option value="" className="bg-[#1a1a1a]">-- Choose Template --</option>
                        {templates.map((t) => (
                          <option key={t.id} value={t.name} className="bg-[#1a1a1a]">
                            {t.name} ({t.language})
                          </option>
                        ))}
                      </select>
                    )}
                    {templates.length === 0 && !loadingTemplates && (
                      <p className="text-xs text-white/30 mt-1.5">No approved templates found in your Meta account.</p>
                    )}
                  </div>

                  {/* Template Variables */}
                  {selectedTemplate && (hasImageHeader(selectedTemplate) || getPlaceholders(selectedTemplate).length > 0) && (
                    <div>
                      <label className="text-xs font-medium text-white/50 uppercase tracking-wider block mb-2">
                        Template Variables
                      </label>
                      <div className="space-y-2">
                        {/* Image header upload */}
                        {hasImageHeader(selectedTemplate) && (
                          <div className="flex items-start gap-3">
                            <span className="text-xs text-white/30 font-mono w-16 flex-shrink-0 pt-2.5">Header</span>
                            <div className="flex-1">
                              {headerImagePreview ? (
                                <div className="relative inline-block">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={headerImagePreview} alt="Header preview" className="h-20 rounded-lg object-cover border border-white/10" />
                                  {uploadingImage && (
                                    <div className="absolute inset-0 bg-black/50 rounded-lg flex items-center justify-center">
                                      <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                                      </svg>
                                    </div>
                                  )}
                                  {!uploadingImage && headerImageUrl && (
                                    <div className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-emerald-500 rounded-full flex items-center justify-center">
                                      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="20 6 9 17 4 12" />
                                      </svg>
                                    </div>
                                  )}
                                  <button onClick={() => { setHeaderImagePreview(""); setHeaderImageUrl(""); }} className="absolute -top-1.5 -left-1.5 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center">
                                    <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                                    </svg>
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => headerImageRef.current?.click()}
                                  className="flex items-center gap-2 px-3 py-2 bg-white/5 border border-dashed border-white/10 rounded-lg text-xs text-white/40 hover:border-emerald-500/30 hover:text-white/60 transition-all"
                                >
                                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="16 16 12 12 8 16" /><line x1="12" y1="12" x2="12" y2="21" />
                                    <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
                                  </svg>
                                  Upload header image
                                </button>
                              )}
                              <input ref={headerImageRef} type="file" accept="image/*" className="hidden" onChange={handleHeaderImageUpload} />
                            </div>
                          </div>
                        )}
                        {/* Body placeholders */}
                        {getPlaceholders(selectedTemplate).map((num) => {
                          const exampleBody = selectedTemplate.components?.find((c) => c.type === "BODY");
                          const examples = exampleBody?.example?.body_text?.[0] || [];
                          const exampleHint = examples[Number(num) - 1];
                          return (
                            <div key={num} className="flex items-center gap-3">
                              <span className="text-xs text-white/30 font-mono w-16 flex-shrink-0">{`{{${num}}}`}</span>
                              <input
                                type="text"
                                value={templateParams[num] || ""}
                                onChange={(e) =>
                                  setTemplateParams((prev) => ({ ...prev, [num]: e.target.value }))
                                }
                                placeholder={exampleHint || `Value for {{${num}}}`}
                                className="flex-1 bg-white/[0.05] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-emerald-500/40 transition-colors"
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Recipients */}
                  <div>
                    <label className="text-xs font-medium text-white/50 uppercase tracking-wider block mb-2">Recipients</label>
                    <div className="grid grid-cols-2 gap-3">
                      {/* Manual */}
                      <div>
                        <p className="text-[10px] text-white/30 uppercase tracking-wider mb-1.5">Manual Numbers</p>
                        <textarea
                          value={manualNumbers}
                          onChange={(e) => setManualNumbers(e.target.value)}
                          placeholder={"918877665544\n919199000000"}
                          rows={4}
                          className="w-full bg-white/[0.05] border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-emerald-500/40 transition-colors resize-none font-mono text-xs"
                        />
                      </div>
                      {/* CSV */}
                      <div>
                        <p className="text-[10px] text-white/30 uppercase tracking-wider mb-1.5">Excel / CSV</p>
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          className="w-full h-[104px] border border-dashed border-white/[0.12] rounded-xl flex flex-col items-center justify-center gap-2 hover:border-emerald-500/30 hover:bg-emerald-500/[0.03] transition-all cursor-pointer"
                        >
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="16 16 12 12 8 16" /><line x1="12" y1="12" x2="12" y2="21" />
                            <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
                          </svg>
                          <span className="text-xs text-white/30">
                            {csvFileName ? csvFileName : "Upload File"}
                          </span>
                          {csvPhones.length > 0 && (
                            <span className="text-[10px] text-emerald-400">{csvPhones.length} numbers loaded</span>
                          )}
                        </button>
                        <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleCsvUpload} />
                      </div>
                    </div>

                    {/* CSV format note */}
                    <div className="mt-3 bg-amber-500/[0.06] border border-amber-500/[0.12] rounded-xl px-4 py-3">
                      <p className="text-xs text-amber-400/80">
                        <span className="font-medium">Note:</span> Your CSV or Excel file must contain a column named{" "}
                        <code className="bg-amber-500/10 px-1.5 py-0.5 rounded text-amber-300 font-mono">phoneNumber</code>{" "}
                        for the recipient numbers.
                      </p>
                    </div>
                  </div>

                  {/* Result */}
                  {result && (
                    <div className="bg-emerald-500/[0.08] border border-emerald-500/[0.2] rounded-xl px-4 py-3 flex items-center gap-3">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      <p className="text-sm text-emerald-300">
                        Campaign sent! {result.sentCount} delivered, {result.failedCount} failed.
                      </p>
                    </div>
                  )}

                  {/* Launch */}
                  <button
                    onClick={handleLaunch}
                    disabled={launching || !campaignName || !selectedTemplate || allPhones.length === 0}
                    className="w-full flex items-center justify-center gap-2.5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-30 disabled:cursor-not-allowed text-white text-sm font-semibold transition-all"
                  >
                    {launching ? (
                      <>
                        <svg className="animate-spin" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                        </svg>
                        Sending...
                      </>
                    ) : (
                      <>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M22 2L11 13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
                        </svg>
                        Launch Campaign
                        {allPhones.length > 0 && <span className="opacity-60">· {allPhones.length} recipients</span>}
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Phone Preview */}
              <div className="flex flex-col items-center justify-center gap-4 flex-shrink-0">
                <p className="text-[10px] text-white/30 uppercase tracking-wider">Message Preview</p>
                <div className="w-[240px] h-[420px] rounded-[36px] border-[6px] border-[#1e1e1e] bg-[#e5ddd5] shadow-2xl flex flex-col overflow-hidden relative">
                  {/* Notch */}
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-16 h-4 bg-[#1e1e1e] rounded-b-xl z-10" />
                  <div className="flex-1 flex flex-col items-start justify-end p-4 pb-6">
                    {selectedTemplate ? (
                      <div className="max-w-[90%] flex flex-col gap-1">
                        <div className="bg-white rounded-xl rounded-tl-sm shadow-sm overflow-hidden">
                          {headerImagePreview && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={headerImagePreview} alt="Header" className="w-full h-24 object-cover" />
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
                            <p className="text-[9px] text-gray-400 mt-1 text-right">10:45 AM</p>
                          </div>
                        </div>
                        {getButtons(selectedTemplate).map((btn, i) => (
                          <div key={i} className="bg-white rounded-xl shadow-sm px-3 py-2 flex items-center justify-center gap-1.5">
                            {btn.type === "QUICK_REPLY" && (
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#0ea5e9" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="9 18 15 12 9 6" />
                              </svg>
                            )}
                            {btn.type === "URL" && (
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#0ea5e9" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
                              </svg>
                            )}
                            {btn.type === "PHONE_NUMBER" && (
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#0ea5e9" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12.1 19.79 19.79 0 0 1 1.61 3.47 2 2 0 0 1 3.6 1.28h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.96a16 16 0 0 0 6 6l.92-.92a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21.72 16.92z" />
                              </svg>
                            )}
                            <span className="text-[10px] text-sky-500 font-medium">{btn.text}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex-1 flex flex-col items-center justify-center w-full gap-2 mb-12">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(0,0,0,0.15)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
                        </svg>
                        <p className="text-[10px] text-gray-400 text-center">Select a template to see live preview</p>
                      </div>
                    )}
                  </div>
                </div>
                <p className="text-[9px] text-white/20 text-center max-w-[180px]">
                  This preview shows a simulation of the message as it will appear on the recipient&apos;s phone.
                </p>
              </div>
            </div>
          )}

          {/* TEMPLATES TAB */}
          {tab === "templates" && (
            <div className="p-8">
              <div className="flex items-center justify-between mb-5">
                <p className="text-xs text-white/40">{templates.length} approved template{templates.length !== 1 ? "s" : ""}</p>
                <button onClick={fetchTemplates} className="text-xs text-white/40 hover:text-white/70 transition-colors flex items-center gap-1.5">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                  </svg>
                  Refresh
                </button>
              </div>
              {loadingTemplates ? (
                <div className="text-sm text-white/30 py-12 text-center">Loading templates...</div>
              ) : templates.length === 0 ? (
                <div className="text-sm text-white/30 py-12 text-center">No approved templates found.</div>
              ) : (
                <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
                  {templates.map((t) => {
                    const body = t.components?.find((c) => c.type === "BODY")?.text;
                    const footer = t.components?.find((c) => c.type === "FOOTER")?.text;
                    const buttons = t.components?.find((c) => c.type === "BUTTONS")?.buttons || [];
                    return (
                      <div key={t.id} className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-5 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium text-white leading-tight">{t.name}</p>
                          <span className="text-[9px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 font-medium uppercase tracking-wide flex-shrink-0">
                            {t.status}
                          </span>
                        </div>
                        {body && (
                          <p className="text-xs text-white/40 leading-relaxed line-clamp-3">{body}</p>
                        )}
                        {footer && (
                          <p className="text-[10px] text-white/25 leading-relaxed border-t border-white/[0.06] pt-2">{footer}</p>
                        )}
                        {buttons.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {buttons.map((btn, i) => (
                              <span key={i} className="text-[10px] px-2.5 py-1 rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/20 flex items-center gap-1">
                                {btn.type === "QUICK_REPLY" && (
                                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="9 18 15 12 9 6" />
                                  </svg>
                                )}
                                {btn.type === "URL" && (
                                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
                                  </svg>
                                )}
                                {btn.type === "PHONE_NUMBER" && (
                                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12.1 19.79 19.79 0 0 1 1.61 3.47 2 2 0 0 1 3.6 1.28h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.96a16 16 0 0 0 6 6l.92-.92a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21.72 16.92z" />
                                  </svg>
                                )}
                                {btn.text}
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] px-2 py-0.5 rounded bg-white/[0.06] text-white/40">{t.language}</span>
                          <span className="text-[10px] px-2 py-0.5 rounded bg-white/[0.06] text-white/40">{t.category}</span>
                        </div>
                        <button
                          onClick={() => { setSelectedTemplate(t); setTab("broadcast"); }}
                          className="w-full text-xs py-1.5 rounded-lg border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/10 transition-all"
                        >
                          Use in Campaign
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* HISTORY TAB */}
          {tab === "history" && (
            <div className="p-8">
              <div className="flex items-center justify-between mb-5">
                <p className="text-xs text-white/40">{history.length} campaign{history.length !== 1 ? "s" : ""}</p>
                <button onClick={fetchHistory} className="text-xs text-white/40 hover:text-white/70 transition-colors flex items-center gap-1.5">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                  </svg>
                  Refresh
                </button>
              </div>
              {loadingHistory ? (
                <div className="text-sm text-white/30 py-12 text-center">Loading history...</div>
              ) : history.length === 0 ? (
                <div className="text-sm text-white/30 py-12 text-center">No campaigns launched yet.</div>
              ) : (
                <div className="space-y-3">
                  {history.map((c) => (
                    <div key={c.id} className="bg-white/[0.03] border border-white/[0.07] rounded-2xl px-5 py-4 flex items-center gap-5">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2.5 mb-1">
                          <p className="text-sm font-medium text-white truncate">{c.name}</p>
                          <span className={`text-[9px] px-2 py-0.5 rounded-full font-medium uppercase tracking-wide flex-shrink-0 ${
                            c.status === "done" ? "bg-emerald-500/15 text-emerald-400" :
                            c.status === "sending" ? "bg-blue-500/15 text-blue-400" :
                            c.status === "failed" ? "bg-red-500/15 text-red-400" :
                            "bg-white/10 text-white/40"
                          }`}>
                            {c.status}
                          </span>
                        </div>
                        <p className="text-xs text-white/40">Template: {c.template_name} · {formatDate(c.created_at)}</p>
                      </div>
                      <div className="flex items-center gap-6 flex-shrink-0 text-center">
                        <div>
                          <p className="text-lg font-semibold text-white">{c.total_recipients}</p>
                          <p className="text-[10px] text-white/30">Total</p>
                        </div>
                        <div>
                          <p className="text-lg font-semibold text-emerald-400">{c.sent_count}</p>
                          <p className="text-[10px] text-white/30">Sent</p>
                        </div>
                        <div>
                          <p className="text-lg font-semibold text-red-400">{c.failed_count}</p>
                          <p className="text-[10px] text-white/30">Failed</p>
                        </div>
                      </div>
                    </div>
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
