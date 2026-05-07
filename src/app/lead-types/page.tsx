"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import SidebarNav, { MobileNavToggle } from "@/components/ui/SidebarNav";
import { Orbit, Skeleton } from "@/components/ui/Loaders";

type BodyParamSpec =
  | { type: "name" }
  | { type: "body_text" }
  | { type: "literal"; value: string };

type LeadTypeTemplate = {
  id: string;
  lead_type: string;
  display_name: string;
  enabled: boolean;
  is_default: boolean;
  template_name: string;
  template_language: string;
  template_header_image_url: string | null;
  template_body_text: string;
  template_body_params: BodyParamSpec[];
  brochure_url: string | null;
  brochure_filename: string | null;
  brochure_mime: string | null;
  brochure_caption: string | null;
  extra_info_text: string | null;
  system_prompt: string | null;
  created_at: string;
  updated_at: string;
};

const EMPTY_FORM: Omit<LeadTypeTemplate, "id" | "created_at" | "updated_at"> = {
  lead_type: "",
  display_name: "",
  enabled: true,
  is_default: false,
  template_name: "",
  template_language: "en",
  template_header_image_url: "",
  template_body_text: "",
  template_body_params: [{ type: "name" }, { type: "body_text" }],
  brochure_url: "",
  brochure_filename: "",
  brochure_mime: "",
  brochure_caption: "",
  extra_info_text: "",
  system_prompt: "",
};

export default function LeadTypesPage() {
  const [items, setItems] = useState<LeadTypeTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [editing, setEditing] = useState<LeadTypeTemplate | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [headerUploading, setHeaderUploading] = useState(false);
  const [brochureUploading, setBrochureUploading] = useState(false);
  const headerInputRef = useRef<HTMLInputElement>(null);
  const brochureInputRef = useRef<HTMLInputElement>(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/lead-types");
    const data = await res.json();
    if (Array.isArray(data)) setItems(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  function startCreate() {
    setForm(EMPTY_FORM);
    setEditing(null);
    setCreating(true);
    setError(null);
  }

  function startEdit(item: LeadTypeTemplate) {
    setForm({
      lead_type: item.lead_type,
      display_name: item.display_name,
      enabled: item.enabled,
      is_default: item.is_default,
      template_name: item.template_name,
      template_language: item.template_language,
      template_header_image_url: item.template_header_image_url ?? "",
      template_body_text: item.template_body_text,
      template_body_params:
        item.template_body_params && item.template_body_params.length > 0
          ? item.template_body_params
          : [{ type: "name" }, { type: "body_text" }],
      brochure_url: item.brochure_url ?? "",
      brochure_filename: item.brochure_filename ?? "",
      brochure_mime: item.brochure_mime ?? "",
      brochure_caption: item.brochure_caption ?? "",
      extra_info_text: item.extra_info_text ?? "",
      system_prompt: item.system_prompt ?? "",
    });
    setEditing(item);
    setCreating(false);
    setError(null);
  }

  function closeDrawer() {
    setEditing(null);
    setCreating(false);
    setError(null);
  }

  async function handleHeaderUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setHeaderUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/campaigns/upload-image", { method: "POST", body: fd });
    const data = await res.json();
    setHeaderUploading(false);
    if (data.url) setForm((p) => ({ ...p, template_header_image_url: data.url }));
  }

  async function handleBrochureUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBrochureUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/lead-types/upload-brochure", {
      method: "POST",
      body: fd,
    });
    const data = await res.json();
    setBrochureUploading(false);
    if (data.url) {
      setForm((p) => ({
        ...p,
        brochure_url: data.url,
        brochure_filename: data.filename,
        brochure_mime: data.mime,
      }));
    }
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        ...form,
        template_header_image_url: form.template_header_image_url || null,
        brochure_url: form.brochure_url || null,
        brochure_filename: form.brochure_filename || null,
        brochure_mime: form.brochure_mime || null,
        brochure_caption: form.brochure_caption || null,
        extra_info_text: form.extra_info_text || null,
        system_prompt: form.system_prompt || null,
      };
      let res: Response;
      if (creating) {
        res = await fetch("/api/lead-types", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else if (editing) {
        res = await fetch(`/api/lead-types/${encodeURIComponent(editing.lead_type)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Save failed");
        return;
      }
      await fetchItems();
      closeDrawer();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(item: LeadTypeTemplate) {
    if (!confirm(`Delete lead type "${item.lead_type}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/lead-types/${encodeURIComponent(item.lead_type)}`, {
      method: "DELETE",
    });
    if (res.ok) await fetchItems();
  }

  async function handleToggleEnabled(item: LeadTypeTemplate) {
    await fetch(`/api/lead-types/${encodeURIComponent(item.lead_type)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !item.enabled }),
    });
    await fetchItems();
  }

  function updateParamSpec(idx: number, spec: BodyParamSpec) {
    setForm((p) => {
      const next = [...p.template_body_params];
      next[idx] = spec;
      return { ...p, template_body_params: next };
    });
  }

  function addParamSpec() {
    setForm((p) => ({
      ...p,
      template_body_params: [...p.template_body_params, { type: "literal", value: "" }],
    }));
  }

  function removeParamSpec(idx: number) {
    setForm((p) => ({
      ...p,
      template_body_params: p.template_body_params.filter((_, i) => i !== idx),
    }));
  }

  const drawerOpen = creating || editing !== null;

  return (
    <div className="flex h-screen bg-paper">
      <SidebarNav
        active="/lead-types"
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="px-5 md:px-10 py-6 border-b border-line bg-surface flex-shrink-0">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <MobileNavToggle onClick={() => setSidebarOpen(true)} />
              <div className="min-w-0">
                <p className="eyebrow">Lead routing</p>
                <h1 className="font-display text-[28px] leading-none tracking-tight text-ink mt-2">
                  Lead Types
                </h1>
              </div>
            </div>
            <button
              onClick={startCreate}
              className="px-4 py-2.5 rounded-md text-[13px] font-medium text-white"
              style={{
                background: "linear-gradient(135deg, #14A871 0%, #0A7350 60%, #064D33 100%)",
                boxShadow: "0 8px 20px -6px rgba(14, 138, 95, 0.45)",
              }}
            >
              + New lead type
            </button>
          </div>
          <p className="text-[12.5px] text-muted mt-3 max-w-2xl leading-relaxed">
            Configure the welcome flow per lead source: WhatsApp template, brochure file, follow-up
            message, and AI knowledge base. IQ Setter routes incoming leads here by{" "}
            <code className="font-mono px-1 py-0.5 rounded bg-surface-2">lead_type</code>.
          </p>
        </header>

        <div className="flex-1 overflow-y-auto p-5 md:p-10">
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} height={88} className="rounded-lg" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="bg-surface border border-line rounded-lg py-16 px-8 text-center">
              <p className="text-[14px] text-ink">No lead type configs yet.</p>
              <p className="text-[12.5px] text-muted mt-2">
                Click <strong>New lead type</strong> above to create your first one.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((it) => (
                <article
                  key={it.id}
                  className="bg-surface border border-line rounded-lg px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-4 hover:border-line-2 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2.5 mb-1 flex-wrap">
                      <p className="font-display text-[15px] font-semibold text-ink truncate tracking-tight">
                        {it.display_name}
                      </p>
                      <code className="text-[11px] font-mono px-2 py-0.5 rounded bg-surface-2 text-muted">
                        {it.lead_type}
                      </code>
                      {it.is_default && (
                        <span
                          className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full"
                          style={{
                            background: "var(--accent-soft)",
                            color: "var(--accent-ink)",
                            border: "1px solid var(--accent)40",
                          }}
                        >
                          Default
                        </span>
                      )}
                      {!it.enabled && (
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
                      Template{" "}
                      <span className="font-mono text-ink">{it.template_name}</span> ·{" "}
                      {it.brochure_url ? "Brochure attached" : "No brochure"} ·{" "}
                      {it.system_prompt ? "AI knowledge set" : "No AI prompt"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleToggleEnabled(it)}
                      className="text-[11.5px] px-3 py-1.5 rounded-md border border-line text-muted hover:text-ink hover:bg-hover transition-colors"
                    >
                      {it.enabled ? "Disable" : "Enable"}
                    </button>
                    <button
                      onClick={() => startEdit(it)}
                      className="text-[11.5px] px-3 py-1.5 rounded-md border border-line text-ink hover:bg-hover transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(it)}
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

      {/* Drawer */}
      {drawerOpen && (
        <>
          <div
            className="fixed inset-0 bg-ink/30 z-40"
            onClick={closeDrawer}
          />
          <aside className="fixed inset-y-0 right-0 z-50 w-full max-w-2xl bg-paper border-l border-line overflow-y-auto">
            <div className="px-6 py-5 border-b border-line flex items-center justify-between sticky top-0 bg-paper z-10">
              <h2 className="font-display text-[19px] tracking-tight text-ink">
                {creating ? "New lead type" : `Edit · ${editing?.lead_type}`}
              </h2>
              <button
                onClick={closeDrawer}
                className="text-muted hover:text-ink"
                aria-label="Close"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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

              <Section title="Identity" desc="Slug used by IQ Setter payloads.">
                <Field label="Lead type slug">
                  <input
                    type="text"
                    value={form.lead_type}
                    disabled={!creating}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, lead_type: e.target.value.toLowerCase() }))
                    }
                    placeholder="smart_world"
                    className="input font-mono"
                  />
                </Field>
                <Field label="Display name">
                  <input
                    type="text"
                    value={form.display_name}
                    onChange={(e) => setForm((p) => ({ ...p, display_name: e.target.value }))}
                    placeholder="Smart World"
                    className="input"
                  />
                </Field>
                <div className="flex items-center gap-6">
                  <Toggle
                    label="Enabled"
                    checked={form.enabled}
                    onChange={(v) => setForm((p) => ({ ...p, enabled: v }))}
                  />
                  <Toggle
                    label="Default fallback"
                    checked={form.is_default}
                    onChange={(v) => setForm((p) => ({ ...p, is_default: v }))}
                  />
                </div>
              </Section>

              <Section title="Welcome template" desc="Meta-approved template sent first.">
                <Field label="Template name">
                  <input
                    type="text"
                    value={form.template_name}
                    onChange={(e) => setForm((p) => ({ ...p, template_name: e.target.value }))}
                    placeholder="order_tracking_link_bi"
                    className="input font-mono"
                  />
                </Field>
                <Field label="Language">
                  <input
                    type="text"
                    value={form.template_language}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, template_language: e.target.value }))
                    }
                    placeholder="en"
                    className="input font-mono"
                  />
                </Field>
                <Field label="Header image URL">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={form.template_header_image_url ?? ""}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          template_header_image_url: e.target.value,
                        }))
                      }
                      placeholder="https://…"
                      className="input flex-1"
                    />
                    <button
                      onClick={() => headerInputRef.current?.click()}
                      className="px-3 py-2 rounded-md border border-line text-[12px] text-muted hover:text-ink hover:bg-hover whitespace-nowrap"
                    >
                      {headerUploading ? "Uploading…" : "Upload"}
                    </button>
                    <input
                      ref={headerInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleHeaderUpload}
                    />
                  </div>
                </Field>
                <Field label="Body text">
                  <textarea
                    value={form.template_body_text}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, template_body_text: e.target.value }))
                    }
                    rows={4}
                    placeholder="Thanks for your enquiry…"
                    className="input resize-none leading-relaxed"
                  />
                </Field>
                <Field
                  label="Body parameters"
                  hint="Maps to {{1}}, {{2}}, … in the template. Reorder by recreating."
                >
                  <div className="space-y-2">
                    {form.template_body_params.map((spec, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-2 bg-surface-2 border border-line rounded-md px-2 py-2"
                      >
                        <span className="text-[10.5px] text-subtle font-mono w-10 uppercase tracking-wider">
                          {`{{${idx + 1}}}`}
                        </span>
                        <select
                          value={spec.type}
                          onChange={(e) => {
                            const t = e.target.value as BodyParamSpec["type"];
                            if (t === "literal")
                              updateParamSpec(idx, { type: "literal", value: "" });
                            else updateParamSpec(idx, { type: t });
                          }}
                          className="bg-paper border border-line rounded px-2 py-1 text-[12px] text-ink"
                        >
                          <option value="name">Lead name</option>
                          <option value="body_text">Body text</option>
                          <option value="literal">Literal</option>
                        </select>
                        {spec.type === "literal" && (
                          <input
                            type="text"
                            value={spec.value}
                            onChange={(e) =>
                              updateParamSpec(idx, { type: "literal", value: e.target.value })
                            }
                            placeholder="Static value"
                            className="flex-1 bg-paper border border-line rounded px-2 py-1 text-[12px] text-ink"
                          />
                        )}
                        <button
                          onClick={() => removeParamSpec(idx)}
                          className="text-muted hover:text-ink px-1"
                          aria-label="Remove"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={addParamSpec}
                      className="text-[12px] text-muted hover:text-ink"
                    >
                      + Add parameter
                    </button>
                  </div>
                </Field>
              </Section>

              <Section title="Brochure" desc="Sent as the second message after the template.">
                <Field label="Brochure file">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={form.brochure_url ?? ""}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, brochure_url: e.target.value }))
                      }
                      placeholder="https://…/brochure.pdf"
                      className="input flex-1 font-mono text-[12px]"
                    />
                    <button
                      onClick={() => brochureInputRef.current?.click()}
                      className="px-3 py-2 rounded-md border border-line text-[12px] text-muted hover:text-ink hover:bg-hover whitespace-nowrap"
                    >
                      {brochureUploading ? "Uploading…" : "Upload"}
                    </button>
                    <input
                      ref={brochureInputRef}
                      type="file"
                      accept="application/pdf,image/*"
                      className="hidden"
                      onChange={handleBrochureUpload}
                    />
                  </div>
                  {form.brochure_filename && (
                    <p className="text-[11px] text-subtle mt-1.5">
                      {form.brochure_filename} · {form.brochure_mime}
                    </p>
                  )}
                </Field>
                <Field label="Caption (optional)">
                  <input
                    type="text"
                    value={form.brochure_caption ?? ""}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, brochure_caption: e.target.value }))
                    }
                    placeholder="Sharing the project brochure"
                    className="input"
                  />
                </Field>
              </Section>

              <Section title="Extra info" desc="Plain-text follow-up sent after the brochure.">
                <Field label="Message">
                  <textarea
                    value={form.extra_info_text ?? ""}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, extra_info_text: e.target.value }))
                    }
                    rows={4}
                    placeholder="A quick highlight of what makes this project special…"
                    className="input resize-none leading-relaxed"
                  />
                </Field>
              </Section>

              <Section
                title="AI knowledge base"
                desc="System prompt used by the AI when this lead replies. Overrides global settings."
              >
                <textarea
                  value={form.system_prompt ?? ""}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, system_prompt: e.target.value }))
                  }
                  rows={10}
                  placeholder={`You are Pallavi, senior consultant at Unisel Realty.\n\nThis lead asked about Smart World — provide details about its location, configuration, pricing…`}
                  className="input resize-none font-mono text-[12.5px] leading-relaxed"
                />
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
                disabled={saving || !form.lead_type || !form.display_name || !form.template_name}
                className="px-4 py-2 rounded-md text-[13px] font-medium text-white disabled:opacity-40"
                style={{
                  background: "linear-gradient(135deg, #14A871 0%, #0A7350 60%, #064D33 100%)",
                }}
              >
                {saving ? "Saving…" : creating ? "Create" : "Save changes"}
              </button>
            </div>
          </aside>
        </>
      )}

      {/* Inline styles for shared input class */}
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

      {loading && items.length === 0 && (
        <div className="hidden">
          <Orbit size="md" />
        </div>
      )}
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
        <h3 className="font-display text-[15px] tracking-tight text-ink">{title}</h3>
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
