"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { AppUser } from "@/lib/types";

type Item = {
  href: string;
  label: string;
  icon: React.ReactNode;
  feature?: "ai_calling";
  superadminOnly?: boolean;
};

const ITEMS: Item[] = [
  {
    href: "/",
    label: "Conversations",
    icon: (
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    ),
  },
  {
    href: "/campaigns",
    label: "Broadcasts",
    icon: (
      <>
        <path d="M22 2L11 13" />
        <polygon points="22 2 15 22 11 13 2 9 22 2" />
      </>
    ),
  },
  {
    href: "/ai-calling",
    label: "AI Calling",
    feature: "ai_calling",
    icon: (
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.63 3.18 2 2 0 0 1 3.6 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.56a16 16 0 0 0 6.29 6.29l.97-.97a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
    ),
  },
  {
    href: "/settings",
    label: "Settings",
    icon: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </>
    ),
  },
  {
    href: "/admin/users",
    label: "Members",
    superadminOnly: true,
    icon: (
      <>
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </>
    ),
  },
];

export function Brand({ size = 42 }: { size?: number }) {
  return (
    <div className="flex items-center gap-3">
      <div
        className="rounded-xl flex items-center justify-center flex-shrink-0 relative overflow-hidden"
        style={{
          width: size,
          height: size,
          background: "linear-gradient(135deg, #14A871 0%, #0A7350 60%, #064D33 100%)",
          boxShadow: "0 8px 20px -6px rgba(14, 138, 95, 0.45), inset 0 0 0 1px rgba(255,255,255,0.12)",
        }}
      >
        <span
          className="absolute -top-3 -right-3 w-8 h-8 rounded-full"
          style={{ background: "rgba(255,255,255,0.18)", filter: "blur(8px)" }}
        />
        <svg
          width={Math.round(size * 0.5)}
          height={Math.round(size * 0.5)}
          viewBox="0 0 24 24"
          fill="none"
          stroke="white"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="relative"
        >
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </div>
      <div className="flex flex-col leading-none">
        <span className="font-display text-[19px] font-semibold tracking-tight text-ink">
          Unisel Realty
        </span>
        <span className="text-[10px] uppercase tracking-[0.18em] text-subtle mt-1.5">
          WhatsApp Workspace
        </span>
      </div>
    </div>
  );
}

export default function SidebarNav({
  active,
  open,
  onClose,
}: {
  active: string;
  open?: boolean;
  onClose?: () => void;
}) {
  const router = useRouter();
  const [user, setUser] = useState<AppUser | null>(null);

  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then(setUser)
      .catch(() => {});
  }, []);

  const visibleItems = ITEMS.filter((it) => {
    if (it.superadminOnly && user?.role !== "superadmin") return false;
    if (it.feature === "ai_calling") {
      return (
        user?.role === "superadmin" ||
        user?.allowed_features?.includes("ai_calling")
      );
    }
    return true;
  });

  return (
    <>
      {open !== undefined && open && (
        <div
          className="fixed inset-0 bg-ink/30 z-40 md:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`${
          open === undefined
            ? ""
            : open
            ? "translate-x-0"
            : "-translate-x-full"
        } md:translate-x-0 fixed md:static inset-y-0 left-0 z-50 w-[268px] flex flex-col border-r border-line bg-paper transition-transform duration-200`}
      >
        <div className="px-6 pt-7 pb-6 border-b border-line">
          <Brand />
        </div>

        <nav className="flex-1 flex flex-col gap-0.5 px-3 py-4">
          <p className="eyebrow px-3 mb-2">Workspace</p>
          {visibleItems.map((it) => {
            const isActive = active === it.href || (it.href !== "/" && active.startsWith(it.href));
            return (
              <button
                key={it.href}
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  onClose?.();
                  router.push(it.href);
                }}
                className={`group flex items-center gap-3 px-3 py-2.5 rounded-md text-[13.5px] transition-colors relative w-full text-left ${
                  isActive
                    ? "bg-surface text-ink font-medium"
                    : "text-muted hover:bg-hover hover:text-ink"
                }`}
                style={isActive ? { boxShadow: "var(--shadow-xs)" } : undefined}
              >
                {isActive && (
                  <span
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-sm"
                    style={{ background: "var(--accent)" }}
                  />
                )}
                <svg
                  width="17"
                  height="17"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="flex-shrink-0"
                >
                  {it.icon}
                </svg>
                <span>{it.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="px-3 py-3 border-t border-line">
          {user && (
            <div className="px-3 py-2 mb-2">
              <p className="text-[12px] text-ink truncate font-medium">
                {user.email}
              </p>
              <p className="text-[10.5px] text-subtle uppercase tracking-wider mt-0.5">
                {user.role === "superadmin" ? "Super Admin" : "Member"}
              </p>
            </div>
          )}
          <button
            onClick={async () => {
              const { createSupabaseBrowserClient } = await import(
                "@/lib/supabase-browser"
              );
              const sb = createSupabaseBrowserClient();
              await sb.auth.signOut();
              window.location.href = "/login";
            }}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-[12.5px] text-muted hover:text-ink hover:bg-hover transition-colors"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Sign out
          </button>
        </div>
      </aside>
    </>
  );
}

export function MobileNavToggle({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="md:hidden flex-shrink-0 w-9 h-9 rounded-md flex items-center justify-center hover:bg-hover transition-colors text-muted"
      aria-label="Open navigation"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="3" y1="6" x2="21" y2="6" />
        <line x1="3" y1="12" x2="21" y2="12" />
        <line x1="3" y1="18" x2="21" y2="18" />
      </svg>
    </button>
  );
}
