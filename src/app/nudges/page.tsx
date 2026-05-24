"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import SidebarNav, { MobileNavToggle } from "@/components/ui/SidebarNav";
import { Skeleton } from "@/components/ui/Loaders";
import type {
  NudgeBodyParamSpec,
  NudgeHeaderMediaType,
  NudgeRule,
  NudgeSourceType,
  NudgeTemplateCategory,
} from "@/lib/types";

// ---------- Types mirrored from campaigns page (Meta template shape) ----------

type WaTemplateComponent = {
  type: string;
  format?: string;
  text?: string;
};
type WaTemplate = {
  id: string;
  name: string;
  status: string;
  language: string;
  category: string;
  components: WaTemplateComponent[];
};

type LeadTypeOption = {
  id: string;
  lead_type: string;
  display_name: string;
};

type CampaignOption = {
  id: string;
  name: string;
};

// ---------- Helpers ----------

function getHeaderFormat(
  t: WaTemplate | null
): "IMAGE" | "DOCUMENT" | "VIDEO" | null {
  if (!t) return null;
  const fmt = t.components?.find((c) => c.type === "HEADER")?.format;
  if (fmt === "IMAGE" || fmt === "DOCUMENT" || fmt === "VIDEO") return fmt;
  return null;
}

function getBodyText(t: WaTemplate | null): string {
  return t?.components?.find((c) => c.type === "BODY")?.text || "";
}

function getPlaceholders(t: WaTemplate | null): string[] {
  if (!t) return [];
  const body = t.components?.find((c) => c.type === "BODY")?.text || "";
  const matches = body.match(/\{\{(\d+)\}\}/g) || [];
  return [...new Set(matches.map((m) => m.replace(/\{\{|\}\}/g, "")))].sort(
    (a, b) => Number(a) - Number(b)
  );
}

function headerFmtToMediaType(
  fmt: "IMAGE" | "DOCUMENT" | "VIDEO" | null
): NudgeHeaderMediaType | null {
  if (!fmt) return null;
  if (fmt === "IMAGE") return "image";
  if (fmt === "DOCUMENT") return "document";
  return "video";
}

// ---------- Form shape ----------

type FormState = {
  name: string;
  enabled: boolean;
  source_type: NudgeSourceType | "any";
  source_campaign_id: string;
  lead_type: string;
  delay_hours: number;
  attempt_number: number;
  min_gap_hours: number;
  max_attempts: number;
  template_name: string;
  template_language: string;
  template_category: NudgeTemplateCategory;
  template_body_params: NudgeBodyParamSpec[];
  template_body_text: string;
  template_header_url: string;
  template_header_media_type: NudgeHeaderMediaType | null;
  template_header_filename: string;
  respect_24h_window: boolean;
  free_form_fallback: string;
};

const EMPTY_FORM: FormState = {
  name: "",
  enabled: true,
  source_type: "any",
  source_campaign_id: "",
  lead_type: "",
  delay_hours: 24,
  attempt_number: 1,
  min_gap_hours: 24,
  max_attempts: 2,
  template_name: "",
  template_language: "en",
  template_category: "UTILITY",
  template_body_params: [],
  template_body_text: "",
  template_header_url: "",
  template_header_media_type: null,
  template_header_filename: "",
  respect_24h_window: true,
  free_form_fallback: "",
};

// ---------- Page ----------

export default function NudgesPage() {
  const [rules, setRules] = useState<NudgeRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [editing, setEditing] = useState<NudgeRule | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<WaTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [leadTypes, setLeadTypes] = useState<LeadTypeOption[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);
  const [headerUploading, setHeaderUploading] = useState(false);
  const headerInputRef = useRef<HTMLInputElement>(null);

  const fetchRules = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/nudges/rules");
    const data = await res.json();
    if (Array.isArray(data)) setRules(data);
    setLoading(false);
  }, []);

  const fetchTemplates = useCallback(async () => {
    setLoadingTemplates(true);
    const res = await fetch("/api/campaigns/templates");
    const data = await res.json();
    setTemplates(Array.isArray(data) ? data : []);
    setLoadingTemplates(false);
  }, []);

  const fetchLeadTypes = useCallback(async () => {
    const res = await fetch("/api/lead-types");
    const data = await res.json();
    if (Array.isArray(data)) {
      setLeadTypes(
        data.map((d: LeadTypeOption) => ({
          id: d.id,
          lead_type: d.lead_type,
          display_name: d.display_name,
        }))
      );
    }
  }, []);

  const fetchCampaigns = useCallback(async () => {
    const res = await fetch("/api/campaigns/history");
    const data = await res.json();
    if (Array.isArray(data)) {
      setCampaigns(data.map((d: CampaignOption) => ({ id: d.id, name: d.name })));
    }
  }, []);

  useEffect(() => {
    fetchRules();
    fetchTemplates();
    fetchLeadTypes();
    fetchCampaigns();
  }, [fetchRules, fetchTemplates, fetchLeadTypes, fetchCampaigns]);

  const selectedTemplate = useMemo<WaTemplate | null>(() => {
    if (!form.template_name) return null;
    return (
      templates.find(
        (t) =>
          t.name === form.template_name &&
          t.language === (form.template_language || "en")
      ) ??
      templates.find((t) => t.name === form.template_name) ??
      null
    );
  }, [templates, form.template_name, form.template_language]);

  const selectedHeaderFmt = getHeaderFormat(selectedTemplate);
  const placeholderNums = getPlaceholders(selectedTemplate);

  function pickTemplate(name: string) {
    if (!name) {
      setForm((p) => ({
        ...p,
        template_name: "",
        template_header_url: "",
        template_header_media_type: null,
        template_body_text: "",
        template_body_params: [],
      }));
      return;
    }
    const t = templates.find((x) => x.name === name);
    if (!t) return;
    const fmt = getHeaderFormat(t);
    const mediaType = headerFmtToMediaType(fmt);
    const numPlaceholders = getPlaceholders(t).length;
    // Default body params: one slot per placeholder, first = name, rest = literal
    const defaultParams: NudgeBodyParamSpec[] = Array.from(
      { length: numPlaceholders },
      (_, i): NudgeBodyParamSpec =>
        i === 0 ? { type: "name" } : { type: "literal", value: "" }
    );
    setForm((p) => ({
      ...p,
      template_name: t.name,
      template_language: t.language,
      template_category:
        t.category === "MARKETING" ? "MARKETING" : "UTILITY",
      template_body_text: getBodyText(t),
      template_body_params: defaultParams,
      template_header_media_type: mediaType,
      template_header_url: "",
      template_header_filename: "",
    }));
  }

  async function handleHeaderUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setHeaderUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/settings/upload-direct-attachment", {
      method: "POST",
      body: fd,
    });
    const data = await res.json();
    setHeaderUploading(false);
    if (data.url) {
      setForm((p) => ({
        ...p,
        template_header_url: data.url,
        template_header_filename: data.filename ?? file.name,
      }));
    }
  }

  function startCreate() {
    setForm(EMPTY_FORM);
    setEditing(null);
    setCreating(true);
    setError(null);
  }

  function startEdit(r: NudgeRule) {
    setForm({
      name: r.name,
      enabled: r.enabled,
      source_type: r.source_type ?? "any",
      source_campaign_id: r.source_campaign_id ?? "",
      lead_type: r.lead_type ?? "",
      delay_hours: Number(r.delay_hours),
      attempt_number: r.attempt_number,
      min_gap_hours: Number(r.min_gap_hours),
      max_attempts: r.max_attempts,
      template_name: r.template_name,
      template_language: r.template_language,
      template_category: r.template_category,
      template_body_params: r.template_body_params ?? [],
      template_body_text: r.template_body_text ?? "",
      template_header_url: r.template_header_url ?? "",
      template_header_media_type: r.template_header_media_type,
      template_header_filename: r.template_header_filename ?? "",
      respect_24h_window: r.respect_24h_window,
      free_form_fallback: r.free_form_fallback ?? "",
    });
    setEditing(r);
    setCreating(false);
    setError(null);
  }

  function closeDrawer() {
    setEditing(null);
    setCreating(false);
    setError(null);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: form.name,
        enabled: form.enabled,
        source_type: form.source_type === "any" ? null : form.source_type,
        source_campaign_id: form.source_campaign_id || null,
        lead_type: form.lead_type || null,
        delay_hours: form.delay_hours,
        attempt_number: form.attempt_number,
        min_gap_hours: form.min_gap_hours,
        max_attempts: form.max_attempts,
        template_name: form.template_name,
        template_language: form.template_language,
        template_category: form.template_category,
        template_body_params: form.template_body_params,
        template_body_text: form.template_body_text || null,
        template_header_url: form.template_header_url || null,
        template_header_media_type: form.template_header_media_type,
        template_header_filename: form.template_header_filename || null,
        respect_24h_window: form.respect_24h_window,
        free_form_fallback: form.free_form_fallback || null,
      };
      const res = creating
        ? await fetch("/api/nudges/rules", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch(`/api/nudges/rules/${editing!.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Save failed");
        return;
      }
      await fetchRules();
      closeDrawer();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(r: NudgeRule) {
    if (!confirm(`Delete nudge rule "${r.name}"?`)) return;
    const res = await fetch(`/api/nudges/rules/${r.id}`, {
      method: "DELETE",
    });
    if (res.ok) await fetchRules();
  }

  async function handleToggleEnabled(r: NudgeRule) {
    await fetch(`/api/nudges/rules/${r.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !r.enabled }),
    });
    await fetchRules();
  }

  function updateParam(idx: number, spec: NudgeBodyParamSpec) {
    setForm((p) => {
      const next = [...p.template_body_params];
      next[idx] = spec;
      return { ...p, template_body_params: next };
    });
  }

  function addParam() {
    setForm((p) => ({
      ...p,
      template_body_params: [
        ...p.template_body_params,
        { type: "literal", value: "" },
      ],
    }));
  }

  function removeParam(idx: number) {
    setForm((p) => ({
      ...p,
      template_body_params: p.template_body_params.filter((_, i) => i !== idx),
    }));
  }

  const drawerOpen = creating || editing !== null;
  const showMarketingWarning = form.template_category === "MARKETING";
  const showAggressiveWarning =
    form.delay_hours < 4 || form.max_attempts > 2;

  return (
    <div className="flex h-screen bg-paper">
      <SidebarNav
        active="/nudges"
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="px-5 md:px-10 py-6 border-b border-line bg-surface flex-shrink-0">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <MobileNavToggle onClick={() => setSidebarOpen(true)} />
              <div className="min-w-0">
                <p className="eyebrow">Re-engagement</p>
                <h1 className="font-display text-[28px] leading-none tracking-tight text-ink mt-2">
                  Nudges
                </h1>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href="/nudges/analytics"
                className="px-4 py-2.5 rounded-md text-[13px] font-medium border border-line text-ink hover:bg-hover"
              >
                Analytics →
              </Link>
              <button
                onClick={startCreate}
                className="px-4 py-2.5 rounded-md text-[13px] font-medium text-white"
                style={{
                  background:
                    "linear-gradient(135deg, #14A871 0%, #0A7350 60%, #064D33 100%)",
                  boxShadow: "0 8px 20px -6px rgba(14, 138, 95, 0.45)",
                }}
              >
                + New nudge rule
              </button>
            </div>
          </div>
          <p className="text-[12.5px] text-muted mt-3 max-w-2xl leading-relaxed">
            Auto follow-up to leads who received your message but didn&apos;t reply.
            Outside the 24-hour customer-service window, only Meta-approved
            <strong> UTILITY</strong> templates can deliver — pick one below.
          </p>
        </header>

        <div className="flex-1 overflow-y-auto p-5 md:p-10">
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} height={88} className="rounded-lg" />
              ))}
            </div>
          ) : rules.length === 0 ? (
            <div className="bg-surface border border-line rounded-lg py-16 px-8 text-center">
              <p className="text-[14px] text-ink">No nudge rules yet.</p>
              <p className="text-[12.5px] text-muted mt-2">
                Click <strong>New nudge rule</strong> above to create your first
                one.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {rules.map((r) => (
                <article
                  key={r.id}
                  className="bg-surface border border-line rounded-lg px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-4 hover:border-line-2 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2.5 mb-1 flex-wrap">
                      <p className="font-display text-[15px] font-semibold text-ink truncate tracking-tight">
                        {r.name}
                      </p>
                      <span
                        className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full"
                        style={{
                          background:
                            r.template_category === "UTILITY"
                              ? "var(--accent-soft)"
                              : "var(--warn-soft)",
                          color:
                            r.template_category === "UTILITY"
                              ? "var(--accent-ink)"
                              : "var(--warn-ink)",
                          border:
                            r.template_category === "UTILITY"
                              ? "1px solid var(--accent)40"
                              : "1px solid var(--warn)40",
                        }}
                      >
                        {r.template_category}
                      </span>
                      <code className="text-[11px] font-mono px-2 py-0.5 rounded bg-surface-2 text-muted">
                        attempt #{r.attempt_number}
                      </code>
                      {!r.enabled && (
                        <span
                          className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full"
                          style={{
                            background: "var(--surface-2)",
                            color: "var(--muted)",
                            border: "1px solid var(--line)",
                          }}
                        >
                          Disabled
                        </span>
                      )}
                    </div>
                    <p className="text-[12px] text-muted">
                      Source{" "}
                      <span className="font-mono text-ink">
                        {r.source_type ?? "any"}
                      </span>
                      {r.lead_type && (
                        <>
                          {" "}
                          · lead{" "}
                          <span className="font-mono text-ink">
                            {r.lead_type}
                          </span>
                        </>
                      )}{" "}
                      · after{" "}
                      <span className="font-mono text-ink">
                        {r.delay_hours}h
                      </span>{" "}
                      · template{" "}
                      <span className="font-mono text-ink">
                        {r.template_name}
                      </span>
                    </p>
                    <p className="text-[11px] text-subtle mt-1">
                      Sent {r.total_sent_count} · Skipped{" "}
                      {r.total_skipped_count} · Failed {r.total_failed_count}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleToggleEnabled(r)}
                      className="text-[11.5px] px-3 py-1.5 rounded-md border border-line text-muted hover:text-ink hover:bg-hover transition-colors"
                    >
                      {r.enabled ? "Disable" : "Enable"}
                    </button>
                    <button
                      onClick={() => startEdit(r)}
                      className="text-[11.5px] px-3 py-1.5 rounded-md border border-line text-ink hover:bg-hover transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(r)}
                      className="text-[11.5px] px-3 py-1.5 rounded-md border transition-colors"
                      style={{
                        borderColor: "var(--danger)40",
                        color: "var(--danger-ink)",
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>

      {drawerOpen && (
        <>
          <div
            className="fixed inset-0 bg-ink/30 z-40"
            onClick={closeDrawer}
          />
          <aside className="fixed inset-y-0 right-0 z-50 w-full max-w-2xl bg-paper border-l border-line overflow-y-auto">
            <div className="px-6 py-5 border-b border-line flex items-center justify-between sticky top-0 bg-paper z-10">
              <h2 className="font-display text-[19px] tracking-tight text-ink">
                {creating ? "New nudge rule" : `Edit · ${editing?.name}`}
              </h2>
              <button
                onClick={closeDrawer}
                className="text-muted hover:text-ink"
                aria-label="Close"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="p-6 space-y-6">
              {error && (
                <div
                  className="px-4 py-3 rounded-md text-[12.5px]"
                  style={{
                    background: "var(--danger-soft)",
                    color: "var(--danger-ink)",
                    border: "1px solid var(--danger)25",
                  }}
                >
                  {error}
                </div>
              )}

              <Section
                title="Identity"
                desc="Internal label shown in this list."
              >
                <Field label="Rule name">
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, name: e.target.value }))
                    }
                    placeholder="Cold campaign lead · 24h follow-up"
                    className="input"
                  />
                </Field>
                <Toggle
                  label="Enabled"
                  checked={form.enabled}
                  onChange={(v) =>
                    setForm((p) => ({ ...p, enabled: v }))
                  }
                />
              </Section>

              <Section
                title="Targeting"
                desc="Which leads this rule applies to. Leave fields blank to match any."
              >
                <Field label="Source type">
                  <select
                    value={form.source_type}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        source_type: e.target.value as
                          | NudgeSourceType
                          | "any",
                      }))
                    }
                    className="input"
                  >
                    <option value="any">Any source</option>
                    <option value="campaign">Campaign (broadcast reply)</option>
                    <option value="iq_setter">IQ Setter (incoming lead)</option>
                    <option value="direct">Direct (unsolicited)</option>
                    <option value="website">Website button</option>
                  </select>
                </Field>

                {form.source_type === "campaign" && (
                  <Field
                    label="Specific campaign (optional)"
                    hint="Leave blank to apply to every campaign reply."
                  >
                    <select
                      value={form.source_campaign_id}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          source_campaign_id: e.target.value,
                        }))
                      }
                      className="input"
                    >
                      <option value="">— Any campaign —</option>
                      {campaigns.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}

                {form.source_type === "iq_setter" && (
                  <Field
                    label="Lead type (optional)"
                    hint="Leave blank to match all incoming IQ Setter leads."
                  >
                    <select
                      value={form.lead_type}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, lead_type: e.target.value }))
                      }
                      className="input"
                    >
                      <option value="">— Any lead type —</option>
                      {leadTypes.map((lt) => (
                        <option key={lt.id} value={lt.lead_type}>
                          {lt.display_name} ({lt.lead_type})
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
              </Section>

              <Section
                title="Timing"
                desc="When and how often to nudge each silent lead."
              >
                <div className="grid grid-cols-2 gap-3">
                  <Field
                    label="Delay (hours)"
                    hint="Hours of silence after our last outbound before this rule fires."
                  >
                    <input
                      type="number"
                      min={0.5}
                      step={0.5}
                      value={form.delay_hours}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          delay_hours: Number(e.target.value),
                        }))
                      }
                      className="input"
                    />
                  </Field>
                  <Field
                    label="Attempt number"
                    hint="1 = first nudge, 2 = second, etc."
                  >
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={form.attempt_number}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          attempt_number: Number(e.target.value),
                        }))
                      }
                      className="input"
                    />
                  </Field>
                  <Field
                    label="Min gap (hours)"
                    hint="Min hours between this and previous nudge."
                  >
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={form.min_gap_hours}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          min_gap_hours: Number(e.target.value),
                        }))
                      }
                      className="input"
                    />
                  </Field>
                  <Field
                    label="Max attempts"
                    hint="Hard stop per lead across all rules."
                  >
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={form.max_attempts}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          max_attempts: Number(e.target.value),
                        }))
                      }
                      className="input"
                    />
                  </Field>
                </div>
                {showAggressiveWarning && (
                  <p
                    className="text-[11.5px] px-3 py-2 rounded-md"
                    style={{
                      background: "var(--warn-soft)",
                      color: "var(--warn-ink)",
                      border: "1px solid var(--warn)25",
                    }}
                  >
                    {form.delay_hours < 4 &&
                      "Delay under 4h may feel pushy. "}
                    {form.max_attempts > 2 &&
                      "More than 2 attempts risks quality-rating downgrade by Meta."}
                  </p>
                )}
              </Section>

              <Section
                title="Template"
                desc="Meta-approved template sent when the 24h window is closed."
              >
                <Field label="Template">
                  {loadingTemplates ? (
                    <p className="text-[12.5px] text-muted py-2">
                      Loading approved templates…
                    </p>
                  ) : templates.length === 0 ? (
                    <p className="text-[12.5px] text-muted py-2">
                      No approved templates found. Approve a template in Meta
                      first.
                    </p>
                  ) : (
                    <select
                      value={form.template_name}
                      onChange={(e) => pickTemplate(e.target.value)}
                      className="input font-mono"
                    >
                      <option value="">— Select template —</option>
                      {templates.map((t) => (
                        <option key={t.id} value={t.name}>
                          {t.name} ({t.language}) — {t.category}
                        </option>
                      ))}
                    </select>
                  )}
                </Field>

                {showMarketingWarning && (
                  <p
                    className="text-[11.5px] px-3 py-2 rounded-md"
                    style={{
                      background: "var(--danger-soft)",
                      color: "var(--danger-ink)",
                      border: "1px solid var(--danger)25",
                    }}
                  >
                    Meta caps MARKETING templates per user per rolling window —
                    deliveries may silently drop. Use UTILITY for nudges
                    whenever possible.
                  </p>
                )}

                {selectedTemplate && selectedHeaderFmt && (
                  <Field
                    label={
                      selectedHeaderFmt === "IMAGE"
                        ? "Header image"
                        : selectedHeaderFmt === "VIDEO"
                        ? "Header video"
                        : "Header PDF"
                    }
                    hint={`Template requires a ${selectedHeaderFmt} header.`}
                  >
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => headerInputRef.current?.click()}
                        className="px-3 py-2 rounded-md border border-line text-[12px] text-muted hover:text-ink hover:bg-hover whitespace-nowrap"
                      >
                        {headerUploading
                          ? "Uploading…"
                          : form.template_header_url
                          ? "Replace"
                          : "Upload"}
                      </button>
                      {form.template_header_url && (
                        <a
                          href={form.template_header_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[12px] text-muted hover:text-ink truncate max-w-xs"
                        >
                          {form.template_header_filename ||
                            form.template_header_url.split("/").pop()}
                        </a>
                      )}
                      {form.template_header_url && (
                        <button
                          type="button"
                          onClick={() =>
                            setForm((p) => ({
                              ...p,
                              template_header_url: "",
                              template_header_filename: "",
                            }))
                          }
                          className="text-[12px] text-muted hover:text-danger"
                        >
                          Remove
                        </button>
                      )}
                      <input
                        ref={headerInputRef}
                        type="file"
                        accept={
                          selectedHeaderFmt === "IMAGE"
                            ? "image/*"
                            : selectedHeaderFmt === "VIDEO"
                            ? "video/*"
                            : "application/pdf,.pdf"
                        }
                        className="hidden"
                        onChange={handleHeaderUpload}
                      />
                    </div>
                  </Field>
                )}

                {selectedTemplate && placeholderNums.length > 0 && (
                  <Field
                    label="Body parameters"
                    hint="Maps to {{1}}, {{2}}, … in the template body."
                  >
                    <div className="space-y-2">
                      {placeholderNums.map((num, idx) => {
                        const spec: NudgeBodyParamSpec =
                          form.template_body_params[idx] ?? {
                            type: "literal",
                            value: "",
                          };
                        return (
                          <div
                            key={num}
                            className="flex items-center gap-2 bg-surface-2 border border-line rounded-md px-2 py-2"
                          >
                            <span className="text-[10.5px] text-subtle font-mono w-10 uppercase tracking-wider">
                              {`{{${num}}}`}
                            </span>
                            <select
                              value={spec.type}
                              onChange={(e) => {
                                const t = e.target
                                  .value as NudgeBodyParamSpec["type"];
                                if (t === "literal")
                                  updateParam(idx, {
                                    type: "literal",
                                    value: "",
                                  });
                                else updateParam(idx, { type: t });
                              }}
                              className="bg-paper border border-line rounded px-2 py-1 text-[12px] text-ink"
                            >
                              <option value="name">Lead name</option>
                              <option value="body_text">Template body</option>
                              <option value="literal">Literal</option>
                            </select>
                            {spec.type === "literal" && (
                              <input
                                type="text"
                                value={spec.value}
                                onChange={(e) =>
                                  updateParam(idx, {
                                    type: "literal",
                                    value: e.target.value,
                                  })
                                }
                                placeholder="Static value"
                                className="flex-1 bg-paper border border-line rounded px-2 py-1 text-[12px] text-ink"
                              />
                            )}
                          </div>
                        );
                      })}
                      {form.template_body_params.length >
                        placeholderNums.length && (
                        <>
                          {form.template_body_params
                            .slice(placeholderNums.length)
                            .map((spec, i) => {
                              const idx = placeholderNums.length + i;
                              return (
                                <div
                                  key={`extra-${idx}`}
                                  className="flex items-center gap-2 bg-surface-2 border border-line rounded-md px-2 py-2"
                                >
                                  <span className="text-[10.5px] text-subtle font-mono w-10 uppercase tracking-wider">
                                    {`{{${idx + 1}}}`}
                                  </span>
                                  <select
                                    value={spec.type}
                                    onChange={(e) => {
                                      const t = e.target
                                        .value as NudgeBodyParamSpec["type"];
                                      if (t === "literal")
                                        updateParam(idx, {
                                          type: "literal",
                                          value: "",
                                        });
                                      else updateParam(idx, { type: t });
                                    }}
                                    className="bg-paper border border-line rounded px-2 py-1 text-[12px] text-ink"
                                  >
                                    <option value="name">Lead name</option>
                                    <option value="body_text">
                                      Template body
                                    </option>
                                    <option value="literal">Literal</option>
                                  </select>
                                  {spec.type === "literal" && (
                                    <input
                                      type="text"
                                      value={spec.value}
                                      onChange={(e) =>
                                        updateParam(idx, {
                                          type: "literal",
                                          value: e.target.value,
                                        })
                                      }
                                      placeholder="Static value"
                                      className="flex-1 bg-paper border border-line rounded px-2 py-1 text-[12px] text-ink"
                                    />
                                  )}
                                  <button
                                    onClick={() => removeParam(idx)}
                                    className="text-muted hover:text-ink px-1"
                                    aria-label="Remove"
                                  >
                                    ×
                                  </button>
                                </div>
                              );
                            })}
                        </>
                      )}
                      <button
                        onClick={addParam}
                        className="text-[12px] text-muted hover:text-ink"
                      >
                        + Add parameter
                      </button>
                    </div>
                  </Field>
                )}

                {selectedTemplate && (
                  <Field label="Template body (preview)">
                    <textarea
                      value={form.template_body_text}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          template_body_text: e.target.value,
                        }))
                      }
                      rows={3}
                      className="input resize-none font-mono text-[12px]"
                    />
                  </Field>
                )}
              </Section>

              <Section
                title="24h-window fallback"
                desc="If the lead has messaged us within 24h, we can use free-form text instead of a template."
              >
                <Toggle
                  label="Use free-form text inside the 24h window"
                  checked={form.respect_24h_window}
                  onChange={(v) =>
                    setForm((p) => ({ ...p, respect_24h_window: v }))
                  }
                />
                {form.respect_24h_window && (
                  <Field
                    label="Free-form message"
                    hint="Used only if window is open. {{name}} is replaced with the lead's name."
                  >
                    <textarea
                      value={form.free_form_fallback}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          free_form_fallback: e.target.value,
                        }))
                      }
                      rows={3}
                      placeholder="Hey {{name}}, just checking if you got a chance to look at the brochure?"
                      className="input resize-none leading-relaxed"
                    />
                  </Field>
                )}
              </Section>
            </div>

            <div className="sticky bottom-0 bg-paper border-t border-line px-6 py-4 flex items-center justify-end gap-2">
              <button
                onClick={closeDrawer}
                className="px-4 py-2 rounded-md text-[13px] text-muted hover:text-ink"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={
                  saving ||
                  !form.name ||
                  !form.template_name ||
                  !form.delay_hours
                }
                className="px-4 py-2 rounded-md text-[13px] font-medium text-white disabled:opacity-40"
                style={{
                  background:
                    "linear-gradient(135deg, #14A871 0%, #0A7350 60%, #064D33 100%)",
                }}
              >
                {saving ? "Saving…" : creating ? "Create" : "Save changes"}
              </button>
            </div>
          </aside>
        </>
      )}

      <style jsx>{`
        :global(.input) {
          width: 100%;
          background: var(--surface-2);
          border: 1px solid var(--line);
          border-radius: 6px;
          padding: 10px 12px;
          font-size: 13.5px;
          color: var(--ink);
          outline: none;
          transition: border-color 120ms ease, box-shadow 120ms ease;
        }
        :global(.input:focus) {
          border-color: var(--accent);
          box-shadow: 0 0 0 3px var(--accent-soft);
        }
        :global(.input::placeholder) {
          color: var(--faint);
        }
      `}</style>
    </div>
  );
}

function Section({
  title,
  desc,
  children,
}: {
  title: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="font-display text-[15px] tracking-tight text-ink">
          {title}
        </h3>
        {desc && <p className="text-[12px] text-muted mt-0.5">{desc}</p>}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-[11.5px] text-muted font-medium uppercase tracking-wider mb-1.5">
        {label}
      </span>
      {children}
      {hint && <p className="text-[11px] text-subtle mt-1">{hint}</p>}
    </label>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer text-[13px] text-ink select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="w-4 h-4 rounded border-line"
      />
      {label}
    </label>
  );
}
