"use client";

import { useEffect, useState, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import SidebarNav, { MobileNavToggle } from "@/components/ui/SidebarNav";
import { Orbit } from "@/components/ui/Loaders";
import type { Project, ProjectMedia, ProjectMediaKind } from "@/lib/types";

const KINDS: ProjectMediaKind[] = [
  "brochure",
  "image",
  "floor_plan",
  "price_list",
  "video",
];

type FullProject = Project & { media: ProjectMedia[] };

export default function AdminProjectEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [data, setData] = useState<FullProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [aliasesText, setAliasesText] = useState("");
  const [uploadKind, setUploadKind] = useState<ProjectMediaKind>("brochure");
  const [uploadCaption, setUploadCaption] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/admin/projects/${id}`);
    if (res.ok) {
      const json: FullProject = await res.json();
      setData(json);
      setAliasesText(json.aliases.join(", "));
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!data) return;
    setSaving(true);
    const payload = {
      name: data.name,
      slug: data.slug,
      aliases: aliasesText
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      short_description: data.short_description,
      details_md: data.details_md,
      enabled: data.enabled,
      sort_order: data.sort_order,
    };
    const res = await fetch(`/api/admin/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    if (res.ok) load();
    else alert("Save failed");
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!uploadFile) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("kind", uploadKind);
    fd.append("file", uploadFile);
    if (uploadCaption) fd.append("caption", uploadCaption);
    const res = await fetch(`/api/admin/projects/${id}/media`, {
      method: "POST",
      body: fd,
    });
    setUploading(false);
    if (res.ok) {
      setUploadFile(null);
      setUploadCaption("");
      load();
    } else {
      const j = await res.json().catch(() => ({}));
      alert(j.error ?? "Upload failed");
    }
  }

  async function handleDeleteMedia(mediaId: string) {
    if (!confirm("Delete this media file?")) return;
    const res = await fetch(
      `/api/admin/projects/${id}/media/${mediaId}`,
      { method: "DELETE" }
    );
    if (res.ok) load();
  }

  if (loading) return <Orbit />;
  if (!data) return <p>Not found.</p>;

  return (
    <div className="flex">
      <SidebarNav active="projects" open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="flex-1 p-6 max-w-3xl">
        <MobileNavToggle onClick={() => setSidebarOpen(true)} />
        <button
          onClick={() => router.push("/admin/projects")}
          className="text-blue-600 mb-4"
        >
          ← Back
        </button>
        <h1 className="text-2xl font-semibold mb-6">Edit Project</h1>

        <form onSubmit={handleSave} className="space-y-4 mb-8">
          <label className="block">
            <span className="block text-sm font-medium">Name</span>
            <input
              required
              className="w-full px-2 py-1 border rounded"
              value={data.name}
              onChange={(e) => setData({ ...data, name: e.target.value })}
            />
          </label>
          <label className="block">
            <span className="block text-sm font-medium">Slug</span>
            <input
              required
              className="w-full px-2 py-1 border rounded font-mono"
              value={data.slug}
              onChange={(e) => setData({ ...data, slug: e.target.value })}
            />
          </label>
          <label className="block">
            <span className="block text-sm font-medium">Aliases (comma-separated)</span>
            <input
              className="w-full px-2 py-1 border rounded"
              value={aliasesText}
              onChange={(e) => setAliasesText(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="block text-sm font-medium">
              Short description (one line — injected into AI prompt)
            </span>
            <textarea
              className="w-full px-2 py-1 border rounded"
              rows={2}
              maxLength={300}
              value={data.short_description ?? ""}
              onChange={(e) =>
                setData({ ...data, short_description: e.target.value })
              }
            />
          </label>
          <label className="block">
            <span className="block text-sm font-medium">Details (long form, not in prompt)</span>
            <textarea
              className="w-full px-2 py-1 border rounded"
              rows={6}
              value={data.details_md ?? ""}
              onChange={(e) => setData({ ...data, details_md: e.target.value })}
            />
          </label>
          <div className="flex gap-4 items-center">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={data.enabled}
                onChange={(e) =>
                  setData({ ...data, enabled: e.target.checked })
                }
              />
              Enabled
            </label>
            <label className="flex items-center gap-2">
              Sort order
              <input
                type="number"
                className="w-24 px-2 py-1 border rounded"
                value={data.sort_order}
                onChange={(e) =>
                  setData({ ...data, sort_order: Number(e.target.value) })
                }
              />
            </label>
          </div>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white rounded"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </form>

        <h2 className="text-lg font-semibold mb-3">Media</h2>
        <form onSubmit={handleUpload} className="mb-4 p-3 border rounded space-y-2 bg-gray-50">
          <div className="flex gap-2">
            <select
              value={uploadKind}
              onChange={(e) => setUploadKind(e.target.value as ProjectMediaKind)}
              className="px-2 py-1 border rounded"
            >
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
            <input
              type="file"
              onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <input
            className="w-full px-2 py-1 border rounded"
            placeholder="Caption (optional)"
            value={uploadCaption}
            onChange={(e) => setUploadCaption(e.target.value)}
          />
          <button
            type="submit"
            disabled={uploading || !uploadFile}
            className="px-3 py-1 bg-green-600 text-white rounded"
          >
            {uploading ? "Uploading…" : "Upload"}
          </button>
        </form>

        <ul className="space-y-1">
          {data.media.map((m) => (
            <li
              key={m.id}
              className="flex items-center justify-between p-2 border rounded"
            >
              <span className="text-sm">
                <span className="font-mono mr-2">[{m.kind}]</span>
                <a
                  href={m.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 underline"
                >
                  {m.filename ?? m.url}
                </a>
                {m.caption && <span className="ml-2 text-gray-600">— {m.caption}</span>}
              </span>
              <button
                onClick={() => handleDeleteMedia(m.id)}
                className="text-red-600 text-sm"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
