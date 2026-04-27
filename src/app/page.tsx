"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import SidebarNav, { MobileNavToggle } from "@/components/ui/SidebarNav";
import { Avatar } from "@/components/ui/Avatar";
import { Orbit, Skeleton, Dots } from "@/components/ui/Loaders";
import type { ConversationWithLastMessage, Message } from "@/lib/types";

export default function Dashboard() {
  const supabaseRef = useRef<ReturnType<typeof createSupabaseBrowserClient> | null>(null);
  if (!supabaseRef.current) supabaseRef.current = createSupabaseBrowserClient();
  const supabase = supabaseRef.current;

  const [conversations, setConversations] = useState<ConversationWithLastMessage[]>([]);
  const [loadingConvos, setLoadingConvos] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const deepLinkPending = useRef(false);

  const selected = conversations.find((c) => c.id === selectedId);

  const filteredConversations = conversations.filter((c) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      (c.name?.toLowerCase().includes(q) ?? false) ||
      c.phone.toLowerCase().includes(q) ||
      (c.last_message?.toLowerCase().includes(q) ?? false)
    );
  });

  // Snapshot stats for header
  const stats = useMemo(() => {
    const total = conversations.length;
    const ai = conversations.filter((c) => c.mode === "agent").length;
    const human = total - ai;
    return { total, ai, human };
  }, [conversations]);

  const fetchConversations = useCallback(async () => {
    const res = await fetch("/api/conversations");
    const data = await res.json();
    setConversations(data);
    setLoadingConvos(false);
  }, []);

  const fetchMessages = useCallback(async (convoId: string) => {
    setLoadingMessages(true);
    const res = await fetch(`/api/conversations/${convoId}/messages`);
    const data = await res.json();
    setMessages(data);
    setLoadingMessages(false);
  }, []);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const phone = params.get("phone");
    if (!phone) return;
    deepLinkPending.current = true;
    setSearchQuery(decodeURIComponent(phone));
    window.history.replaceState({}, "", window.location.pathname);
  }, []);

  useEffect(() => {
    if (!deepLinkPending.current || !searchQuery || conversations.length === 0) return;
    const q = searchQuery.trim().toLowerCase();
    const matches = conversations.filter(
      (c) =>
        c.phone.toLowerCase().includes(q) ||
        (c.name?.toLowerCase().includes(q) ?? false)
    );
    if (matches.length === 1) {
      deepLinkPending.current = false;
      setSelectedId(matches[0].id);
    }
  }, [conversations, searchQuery]);

  useEffect(() => {
    if (selectedId) fetchMessages(selectedId);
  }, [selectedId, fetchMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!supabase) return;
    const channel = supabase
      .channel("realtime-messages")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const newMsg = payload.new as Message;
          if (newMsg.conversation_id === selectedId) {
            setMessages((prev) => {
              if (prev.some((m) => m.id === newMsg.id)) return prev;
              return [...prev, newMsg];
            });
          }
          setConversations((prev) =>
            prev.map((c) =>
              c.id === newMsg.conversation_id
                ? { ...c, last_message: newMsg.content, updated_at: newMsg.created_at }
                : c
            )
          );
        }
      )
      .subscribe();

    return () => {
      supabase?.removeChannel(channel);
    };
  }, [selectedId, supabase]);

  async function toggleMode() {
    if (!selected) return;
    const newMode = selected.mode === "agent" ? "human" : "agent";
    await fetch(`/api/conversations/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: newMode }),
    });
    setConversations((prev) =>
      prev.map((c) => (c.id === selected.id ? { ...c, mode: newMode } : c))
    );
  }

  async function handleSend() {
    if ((!input.trim() && !mediaFile) || !selectedId || sending) return;
    setSending(true);

    if (mediaFile) {
      const formData = new FormData();
      formData.append("file", mediaFile);
      if (input.trim()) formData.append("caption", input.trim());
      await fetch(`/api/conversations/${selectedId}/send-media`, {
        method: "POST",
        body: formData,
      });
      clearMedia();
    } else {
      await fetch(`/api/conversations/${selectedId}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: input.trim() }),
      });
    }

    setInput("");
    setSending(false);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setMediaFile(file);
    if (file.type.startsWith("image/") || file.type.startsWith("video/")) {
      setMediaPreview(URL.createObjectURL(file));
    } else {
      setMediaPreview(null);
    }
  }

  function clearMedia() {
    setMediaFile(null);
    if (mediaPreview) URL.revokeObjectURL(mediaPreview);
    setMediaPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function formatTime(dateStr: string) {
    return new Date(dateStr).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
  }

  function getInitials(name: string | null, phone: string) {
    if (name) return name.slice(0, 2).toUpperCase();
    return phone.slice(-2);
  }

  function sourceTone(type: "campaign" | "iq_setter" | "direct") {
    if (type === "campaign") return { bg: "var(--violet-soft)", ink: "var(--violet-deep)", border: "var(--violet)" };
    if (type === "iq_setter") return { bg: "var(--sapphire-soft)", ink: "var(--sapphire-deep)", border: "var(--sapphire)" };
    return { bg: "var(--surface-2)", ink: "var(--muted)", border: "var(--line)" };
  }

  function sourceTypeLabel(type: "campaign" | "iq_setter" | "direct") {
    if (type === "campaign") return "Campaign";
    if (type === "iq_setter") return "IQ Setter";
    return "Direct";
  }

  function sourceIcon(type: "campaign" | "iq_setter" | "direct") {
    if (type === "campaign") {
      return (
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 11l18-8-8 18-2-8z" />
        </svg>
      );
    }
    if (type === "iq_setter") {
      return (
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <circle cx="12" cy="12" r="6" />
          <circle cx="12" cy="12" r="2" />
        </svg>
      );
    }
    return (
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    );
  }

  return (
    <div className="flex h-screen bg-paper relative overflow-hidden">
      <SidebarNav active="/" open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Conversation list */}
      <div
        className={`${
          selectedId ? "hidden md:flex" : "flex"
        } w-full md:w-[380px] flex-col border-r border-line bg-surface-2 flex-shrink-0 h-screen overflow-hidden relative`}
      >
        {/* Header */}
        <div className="px-5 pt-6 pb-4 border-b border-line">
          <div className="flex items-center gap-3 mb-5">
            <MobileNavToggle onClick={() => setSidebarOpen(true)} />
            <div className="flex-1">
              <h1 className="font-display text-[26px] font-semibold leading-none tracking-tight text-ink">
                Inbox
              </h1>
              <p className="text-[11px] text-subtle uppercase tracking-[0.16em] mt-2">
                Live · {filteredConversations.length} thread{filteredConversations.length !== 1 ? "s" : ""}
              </p>
            </div>
          </div>

          {/* Stats strip */}
          {!loadingConvos && conversations.length > 0 && (
            <div className="grid grid-cols-3 gap-2 mb-4">
              <StatPill label="Total" value={stats.total} color="var(--ink)" />
              <StatPill label="AI" value={stats.ai} color="var(--emerald)" />
              <StatPill label="You" value={stats.human} color="var(--amber)" />
            </div>
          )}

          {/* Search */}
          <div className="relative">
            <svg
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-subtle"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, phone, or content"
              className="w-full bg-surface border border-line rounded-lg pl-10 pr-3 py-2.5 text-[13px] text-ink placeholder:text-faint focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft transition-all shadow-xs"
              style={{ boxShadow: "var(--shadow-xs)" }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-md flex items-center justify-center text-subtle hover:text-ink hover:bg-hover transition-colors"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {loadingConvos ? (
            <div className="px-5 py-3 space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-start gap-3">
                  <Skeleton width={40} height={40} className="rounded-full" />
                  <div className="flex-1 space-y-2 pt-1">
                    <Skeleton height={11} className="w-3/4" />
                    <Skeleton height={9} className="w-full" />
                    <Skeleton height={9} className="w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : conversations.length === 0 ? (
            <EmptyInbox />
          ) : (
            <div className="stagger">
              {filteredConversations.map((convo) => {
                const isSelected = selectedId === convo.id;
                return (
                  <button
                    key={convo.id}
                    onClick={() => setSelectedId(convo.id)}
                    className="w-full text-left px-5 py-3.5 transition-colors relative border-b border-line/60 group"
                    style={{
                      background: isSelected ? "var(--surface)" : undefined,
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) e.currentTarget.style.background = "var(--hover)";
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) e.currentTarget.style.background = "";
                    }}
                  >
                    {isSelected && (
                      <span
                        className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r-sm"
                        style={{
                          background: "linear-gradient(180deg, var(--emerald) 0%, var(--violet) 100%)",
                        }}
                      />
                    )}
                    <div className="flex items-start gap-3">
                      <Avatar
                        seed={convo.phone}
                        initials={getInitials(convo.name, convo.phone)}
                        size={40}
                        ring={isSelected}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className={`text-[13.5px] truncate ${isSelected ? "font-semibold text-ink" : "font-medium text-ink-2"}`}>
                            {convo.name || convo.phone}
                          </span>
                          <span className="text-[10px] text-subtle flex-shrink-0 tnum">
                            {formatTime(convo.updated_at)}
                          </span>
                        </div>
                        <p className="text-[12px] text-muted truncate mt-0.5 leading-snug">
                          {convo.last_message || (
                            <span className="text-faint italic">No messages yet</span>
                          )}
                        </p>
                        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                          {convo.source && convo.source.type !== "direct" && (() => {
                            const tone = sourceTone(convo.source.type);
                            return (
                              <span
                                className="text-[9.5px] px-1.5 py-0.5 rounded font-medium uppercase tracking-wider truncate max-w-[120px]"
                                style={{
                                  background: tone.bg,
                                  color: tone.ink,
                                  border: `1px solid ${tone.border}25`,
                                }}
                                title={`${sourceTypeLabel(convo.source.type)}: ${convo.source.label}`}
                              >
                                {convo.source.label}
                              </span>
                            );
                          })()}
                          <span
                            className="text-[9.5px] px-1.5 py-0.5 rounded font-medium uppercase tracking-wider flex items-center gap-1"
                            style={{
                              background: convo.mode === "agent" ? "var(--emerald-soft)" : "var(--amber-soft)",
                              color: convo.mode === "agent" ? "var(--emerald-deep)" : "var(--amber-deep)",
                              border: `1px solid ${convo.mode === "agent" ? "var(--emerald)" : "var(--amber)"}25`,
                            }}
                          >
                            <span
                              className="w-1 h-1 rounded-full"
                              style={{ background: convo.mode === "agent" ? "var(--emerald)" : "var(--amber)" }}
                            />
                            {convo.mode === "agent" ? "AI" : "You"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Chat Panel */}
      <div className={`${selectedId ? "flex" : "hidden md:flex"} flex-1 flex-col min-w-0 h-screen overflow-hidden relative bg-paper-2 mesh-canvas`}>
        {!selected ? (
          <EmptyChat />
        ) : (
          <>
            {/* Chat Header */}
            <div className="border-b border-line bg-surface flex-shrink-0 relative z-10">
              <div className="px-5 md:px-7 py-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <button
                    onClick={() => setSelectedId(null)}
                    className="md:hidden flex-shrink-0 w-9 h-9 rounded-md flex items-center justify-center hover:bg-hover transition-colors text-muted"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="15 18 9 12 15 6" />
                    </svg>
                  </button>
                  <Avatar
                    seed={selected.phone}
                    initials={getInitials(selected.name, selected.phone)}
                    size={42}
                  />
                  <div className="min-w-0">
                    <h2 className="font-display text-[17px] font-semibold text-ink leading-tight truncate">
                      {selected.name || selected.phone}
                    </h2>
                    <p className="text-[11.5px] text-muted leading-tight mt-1 truncate font-mono tnum flex items-center gap-1.5">
                      <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ background: "var(--accent)" }}
                      />
                      {selected.phone}
                    </p>
                  </div>
                </div>

                <button
                  onClick={toggleMode}
                  className="flex items-center gap-2 px-3.5 py-1.5 rounded-full text-[12px] font-medium transition-all flex-shrink-0 border"
                  style={{
                    background: selected.mode === "agent" ? "var(--emerald-soft)" : "var(--amber-soft)",
                    color: selected.mode === "agent" ? "var(--emerald-deep)" : "var(--amber-deep)",
                    borderColor: selected.mode === "agent" ? "var(--emerald)" : "var(--amber)",
                  }}
                  title="Toggle AI/Human mode"
                >
                  <span className="relative inline-flex">
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{
                        background: selected.mode === "agent" ? "var(--emerald)" : "var(--amber)",
                      }}
                    />
                    <span
                      className="absolute inset-0 rounded-full pulse-ring"
                      style={{ color: selected.mode === "agent" ? "var(--emerald)" : "var(--amber)" }}
                    />
                  </span>
                  <span className="hidden sm:inline">
                    {selected.mode === "agent" ? "AI handling" : "Human handling"}
                  </span>
                  <span className="sm:hidden">{selected.mode === "agent" ? "AI" : "Human"}</span>
                </button>
              </div>

              {selected.source && (() => {
                const tone = sourceTone(selected.source.type);
                return (
                  <div className="px-5 md:px-7 pb-3">
                    <div
                      className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] px-2.5 py-1 rounded-md"
                      style={{
                        background: tone.bg,
                        color: tone.ink,
                        border: `1px solid ${tone.border}25`,
                      }}
                    >
                      <span className="flex items-center gap-1.5 font-semibold uppercase tracking-wider">
                        {sourceIcon(selected.source.type)}
                        {sourceTypeLabel(selected.source.type)}
                      </span>
                      {selected.source.type !== "direct" && (
                        <>
                          <span className="opacity-40">·</span>
                          <span className="font-medium">{selected.source.label}</span>
                        </>
                      )}
                      {selected.source.secondary && (
                        <>
                          <span className="opacity-40">·</span>
                          <span className="opacity-80">{selected.source.secondary}</span>
                        </>
                      )}
                      {selected.source.template && (
                        <>
                          <span className="opacity-40">·</span>
                          <span className="opacity-80">Template · {selected.source.template}</span>
                        </>
                      )}
                      <span className="opacity-40">·</span>
                      <span className="opacity-80 tnum">Received {formatDate(selected.source.received_at)}</span>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Messages */}
            <div className="flex-1 min-h-0 overflow-y-auto px-4 md:px-10 py-6 md:py-8 space-y-3 relative paper-dots">
              {loadingMessages && messages.length === 0 ? (
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className={`flex ${i % 2 === 0 ? "justify-start" : "justify-end"}`}>
                      <Skeleton
                        height={42}
                        className="rounded-2xl"
                        width={`${40 + Math.random() * 30}%`}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                messages.map((msg, i) => {
                  const isUser = msg.role === "user";
                  const showTime = i === messages.length - 1 || messages[i + 1]?.role !== msg.role;
                  const prev = messages[i - 1];
                  const isFirstInGroup = !prev || prev.role !== msg.role;
                  return (
                    <div
                      key={msg.id}
                      className={`flex ${isUser ? "justify-start" : "justify-end"} relative animate-fade-in-up`}
                    >
                      <div className={`flex flex-col ${isUser ? "items-start" : "items-end"} max-w-[85%] md:max-w-[62%]`}>
                        <div
                          className="px-4 py-2.5 text-[13.5px] leading-relaxed"
                          style={{
                            background: isUser
                              ? "var(--surface)"
                              : "linear-gradient(135deg, #14A871 0%, #0A7350 100%)",
                            color: isUser ? "var(--ink)" : "white",
                            border: isUser ? "1px solid var(--line)" : "none",
                            borderRadius: isUser
                              ? `${isFirstInGroup ? "4px" : "16px"} 16px 16px 16px`
                              : `16px ${isFirstInGroup ? "4px" : "16px"} 16px 16px`,
                            boxShadow: isUser
                              ? "var(--shadow-xs)"
                              : "0 4px 14px -4px rgba(14, 138, 95, 0.35)",
                          }}
                        >
                          {msg.media_url && msg.media_type === "image" && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={msg.media_url} alt="" className="rounded-md max-w-[260px] mb-2 cursor-pointer" onClick={() => window.open(msg.media_url!, "_blank")} />
                          )}
                          {msg.media_url && msg.media_type === "video" && (
                            <video src={msg.media_url} controls className="rounded-md max-w-[260px] mb-2" />
                          )}
                          {msg.media_url && msg.media_type === "audio" && (
                            <audio src={msg.media_url} controls className="mb-2 max-w-[260px]" />
                          )}
                          {msg.media_url && msg.media_type === "document" && (
                            <a
                              href={msg.media_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-2 px-3 py-2 rounded-md mb-2 transition-colors"
                              style={{
                                background: isUser ? "var(--paper)" : "rgba(255,255,255,0.16)",
                                color: "inherit",
                              }}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                <polyline points="14 2 14 8 20 8" />
                              </svg>
                              <span className="text-[12px]">Download file</span>
                            </a>
                          )}
                          {msg.content && msg.content !== `[${msg.media_type}]` && (
                            <p className="whitespace-pre-wrap">{msg.content}</p>
                          )}
                        </div>
                        {showTime && (
                          <p className="text-[10px] mt-1.5 px-1 tnum flex items-center gap-1.5 text-subtle">
                            {!isUser && (
                              <span
                                className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider text-white"
                                style={{
                                  background: "linear-gradient(135deg, #0E8A5F, #6B3FA0)",
                                }}
                              >
                                AI
                              </span>
                            )}
                            {formatTime(msg.created_at)}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Bar */}
            <div className="px-4 md:px-7 py-4 border-t border-line bg-surface flex-shrink-0 relative z-10">
              {mediaFile && (
                <div className="flex items-center gap-3 mb-3 px-3 py-2 rounded-lg border border-line bg-surface-2 animate-scale-in">
                  {mediaPreview && mediaFile.type.startsWith("image/") ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={mediaPreview} alt="" className="w-12 h-12 rounded-md object-cover" />
                  ) : mediaPreview && mediaFile.type.startsWith("video/") ? (
                    <video src={mediaPreview} className="w-12 h-12 rounded-md object-cover" />
                  ) : (
                    <div className="w-12 h-12 rounded-md flex items-center justify-center bg-paper-2 border border-line">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                      </svg>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-[12.5px] text-ink truncate font-medium">{mediaFile.name}</p>
                    <p className="text-[10.5px] text-subtle tnum">{(mediaFile.size / 1024).toFixed(0)} KB</p>
                  </div>
                  <button onClick={clearMedia} className="w-7 h-7 rounded-full hover:bg-hover flex items-center justify-center flex-shrink-0 transition-colors text-muted" aria-label="Remove attachment">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              )}

              <div
                className="flex items-end gap-2 rounded-xl px-3 py-2 border border-line bg-surface-2 focus-within:border-accent focus-within:bg-surface focus-within:shadow-sm transition-all"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/mp4,video/3gpp,audio/*,application/pdf,.doc,.docx,.xls,.xlsx"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-9 h-9 rounded-md hover:bg-hover flex items-center justify-center flex-shrink-0 transition-colors text-muted hover:text-ink"
                  aria-label="Attach file"
                  title="Attach image, video, audio, or document"
                >
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                  </svg>
                </button>
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value);
                    e.target.style.height = "auto";
                    e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px";
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder={mediaFile ? "Add a caption…" : "Type your reply…"}
                  rows={1}
                  className="flex-1 bg-transparent text-[13.5px] text-ink placeholder:text-faint focus:outline-none resize-none overflow-y-auto leading-6 py-1.5 border-0"
                  style={{ maxHeight: "160px" }}
                />
                <button
                  onClick={handleSend}
                  disabled={sending || (!input.trim() && !mediaFile)}
                  className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 transition-all duration-150 disabled:opacity-30 disabled:cursor-not-allowed text-white"
                  style={{
                    background: "linear-gradient(135deg, #14A871 0%, #0A7350 100%)",
                    boxShadow: "0 4px 12px -2px rgba(14, 138, 95, 0.42)",
                  }}
                  aria-label="Send"
                >
                  {sending ? (
                    <Dots />
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="22" y1="2" x2="11" y2="13" />
                      <polygon points="22 2 15 22 11 13 2 9 22 2" />
                    </svg>
                  )}
                </button>
              </div>
              <p className="text-[10.5px] text-subtle mt-2 px-1">
                <kbd className="px-1.5 py-0.5 rounded border border-line bg-surface text-ink font-mono text-[9.5px]">
                  Enter
                </kbd>{" "}
                send · <kbd className="px-1.5 py-0.5 rounded border border-line bg-surface text-ink font-mono text-[9.5px]">Shift+Enter</kbd> new line
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function StatPill({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div
      className="rounded-lg px-3 py-2 bg-surface border border-line flex flex-col items-start gap-0.5"
      style={{ boxShadow: "var(--shadow-xs)" }}
    >
      <div className="flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
        <span className="text-[9.5px] text-subtle uppercase tracking-wider font-semibold">{label}</span>
      </div>
      <span className="font-display text-[20px] leading-none tnum text-ink">{value}</span>
    </div>
  );
}

function EmptyInbox() {
  return (
    <div className="flex flex-col items-center justify-center h-72 gap-4 px-8">
      <div className="relative">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center"
          style={{
            background: "linear-gradient(135deg, var(--emerald-soft), var(--violet-soft))",
            border: "1px solid var(--line)",
          }}
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--accent-deep)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </div>
        <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full animate-pulse-soft" style={{ background: "var(--coral)" }} />
      </div>
      <p className="text-[13px] text-ink text-center font-medium">Your inbox is quiet</p>
      <p className="text-[11.5px] text-muted text-center leading-relaxed max-w-[220px]">
        New WhatsApp messages stream in here in real time.
      </p>
    </div>
  );
}

function EmptyChat() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 px-8 relative">
      {/* Decorative blobs */}
      <div className="blob blob-emerald w-[300px] h-[300px] -top-20 -left-10 animate-drift opacity-60" />
      <div className="blob blob-violet w-[260px] h-[260px] bottom-10 right-0 animate-drift opacity-50" style={{ animationDelay: "4s" }} />

      <div className="relative">
        <div
          className="w-24 h-24 rounded-3xl flex items-center justify-center relative animate-float"
          style={{
            background: "linear-gradient(135deg, #14A871 0%, #0A7350 60%, #064D33 100%)",
            boxShadow: "var(--shadow-emerald)",
          }}
        >
          <span className="absolute -top-3 -right-3 w-12 h-12 rounded-full" style={{ background: "rgba(255,255,255,0.2)", filter: "blur(10px)" }} />
          <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="relative">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </div>
        <div
          className="absolute -bottom-2 -right-2 w-7 h-7 rounded-full flex items-center justify-center"
          style={{
            background: "var(--paper)",
            border: "2px solid var(--paper-2)",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <span className="w-3 h-3 rounded-full pulse-ring inline-flex" style={{ background: "var(--accent)", color: "var(--accent)" }} />
        </div>
      </div>
      <div className="text-center max-w-sm relative">
        <h2 className="font-display text-[28px] tracking-tight text-ink mb-2 leading-tight">
          Pick a thread to begin
        </h2>
        <p className="text-[13.5px] text-muted leading-relaxed">
          Select a conversation from the list — live updates stream in as customers reply.
        </p>
      </div>

      <div className="flex items-center gap-2 mt-2 relative">
        <Orbit size="sm" />
        <span className="text-[11px] text-subtle uppercase tracking-[0.16em]">Live · realtime</span>
      </div>
    </div>
  );
}
