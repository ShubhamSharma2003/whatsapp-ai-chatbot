"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import type { AppUser, Feature } from "@/lib/types";

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

  // New user form
  const [showForm, setShowForm] = useState(false);
  const [formEmail, setFormEmail] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formFeatures, setFormFeatures] = useState<Feature[]>([]);
  const [formPhones, setFormPhones] = useState<string[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSaving, setFormSaving] = useState(false);

  // Edit user
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

    const res = await fetch(`/api/admin/users/${userId}`, {
      method: "DELETE",
    });

    if (res.ok) {
      setUsers((prev) => prev.filter((u) => u.id !== userId));
    }
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
      <div className="flex h-screen items-center justify-center" style={{ background: "#0b141a" }}>
        <svg className="animate-spin" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#00a884" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
      </div>
    );
  }

  return (
    <div className="flex h-screen" style={{ background: "#111b21" }}>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <div className={`${sidebarOpen ? "translate-x-0" : "-translate-x-full"} md:translate-x-0 fixed md:static inset-y-0 left-0 z-50 w-[260px] flex flex-col border-r transition-transform duration-200`} style={{ background: "#111b21", borderColor: "#313d45" }}>
        <div className="h-[60px] px-4 flex items-center gap-3" style={{ background: "#202c33" }}>
          <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "#00a884" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <span className="text-[15px] font-medium" style={{ color: "#e9edef" }}>WhatsApp AI</span>
        </div>
        <nav className="flex flex-col gap-0.5 py-2 flex-1">
          {[
            { href: "/", icon: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />, label: "Conversations" },
            { href: "/campaigns", icon: <><path d="M22 2L11 13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></>, label: "Campaigns" },
            { href: "/settings", icon: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></>, label: "Settings" },
          ].map(({ href, icon, label }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 px-5 py-3 text-[14px] transition-colors"
              style={{ color: "#8696a0" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#202c33")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">{icon}</svg>
              {label}
            </Link>
          ))}
          <div className="flex items-center gap-3 px-5 py-3 text-[14px]" style={{ color: "#e9edef", background: "#2a3942" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            User Management
          </div>
        </nav>
        <div className="px-3 py-3 border-t" style={{ borderColor: "#313d45" }}>
          <button
            onClick={async () => {
              const { createSupabaseBrowserClient } = await import("@/lib/supabase-browser");
              const sb = createSupabaseBrowserClient();
              await sb.auth.signOut();
              window.location.href = "/login";
            }}
            className="w-full flex items-center gap-3 px-3 py-2 rounded text-[13px] transition-colors"
            style={{ color: "#8696a0" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#202c33")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Sign out
          </button>
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <div className="h-[60px] px-4 md:px-6 flex items-center justify-between gap-3 flex-shrink-0" style={{ background: "#202c33" }}>
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(true)} className="md:hidden w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/5 transition-colors">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#aebac1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
            <div>
              <h2 className="text-[16px] font-normal" style={{ color: "#e9edef" }}>User Management</h2>
              <p className="text-[12px] hidden sm:block" style={{ color: "#8696a0" }}>Create and manage user accounts & permissions</p>
            </div>
          </div>
          <button
            onClick={() => { setShowForm(true); setFormError(null); }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-medium transition-all"
            style={{ background: "#00a884", color: "#111b21" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#06cf9c")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "#00a884")}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add User
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4 md:p-6">
          {/* Create User Modal */}
          {showForm && (
            <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
              <div className="w-full max-w-lg rounded-2xl p-6" style={{ background: "#1f2c34", border: "1px solid #313d45" }}>
                <h3 className="text-[16px] font-medium mb-4" style={{ color: "#e9edef" }}>Create New User</h3>
                <form onSubmit={handleCreate} className="space-y-4">
                  <div>
                    <label className="block text-[12px] font-medium mb-1.5" style={{ color: "#8696a0" }}>EMAIL</label>
                    <input
                      type="email"
                      required
                      value={formEmail}
                      onChange={(e) => setFormEmail(e.target.value)}
                      placeholder="user@example.com"
                      className="w-full rounded-lg px-3 py-2 text-[14px] outline-none"
                      style={{ background: "#2a3942", color: "#e9edef", border: "1px solid #313d45" }}
                    />
                  </div>
                  <div>
                    <label className="block text-[12px] font-medium mb-1.5" style={{ color: "#8696a0" }}>PASSWORD</label>
                    <input
                      type="text"
                      required
                      value={formPassword}
                      onChange={(e) => setFormPassword(e.target.value)}
                      placeholder="Set a password"
                      className="w-full rounded-lg px-3 py-2 text-[14px] outline-none"
                      style={{ background: "#2a3942", color: "#e9edef", border: "1px solid #313d45" }}
                    />
                  </div>
                  <div>
                    <label className="block text-[12px] font-medium mb-1.5" style={{ color: "#8696a0" }}>FEATURES ACCESS</label>
                    <div className="flex flex-wrap gap-2">
                      {ALL_FEATURES.map(({ value, label }) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => toggleFeature(formFeatures, setFormFeatures, value)}
                          className="px-3 py-1.5 rounded-lg text-[13px] transition-all"
                          style={{
                            background: formFeatures.includes(value) ? "#00a884" : "#2a3942",
                            color: formFeatures.includes(value) ? "#111b21" : "#8696a0",
                            border: `1px solid ${formFeatures.includes(value) ? "#00a884" : "#313d45"}`,
                          }}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-[12px] font-medium mb-1.5" style={{ color: "#8696a0" }}>CHAT ACCESS (select phone numbers this user can see)</label>
                    <div className="max-h-[200px] overflow-auto rounded-lg p-2" style={{ background: "#2a3942", border: "1px solid #313d45" }}>
                      {phones.length === 0 ? (
                        <p className="text-[13px] px-2 py-1" style={{ color: "#8696a0" }}>No conversations yet</p>
                      ) : (
                        phones.map(({ phone, name }) => (
                          <label key={phone} className="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-white/5 transition-colors">
                            <input
                              type="checkbox"
                              checked={formPhones.includes(phone)}
                              onChange={() => togglePhone(formPhones, setFormPhones, phone)}
                              className="accent-[#00a884]"
                            />
                            <span className="text-[13px]" style={{ color: "#e9edef" }}>{name || phone}</span>
                            {name && <span className="text-[11px]" style={{ color: "#8696a0" }}>{phone}</span>}
                          </label>
                        ))
                      )}
                    </div>
                  </div>
                  {formError && (
                    <div className="rounded-lg px-3 py-2" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)" }}>
                      <p className="text-[13px]" style={{ color: "#f87171" }}>{formError}</p>
                    </div>
                  )}
                  <div className="flex gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowForm(false)}
                      className="flex-1 px-4 py-2 rounded-lg text-[13px] font-medium transition-all"
                      style={{ background: "#2a3942", color: "#8696a0", border: "1px solid #313d45" }}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={formSaving}
                      className="flex-1 px-4 py-2 rounded-lg text-[13px] font-medium transition-all disabled:opacity-50"
                      style={{ background: "#00a884", color: "#111b21" }}
                    >
                      {formSaving ? "Creating..." : "Create User"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Users List */}
          <div className="space-y-3">
            {users.map((user) => (
              <div key={user.id} className="rounded-xl p-4" style={{ background: "#1f2c34", border: "1px solid #313d45" }}>
                {editingId === user.id ? (
                  // Edit mode
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-[14px] font-medium" style={{ color: "#e9edef" }}>{user.email}</p>
                        <p className="text-[12px]" style={{ color: "#8696a0" }}>
                          {user.role === "superadmin" ? "Super Admin" : "User"}
                        </p>
                      </div>
                    </div>
                    <div>
                      <label className="block text-[12px] font-medium mb-1.5" style={{ color: "#8696a0" }}>NEW PASSWORD (leave empty to keep current)</label>
                      <input
                        type="text"
                        value={editPassword}
                        onChange={(e) => setEditPassword(e.target.value)}
                        placeholder="New password (optional)"
                        className="w-full rounded-lg px-3 py-2 text-[14px] outline-none"
                        style={{ background: "#2a3942", color: "#e9edef", border: "1px solid #313d45" }}
                      />
                    </div>
                    <div>
                      <label className="block text-[12px] font-medium mb-1.5" style={{ color: "#8696a0" }}>FEATURES ACCESS</label>
                      <div className="flex flex-wrap gap-2">
                        {ALL_FEATURES.map(({ value, label }) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() => toggleFeature(editFeatures, setEditFeatures, value)}
                            className="px-3 py-1.5 rounded-lg text-[13px] transition-all"
                            style={{
                              background: editFeatures.includes(value) ? "#00a884" : "#2a3942",
                              color: editFeatures.includes(value) ? "#111b21" : "#8696a0",
                              border: `1px solid ${editFeatures.includes(value) ? "#00a884" : "#313d45"}`,
                            }}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="block text-[12px] font-medium mb-1.5" style={{ color: "#8696a0" }}>CHAT ACCESS</label>
                      <div className="max-h-[200px] overflow-auto rounded-lg p-2" style={{ background: "#2a3942", border: "1px solid #313d45" }}>
                        {phones.length === 0 ? (
                          <p className="text-[13px] px-2 py-1" style={{ color: "#8696a0" }}>No conversations yet</p>
                        ) : (
                          phones.map(({ phone, name }) => (
                            <label key={phone} className="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-white/5 transition-colors">
                              <input
                                type="checkbox"
                                checked={editPhones.includes(phone)}
                                onChange={() => togglePhone(editPhones, setEditPhones, phone)}
                                className="accent-[#00a884]"
                              />
                              <span className="text-[13px]" style={{ color: "#e9edef" }}>{name || phone}</span>
                              {name && <span className="text-[11px]" style={{ color: "#8696a0" }}>{phone}</span>}
                            </label>
                          ))
                        )}
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <button
                        onClick={() => setEditingId(null)}
                        className="px-4 py-2 rounded-lg text-[13px] font-medium transition-all"
                        style={{ background: "#2a3942", color: "#8696a0", border: "1px solid #313d45" }}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleUpdate(user.id)}
                        disabled={editSaving}
                        className="px-4 py-2 rounded-lg text-[13px] font-medium transition-all disabled:opacity-50"
                        style={{ background: "#00a884", color: "#111b21" }}
                      >
                        {editSaving ? "Saving..." : "Save Changes"}
                      </button>
                    </div>
                  </div>
                ) : (
                  // View mode
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-[14px] font-medium" style={{ color: "#e9edef" }}>{user.email}</p>
                        {user.role === "superadmin" && (
                          <span className="px-2 py-0.5 rounded text-[11px] font-medium" style={{ background: "#00a884", color: "#111b21" }}>
                            Super Admin
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {user.allowed_features.map((f) => (
                          <span key={f} className="px-2 py-0.5 rounded text-[11px]" style={{ background: "#2a3942", color: "#8696a0" }}>
                            {f}
                          </span>
                        ))}
                      </div>
                      {user.allowed_phones.length > 0 && (
                        <p className="text-[12px] mt-1.5" style={{ color: "#8696a0" }}>
                          {user.allowed_phones.length} chat{user.allowed_phones.length !== 1 ? "s" : ""} assigned
                        </p>
                      )}
                      {user.role !== "superadmin" && user.allowed_phones.length === 0 && (
                        <p className="text-[12px] mt-1.5" style={{ color: "#667781" }}>No chats assigned</p>
                      )}
                    </div>
                    {user.role !== "superadmin" && (
                      <div className="flex gap-2 flex-shrink-0">
                        <button
                          onClick={() => startEdit(user)}
                          className="px-3 py-1.5 rounded-lg text-[12px] transition-all"
                          style={{ background: "#2a3942", color: "#8696a0", border: "1px solid #313d45" }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "#313d45")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "#2a3942")}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(user.id)}
                          className="px-3 py-1.5 rounded-lg text-[12px] transition-all"
                          style={{ background: "rgba(239,68,68,0.1)", color: "#f87171", border: "1px solid rgba(239,68,68,0.2)" }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(239,68,68,0.2)")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(239,68,68,0.1)")}
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
