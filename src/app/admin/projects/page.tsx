"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import SidebarNav, { MobileNavToggle } from "@/components/ui/SidebarNav";
import { Orbit } from "@/components/ui/Loaders";

interface ProjectRow {
  id: string;
  slug: string;
  name: string;
  enabled: boolean;
  sort_order: number;
  aliases: string[];
  short_description: string | null;
  media_count: number;
}

export default function AdminProjectsPage() {
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/projects");
    if (res.ok) setProjects(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    const res = await fetch("/api/admin/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName, slug: newSlug || undefined }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "Failed");
      setCreating(false);
      return;
    }
    setNewName("");
    setNewSlug("");
    setShowCreate(false);
    setCreating(false);
    load();
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete "${name}" and all its media?`)) return;
    const res = await fetch(`/api/admin/projects/${id}`, { method: "DELETE" });
    if (res.ok) load();
  }

  return (
    <div className="flex">
      <SidebarNav active="projects" open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="flex-1 p-6">
        <MobileNavToggle onClick={() => setSidebarOpen(true)} />
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold">Projects</h1>
          <button
            onClick={() => setShowCreate(true)}
            className="px-3 py-2 bg-blue-600 text-white rounded"
          >
            New Project
          </button>
        </div>

        {showCreate && (
          <form
            onSubmit={handleCreate}
            className="mb-6 p-4 border rounded bg-gray-50 space-y-3"
          >
            <input
              required
              className="w-full px-2 py-1 border rounded"
              placeholder="Name (e.g. DLF Privana)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <input
              className="w-full px-2 py-1 border rounded"
              placeholder="Slug (auto if blank)"
              value={newSlug}
              onChange={(e) => setNewSlug(e.target.value)}
            />
            {error && <p className="text-red-600 text-sm">{error}</p>}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={creating}
                className="px-3 py-1 bg-blue-600 text-white rounded"
              >
                Create
              </button>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="px-3 py-1 border rounded"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {loading ? (
          <Orbit />
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b">
                <th className="text-left p-2">Name</th>
                <th className="text-left p-2">Slug</th>
                <th className="text-left p-2">Aliases</th>
                <th className="text-left p-2">Media</th>
                <th className="text-left p-2">Enabled</th>
                <th className="text-right p-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.id} className="border-b">
                  <td className="p-2">{p.name}</td>
                  <td className="p-2 font-mono text-sm">{p.slug}</td>
                  <td className="p-2 text-sm">{p.aliases.join(", ")}</td>
                  <td className="p-2">{p.media_count}</td>
                  <td className="p-2">{p.enabled ? "Yes" : "No"}</td>
                  <td className="p-2 text-right">
                    <Link
                      href={`/admin/projects/${p.id}`}
                      className="text-blue-600 mr-3"
                    >
                      Edit
                    </Link>
                    <button
                      onClick={() => handleDelete(p.id, p.name)}
                      className="text-red-600"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </main>
    </div>
  );
}
