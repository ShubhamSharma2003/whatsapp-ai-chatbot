"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createSupabaseBrowserClient();
    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (authError) {
      setError(authError.message);
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <div className="flex-1 grid lg:grid-cols-[1.15fr_1fr] min-h-screen bg-paper relative overflow-hidden">
      {/* Mesh atmosphere on entire viewport */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="blob blob-emerald w-[480px] h-[480px] -top-40 -left-32 animate-drift" />
        <div className="blob blob-violet w-[420px] h-[420px] top-1/3 -right-24 animate-drift" style={{ animationDelay: "3s" }} />
        <div className="blob blob-coral w-[360px] h-[360px] -bottom-32 left-1/3 animate-drift" style={{ animationDelay: "6s" }} />
      </div>

      {/* Left — brand */}
      <div className="hidden lg:flex relative flex-col justify-between p-14 border-r border-line">
        {/* Top — brand */}
        <div className="relative flex items-center gap-3 z-10">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center relative overflow-hidden"
            style={{
              background: "linear-gradient(135deg, #14A871 0%, #0A7350 60%, #064D33 100%)",
              boxShadow: "0 12px 24px -8px rgba(14, 138, 95, 0.5), inset 0 0 0 1px rgba(255,255,255,0.15)",
            }}
          >
            <span className="absolute -top-3 -right-3 w-10 h-10 rounded-full" style={{ background: "rgba(255,255,255,0.22)", filter: "blur(10px)" }} />
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="relative">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <div className="flex flex-col leading-none">
            <span className="font-display text-[22px] font-semibold tracking-tight text-ink">
              Unisel Realty
            </span>
            <span className="text-[10.5px] uppercase tracking-[0.2em] text-subtle mt-1.5">
              WhatsApp Workspace
            </span>
          </div>
        </div>

        {/* Middle — editorial */}
        <div className="relative max-w-lg z-10">
          <div className="flex items-center gap-3 mb-6">
            <span className="w-10 h-px" style={{ background: "var(--accent)" }} />
            <p className="eyebrow text-accent-ink">A quieter inbox</p>
          </div>
          <h1 className="font-display text-[52px] leading-[0.98] tracking-tight text-ink mb-7">
            Conversations<br />
            <span
              className="italic relative inline-block"
              style={{
                background: "linear-gradient(120deg, #0E8A5F 0%, #6B3FA0 50%, #D9544A 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              that close
            </span>
            <br /> themselves.
          </h1>
          <p className="text-[15.5px] text-muted leading-relaxed max-w-md">
            Broadcast templates, live AI replies, and outbound calls — all in one paper-tinted console. Your team handles only the chats that matter.
          </p>

          {/* Feature pills */}
          <div className="flex flex-wrap gap-2 mt-8">
            {[
              { label: "Auto-reply", color: "var(--emerald)" },
              { label: "Broadcasts", color: "var(--violet)" },
              { label: "AI calling", color: "var(--coral)" },
              { label: "Live transcripts", color: "var(--sapphire)" },
            ].map((f) => (
              <span
                key={f.label}
                className="px-3 py-1.5 rounded-full text-[11.5px] font-medium glass"
                style={{ color: f.color }}
              >
                <span className="inline-block w-1.5 h-1.5 rounded-full mr-2 align-middle" style={{ background: f.color }} />
                {f.label}
              </span>
            ))}
          </div>
        </div>

        {/* Bottom */}
        <div className="relative flex items-center justify-between text-[11px] text-subtle uppercase tracking-[0.18em] z-10">
          <span>Workspace · v2</span>
          <span className="flex items-center gap-2">
            <span className="relative inline-flex">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--accent)" }} />
              <span className="absolute inset-0 rounded-full pulse-ring" style={{ color: "var(--accent)" }} />
            </span>
            All systems nominal
          </span>
        </div>
      </div>

      {/* Right — form card */}
      <div className="flex items-center justify-center px-6 py-12 relative z-10">
        <div className="w-full max-w-sm">
          {/* Mobile brand */}
          <div className="lg:hidden flex items-center gap-3 mb-10">
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center"
              style={{
                background: "linear-gradient(135deg, #14A871 0%, #064D33 100%)",
                boxShadow: "0 8px 20px -6px rgba(14, 138, 95, 0.4)",
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <span className="font-display text-[19px] font-semibold tracking-tight text-ink">
              Unisel Realty
            </span>
          </div>

          {/* Card */}
          <div
            className="glass rounded-2xl p-8 animate-fade-in-up"
            style={{ boxShadow: "var(--shadow-xl)" }}
          >
            <p className="eyebrow mb-3">Sign in</p>
            <h2 className="font-display text-[34px] leading-tight tracking-tight text-ink mb-2">
              Welcome back.
            </h2>
            <p className="text-[14px] text-muted mb-8">
              Use your team credentials to enter the workspace.
            </p>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <label className="eyebrow text-[10px]" htmlFor="email">Email</label>
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@unisel.com"
                  className="w-full bg-white/80 border border-line rounded-lg px-4 py-3 text-[14px] text-ink placeholder:text-faint focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft transition-all"
                />
              </div>

              <div className="space-y-2">
                <label className="eyebrow text-[10px]" htmlFor="password">Password</label>
                <input
                  id="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-white/80 border border-line rounded-lg px-4 py-3 text-[14px] text-ink placeholder:text-faint focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft transition-all"
                />
              </div>

              {error && (
                <div
                  className="rounded-lg px-4 py-3 flex items-start gap-2.5 animate-scale-in"
                  style={{
                    background: "var(--coral-soft)",
                    border: "1px solid var(--coral)40",
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--coral-deep)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 flex-shrink-0">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  <p className="text-[13px]" style={{ color: "var(--coral-deep)" }}>{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="btn-accent w-full text-[14px] py-3.5 mt-3 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <span className="orbit orbit-sm" style={{ ["--accent" as string]: "white" }} />
                    Signing in…
                  </>
                ) : (
                  <>
                    Continue
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="5" y1="12" x2="19" y2="12" />
                      <polyline points="12 5 19 12 12 19" />
                    </svg>
                  </>
                )}
              </button>
            </form>
          </div>

          <p className="text-[11.5px] text-subtle mt-8 leading-relaxed text-center">
            Trouble signing in? Reach out to your workspace admin to reset your password.
          </p>
        </div>
      </div>
    </div>
  );
}
