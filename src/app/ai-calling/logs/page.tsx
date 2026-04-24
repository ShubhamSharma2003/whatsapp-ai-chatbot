'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import type { AiCallRecipient, AiCallTranscript, AiCallCampaign, AiCallRecipientStatus } from '@/lib/types';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';

type RecipientWithTranscript = AiCallRecipient & { ai_call_transcripts?: AiCallTranscript | null };

function StatusBadge({ status }: { status: AiCallRecipientStatus }) {
  const map: Record<AiCallRecipientStatus, { label: string; color: string }> = {
    pending:   { label: 'Pending',   color: '#8696a0' },
    calling:   { label: 'Calling',   color: '#f0b429' },
    completed: { label: 'Completed', color: '#00a884' },
    failed:    { label: 'Failed',    color: '#ff6b6b' },
    scheduled: { label: 'Scheduled', color: '#5bc8f5' },
  };
  const { label, color } = map[status] ?? map.pending;
  return <span className="text-[12px] font-medium" style={{ color }}>{label}</span>;
}

function formatDuration(seconds: number | null) {
  if (!seconds) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function AiCallingLogsPage() {
  const [rows, setRows] = useState<RecipientWithTranscript[]>([]);
  const [campaigns, setCampaigns] = useState<AiCallCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<RecipientWithTranscript | null>(null);
  const [filterCampaign, setFilterCampaign] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterSearch, setFilterSearch] = useState('');

  const loadData = useCallback(async () => {
    const params = new URLSearchParams();
    if (filterCampaign) params.set('campaign_id', filterCampaign);
    if (filterStatus) params.set('status', filterStatus);
    if (filterSearch) params.set('search', filterSearch);

    const [logsRes, campaignsRes] = await Promise.all([
      fetch(`/api/ai-calling/logs?${params}`),
      fetch('/api/ai-calling/campaigns'),
    ]);
    const logsData = await logsRes.json();
    const campaignsData = await campaignsRes.json();
    setRows(Array.isArray(logsData) ? logsData : []);
    setCampaigns(Array.isArray(campaignsData) ? campaignsData : []);
    setLoading(false);
  }, [filterCampaign, filterStatus, filterSearch]);

  const loadDataRef = useRef(loadData);
  useEffect(() => { loadDataRef.current = loadData; }, [loadData]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    const sb = createSupabaseBrowserClient();
    const channel = sb
      .channel('ai_call_recipients_logs')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ai_call_recipients' }, () => {
        loadDataRef.current();
      })
      .subscribe();
    return () => { sb.removeChannel(channel); };
  }, []);

  function exportCsv() {
    const headers = ['Name', 'Phone', 'Status', 'Duration', 'Started At', 'Ended Reason', 'Cost', 'Retries', 'Scheduled At'];
    const csvRows = rows.map((r) => [
      r.name, r.phone, r.status,
      formatDuration(r.duration_seconds),
      r.started_at ? new Date(r.started_at).toLocaleString() : '',
      r.ended_reason ?? '',
      r.ai_call_transcripts?.cost_total?.toFixed(4) ?? '',
      r.retry_count,
      r.scheduled_at ? new Date(r.scheduled_at).toLocaleString() : '',
    ]);
    const csv = [headers, ...csvRows].map((row) => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'call-logs.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex h-screen" style={{ background: '#111b21', color: '#e9edef' }}>
      {/* Main content */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Header */}
        <div className="h-[60px] px-6 flex items-center justify-between border-b flex-shrink-0" style={{ background: '#202c33', borderColor: '#313d45' }}>
          <div className="flex items-center gap-6">
            <span className="text-[15px] font-semibold">AI Calling</span>
            <nav className="flex gap-1">
              <Link href="/ai-calling/campaigns" className="px-3 py-1.5 rounded text-[13px]" style={{ color: '#8696a0' }}>Campaigns</Link>
              <span className="px-3 py-1.5 rounded text-[13px] font-medium" style={{ background: '#2a3942', color: '#00a884' }}>Call Logs</span>
            </nav>
          </div>
          <button onClick={exportCsv} className="px-4 py-2 rounded text-[13px] font-medium" style={{ background: '#2a3942', color: '#e9edef' }}>
            Export CSV
          </button>
        </div>

        {/* Filters */}
        <div className="flex gap-3 px-6 py-3 border-b flex-shrink-0" style={{ borderColor: '#313d45', background: '#111b21' }}>
          <select
            value={filterCampaign}
            onChange={(e) => setFilterCampaign(e.target.value)}
            className="px-3 py-1.5 rounded text-[13px] outline-none"
            style={{ background: '#2a3942', color: '#e9edef', border: '1px solid #313d45' }}
          >
            <option value="">All Campaigns</option>
            {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-1.5 rounded text-[13px] outline-none"
            style={{ background: '#2a3942', color: '#e9edef', border: '1px solid #313d45' }}
          >
            <option value="">All Statuses</option>
            {['pending','calling','completed','failed','scheduled'].map((s) => (
              <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
            ))}
          </select>
          <input
            type="text"
            value={filterSearch}
            onChange={(e) => setFilterSearch(e.target.value)}
            placeholder="Search name or phone…"
            className="px-3 py-1.5 rounded text-[13px] outline-none flex-1 max-w-xs"
            style={{ background: '#2a3942', color: '#e9edef', border: '1px solid #313d45' }}
          />
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex justify-center pt-20">
              <svg className="animate-spin" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#00a884" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
            </div>
          ) : (
            <table className="w-full text-[13px] border-collapse">
              <thead className="sticky top-0" style={{ background: '#111b21' }}>
                <tr style={{ color: '#8696a0', borderBottom: '1px solid #313d45' }}>
                  {['Name','Phone','Status','Duration','Started At','Ended Reason','Cost','Retries','Scheduled At',''].map((h) => (
                    <th key={h} className="text-left py-3 px-4 font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    className="cursor-pointer transition-colors"
                    style={{ borderBottom: '1px solid #202c33' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#202c33')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    onClick={() => setSelected(r)}
                  >
                    <td className="py-3 px-4 font-medium">{r.name || '—'}</td>
                    <td className="py-3 px-4" style={{ color: '#8696a0' }}>{r.phone}</td>
                    <td className="py-3 px-4"><StatusBadge status={r.status} /></td>
                    <td className="py-3 px-4" style={{ color: '#8696a0' }}>{formatDuration(r.duration_seconds)}</td>
                    <td className="py-3 px-4 whitespace-nowrap" style={{ color: '#8696a0' }}>
                      {r.started_at ? new Date(r.started_at).toLocaleString() : '—'}
                    </td>
                    <td className="py-3 px-4 max-w-[160px] truncate" style={{ color: '#8696a0' }}>{r.ended_reason ?? '—'}</td>
                    <td className="py-3 px-4" style={{ color: '#8696a0' }}>
                      {r.ai_call_transcripts?.cost_total ? `$${Number(r.ai_call_transcripts.cost_total).toFixed(4)}` : '—'}
                    </td>
                    <td className="py-3 px-4" style={{ color: '#8696a0' }}>{r.retry_count}</td>
                    <td className="py-3 px-4 whitespace-nowrap" style={{ color: '#8696a0' }}>
                      {r.scheduled_at ? new Date(r.scheduled_at).toLocaleString() : '—'}
                    </td>
                    <td className="py-3 px-4">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8696a0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={10} className="py-16 text-center text-[13px]" style={{ color: '#8696a0' }}>No calls found</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Detail Panel */}
      {selected && (
        <div className="w-[380px] flex-shrink-0 flex flex-col border-l overflow-auto" style={{ background: '#0b141a', borderColor: '#313d45' }}>
          <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: '#313d45' }}>
            <div>
              <p className="text-[15px] font-semibold">{selected.name || 'Unknown'}</p>
              <p className="text-[12px]" style={{ color: '#8696a0' }}>{selected.phone}</p>
            </div>
            <button onClick={() => setSelected(null)} style={{ color: '#8696a0' }}>✕</button>
          </div>

          <div className="flex flex-col gap-5 p-5">
            {/* Status + reason */}
            <div className="flex flex-col gap-1">
              <StatusBadge status={selected.status} />
              {selected.ended_reason && (
                <p className="text-[12px] mt-1" style={{ color: '#8696a0' }}>{selected.ended_reason}</p>
              )}
            </div>

            {/* Duration + timestamps */}
            <div className="grid grid-cols-2 gap-3 text-[12px]">
              <div><p style={{ color: '#8696a0' }}>Duration</p><p className="mt-0.5">{formatDuration(selected.duration_seconds)}</p></div>
              <div><p style={{ color: '#8696a0' }}>Started</p><p className="mt-0.5">{selected.started_at ? new Date(selected.started_at).toLocaleString() : '—'}</p></div>
              <div><p style={{ color: '#8696a0' }}>Ended</p><p className="mt-0.5">{selected.ended_at ? new Date(selected.ended_at).toLocaleString() : '—'}</p></div>
              <div><p style={{ color: '#8696a0' }}>Retries</p><p className="mt-0.5">{selected.retry_count}</p></div>
            </div>

            {/* Recording */}
            {selected.ai_call_transcripts?.recording_url && (
              <div>
                <p className="text-[12px] font-medium mb-2" style={{ color: '#8696a0' }}>RECORDING</p>
                <audio
                  controls
                  src={selected.ai_call_transcripts.recording_url}
                  className="w-full"
                />
                <a
                  href={selected.ai_call_transcripts.recording_url}
                  download
                  className="block mt-2 text-[12px]"
                  style={{ color: '#00a884' }}
                >
                  Download recording
                </a>
              </div>
            )}

            {/* Transcript */}
            {selected.ai_call_transcripts?.messages && selected.ai_call_transcripts.messages.length > 0 && (
              <div>
                <p className="text-[12px] font-medium mb-2" style={{ color: '#8696a0' }}>TRANSCRIPT</p>
                <div className="flex flex-col gap-2 max-h-[240px] overflow-auto pr-1">
                  {selected.ai_call_transcripts.messages.map((m, i) => (
                    <div
                      key={i}
                      className={`px-3 py-2 rounded-lg text-[12px] max-w-[90%] ${m.role === 'assistant' ? 'self-start' : 'self-end'}`}
                      style={{ background: m.role === 'assistant' ? '#2a3942' : '#005c4b', color: '#e9edef' }}
                    >
                      <p>{m.content}</p>
                      {m.timestamp && (
                        <p className="mt-1 text-[10px]" style={{ color: '#8696a0' }}>
                          {new Date(m.timestamp).toLocaleTimeString()}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* AI Summary */}
            {selected.ai_call_transcripts?.summary && (
              <div>
                <p className="text-[12px] font-medium mb-2" style={{ color: '#8696a0' }}>AI SUMMARY</p>
                <p className="text-[13px]" style={{ color: '#e9edef' }}>{selected.ai_call_transcripts.summary}</p>
                {selected.ai_call_transcripts.success_evaluation && (
                  <p className="mt-2 text-[12px]" style={{ color: '#8696a0' }}>
                    Evaluation: {selected.ai_call_transcripts.success_evaluation}
                  </p>
                )}
              </div>
            )}

            {/* Cost breakdown */}
            {selected.ai_call_transcripts && selected.ai_call_transcripts.cost_total > 0 && (
              <div>
                <p className="text-[12px] font-medium mb-2" style={{ color: '#8696a0' }}>COST BREAKDOWN</p>
                <table className="w-full text-[12px]">
                  <tbody>
                    {Object.entries(selected.ai_call_transcripts.cost_breakdown).map(([k, v]) => (
                      <tr key={k}>
                        <td className="py-0.5 capitalize" style={{ color: '#8696a0' }}>{k}</td>
                        <td className="py-0.5 text-right">${(v as number).toFixed(4)}</td>
                      </tr>
                    ))}
                    <tr style={{ borderTop: '1px solid #313d45' }}>
                      <td className="pt-1.5 font-medium">Total</td>
                      <td className="pt-1.5 text-right font-medium" style={{ color: '#00a884' }}>
                        ${Number(selected.ai_call_transcripts.cost_total).toFixed(4)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
