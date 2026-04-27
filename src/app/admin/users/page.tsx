"use client";

import { useEffect, useState, useCallback } from "react";
import type { AppUser, Feature } from "@/lib/types";
import SidebarNav, { MobileNavToggle } from "@/components/ui/SidebarNav";
import { Orbit } from "@/components/ui/Loaders";
import { Avatar as GradAvatar } from "@/components/ui/Avatar";

const ALL_FEATURES: { value: Feature; label: string }[] = [
  { value: "dashboard", label: "Conversations" },
  { value: "campaigns", label: "Campaigns" },
  { value: "settings", label: "Settings" },
];

type PhoneOption = { phone: string; name: string | null };

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [phones, setPhones] = useState<PhoneOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [formEmail, setFormEmail] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formFeatures, setFormFeatures] = useState<Feature[]>([]);
  const [formPhones, setFormPhones] = useState<string[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSaving, setFormSaving] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFeatures, setEditFeatures] = useState<Feature[]>([]);
  const [editPhones, setEditPhones] = useState<string[]>([]);
  const [editPassword, setEditPassword] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const fetchData = useCallback(async () => {
    const [usersRes, phonesRes] = await Promise.all([
      fetch("/api/admin/users"),
      fetch("/api/admin/phones"),
    ]);
    const usersData = await usersRes.json();
    const phonesData = await phonesRes.json();
    setUsers(Array.isArray(usersData) ? usersData : []);
    setPhones(Array.isArray(phonesData) ? phonesData : []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setFormSaving(true);

    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: formEmail,
        password: formPassword,
        allowed_features: formFeatures,
        allowed_phones: formPhones,
      }),
    });

    const data = await res.json();
    setFormSaving(false);

    if (!res.ok) {
      setFormError(data.error || "Failed to create user");
      return;
    }

    setUsers((prev) => [...prev, data]);
    setShowForm(false);
    setFormEmail("");
    setFormPassword("");
    setFormFeatures([]);
    setFormPhones([]);
  }

  function startEdit(user: AppUser) {
    setEditingId(user.id);
    setEditFeatures([...user.allowed_features]);
    setEditPhones([...user.allowed_phones]);
    setEditPassword("");
  }

  async function handleUpdate(userId: string) {
    setEditSaving(true);
    const body: Record<string, unknown> = {
      allowed_features: editFeatures,
      allowed_phones: editPhones,
    };
    if (editPassword) body.password = editPassword;

    const res = await fetch(`/api/admin/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const updated = await res.json();
      if (updated.id) {
        setUsers((prev) => prev.map((u) => (u.id === userId ? updated : u)));
      }
    }
    setEditSaving(false);
    setEditingId(null);
  }

  async function handleDelete(userId: string) {
    if (!confirm("Are you sure you want to delete this user?")) return;
    const res = await fetch(`/api/admin/users/${userId}`, { method: "DELETE" });
    if (res.ok) setUsers((prev) => prev.filter((u) => u.id !== userId));
  }

  function toggleFeature(
    features: Feature[],
    setFeatures: (f: Feature[]) => void,
    feature: Feature
  ) {
    setFeatures(
      features.includes(feature)
        ? features.filter((f) => f !== feature)
        : [...features, feature]
    );
  }

  function togglePhone(
    selected: string[],
    setSelected: (p: string[]) => void,
    phone: string
  ) {
    setSelected(
      selected.includes(phone)
        ? selected.filter((p) => p !== phone)
        : [...selected, phone]
    );
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-paper mesh-canvas">
        <div className="flex flex-col items-center gap-4">
          <Orbit size="lg" />
          <p className="eyebrow text-[10px] text-muted">Loading members</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-paper">
      <SidebarNav active="/admin/users" open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="px-5 md:px-10 py-6 border-b border-line bg-surface flex-shrink-0">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <MobileNavToggle onClick={() => setSidebarOpen(true)} />
              <div>
                <p className="eyebrow">Administration</p>
                <h1 className="font-display text-[28px] leading-none tracking-tight text-ink mt-2">
                  Members
                </h1>
                <p className="text-[12.5px] text-muted mt-1.5">
                  Create accounts, scope feature access, assign chat ownership.
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                setShowForm(true);
                setFormError(null);
              }}
              className="btn-accent flex items-center gap-2"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Add member
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-auto p-5 md:p-10">
          <div className="max-w-4xl space-y-3">
            {users.length === 0 ? (
              <div className="bg-surface border border-line rounded-lg py-16 px-8 text-center">
                <p className="text-[14px] text-ink">No members yet.</p>
                <p className="text-[12.5px] text-muted mt-2">Add your first team member above.</p>
              </div>
            ) : (
              users.map((user) => (
                <article
                  key={user.id}
                  className="bg-surface border border-line rounded-lg p-5 transition-colors hover:border-line-2"
                >
                  {editingId === user.id ? (
                    <div className="space-y-5">
                      <div className="flex items-center gap-3 pb-4 border-b border-line">
                        <Avatar email={user.email} />
                        <div>
                          <p className="font-display text-[16px] tracking-tight text-ink">{user.email}</p>
                          <p className="text-[11px] text-subtle uppercase tracking-wider mt-0.5">
                            {user.role === "superadmin" ? "Super admin" : "Member"}
                          </p>
                        </div>
                      </div>

                      <Field label="New password (leave empty to keep current)">
                        <input
                          type="text"
                          value={editPassword}
                          onChange={(e) => setEditPassword(e.target.value)}
                          placeholder="Optional new password"
                          className="w-full bg-surface-2 border border-line rounded-md px-3 py-2.5 text-[14px] text-ink placeholder:text-faint focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft transition-all"
                        />
                      </Field>

                      <Field label="Feature access">
                        <FeatureChips
                          features={editFeatures}
                          onToggle={(f) => toggleFeature(editFeatures, setEditFeatures, f)}
                        />
                      </Field>

                      <Field label="Chat access">
                        <PhoneList
                          phones={phones}
                          selected={editPhones}
                          onToggle={(p) => togglePhone(editPhones, setEditPhones, p)}
                        />
                      </Field>

                      <div className="flex gap-3 pt-2 border-t border-line">
                        <button
                          onClick={() => setEditingId(null)}
                          className="btn-ghost text-[13px]"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleUpdate(user.id)}
                          disabled={editSaving}
                          className="px-4 py-2 rounded-md text-[13px] font-medium text-paper disabled:opacity-50"
                          style={{ background: "var(--ink)" }}
                        >
                          {editSaving ? "Saving…" : "Save changes"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-4 min-w-0 flex-1">
                        <Avatar email={user.email} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2.5 flex-wrap mb-2">
                            <p className="font-display text-[16px] tracking-tight text-ink">{user.email}</p>
                            {user.role === "superadmin" && (
                              <span
                                className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider"
                                style={{
                                  background: "var(--ink)",
                                  color: "var(--paper)",
                                }}
                              >
                                Super admin
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-1.5 mb-2">
                            {user.allowed_features.length === 0 ? (
                              <span className="text-[11.5px] text-subtle italic">No features granted</span>
                            ) : (
                              user.allowed_features.map((f) => (
                                <span key={f} className="chip">
                                  {f}
                                </span>
                              ))
                            )}
                          </div>
                          <p className="text-[12px] text-muted">
                            {user.allowed_phones.length > 0
                              ? `${user.allowed_phones.length} chat${user.allowed_phones.length !== 1 ? "s" : ""} assigned`
                              : user.role !== "superadmin"
                              ? "No chats assigned"
                              : "Full access"}
                          </p>
                        </div>
                      </div>
                      {user.role !== "superadmin" && (
                        <div className="flex gap-2 flex-shrink-0">
                          <button
                            onClick={() => startEdit(user)}
                            className="btn-ghost text-[12px]"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(user.id)}
                            className="px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors"
                            style={{
                              background: "var(--danger-soft)",
                              color: "var(--danger-ink)",
                              border: "1px solid var(--danger)25",
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </article>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Create Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(14, 20, 16, 0.45)" }}>
          <div
            className="w-full max-w-lg rounded-lg bg-surface border border-line p-6 animate-fade-in-up"
            style={{ boxShadow: "var(--shadow-lg)" }}
          >
            <div className="flex items-center justify-between mb-5">
              <div>
                <p className="eyebrow text-[10px]">New member</p>
                <h2 className="font-display text-[22px] tracking-tight text-ink mt-1.5 leading-none">
                  Invite to workspace
                </h2>
              </div>
              <button
                onClick={() => setShowForm(false)}
                className="w-8 h-8 rounded-md hover:bg-hover flex items-center justify-center text-muted hover:text-ink transition-colors"
                aria-label="Close"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-5">
              <Field label="Email">
                <input
                  type="email"
                  required
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  placeholder="user@unisel.com"
                  className="w-full bg-surface-2 border border-line rounded-md px-3 py-2.5 text-[14px] text-ink placeholder:text-faint focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft transition-all"
                />
              </Field>

              <Field label="Password">
                <input
                  type="text"
                  required
                  value={formPassword}
                  onChange={(e) => setFormPassword(e.target.value)}
                  placeholder="Set a strong password"
                  className="w-full bg-surface-2 border border-line rounded-md px-3 py-2.5 text-[14px] text-ink placeholder:text-faint focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft transition-all"
                />
              </Field>

              <Field label="Feature access">
                <FeatureChips
                  features={formFeatures}
                  onToggle={(f) => toggleFeature(formFeatures, setFormFeatures, f)}
                />
              </Field>

              <Field label="Chat access — phone numbers">
                <PhoneList
                  phones={phones}
                  selected={formPhones}
                  onToggle={(p) => togglePhone(formPhones, setFormPhones, p)}
                />
              </Field>

              {formError && (
                <div
                  className="rounded-md px-4 py-3 flex items-start gap-2"
                  style={{
                    background: "var(--danger-soft)",
                    border: "1px solid var(--danger)25",
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 flex-shrink-0">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  <p className="text-[13px]" style={{ color: "var(--danger-ink)" }}>{formError}</p>
                </div>
              )}

              <div className="flex gap-3 pt-2 border-t border-line">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="flex-1 btn-ghost text-[13px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formSaving}
                  className="flex-1 px-4 py-2.5 rounded-md text-[13px] font-medium text-paper disabled:opacity-50"
                  style={{ background: "var(--ink)" }}
                >
                  {formSaving ? "Creating…" : "Create member"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function Avatar({ email }: { email: string }) {
  return <GradAvatar seed={email} initials={email} size={44} />;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="eyebrow text-[10px] block mb-2">{label}</label>
      {children}
    </div>
  );
}

function FeatureChips({
  features,
  onToggle,
}: {
  features: Feature[];
  onToggle: (f: Feature) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {ALL_FEATURES.map(({ value, label }) => {
        const active = features.includes(value);
        return (
          <button
            key={value}
            type="button"
            onClick={() => onToggle(value)}
            className="px-3 py-1.5 rounded-md text-[12.5px] font-medium transition-all"
            style={{
              background: active ? "var(--accent-tint)" : "var(--surface-2)",
              color: active ? "var(--accent-ink)" : "var(--muted)",
              border: `1px solid ${active ? "var(--accent)" : "var(--line)"}`,
            }}
          >
            {active && (
              <span className="inline-block mr-1.5">✓</span>
            )}
            {label}
          </button>
        );
      })}
    </div>
  );
}

function PhoneList({
  phones,
  selected,
  onToggle,
}: {
  phones: PhoneOption[];
  selected: string[];
  onToggle: (p: string) => void;
}) {
  return (
    <div className="max-h-[220px] overflow-auto rounded-md p-2 bg-surface-2 border border-line">
      {phones.length === 0 ? (
        <p className="text-[12.5px] px-2 py-2 text-muted italic">No conversations yet.</p>
      ) : (
        phones.map(({ phone, name }) => (
          <label
            key={phone}
            className="flex items-center gap-2.5 px-2 py-1.5 rounded cursor-pointer hover:bg-hover transition-colors"
          >
            <input
              type="checkbox"
              checked={selected.includes(phone)}
              onChange={() => onToggle(phone)}
            />
            <span className="text-[13px] text-ink">{name || phone}</span>
            {name && (
              <span className="text-[11px] text-subtle font-mono tnum ml-auto">{phone}</span>
            )}
          </label>
        ))
      )}
    </div>
  );
}
