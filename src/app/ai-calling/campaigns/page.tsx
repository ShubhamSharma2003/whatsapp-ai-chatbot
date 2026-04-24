'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import type { AiCallCampaign, AiCallCampaignStatus } from '@/lib/types';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';

function StatusBadge({ status }: { status: AiCallCampaignStatus }) {
  const map: Record<AiCallCampaignStatus, { label: string; color: string; pulse?: boolean }> = {
    draft:   { label: 'Draft',   color: '#8696a0' },
    running: { label: 'Running', color: '#00a884', pulse: true },
    paused:  { label: 'Paused',  color: '#f0b429' },
    done:    { label: 'Done',    color: '#25d366' },
    failed:  { label: 'Failed',  color: '#ff6b6b' },
  };
  const { label, color, pulse } = map[status] ?? map.draft;
  return (
    <span className="flex items-center gap-1.5 text-[12px] font-medium" style={{ color }}>
      <span
        className={`w-2 h-2 rounded-full inline-block ${pulse ? 'animate-pulse' : ''}`}
        style={{ background: color }}
      />
      {label}
    </span>
  );
}

function parseCsv(text: string): Array<{ phone: string; name: string }> {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const phoneIdx = headers.indexOf('phone');
  const nameIdx = headers.indexOf('name');
  if (phoneIdx === -1) return [];
  return lines.slice(1).map((line) => {
    const cols = line.split(',');
    return {
      phone: (cols[phoneIdx] ?? '').trim(),
      name: nameIdx !== -1 ? (cols[nameIdx] ?? '').trim() : '',
    };
  }).filter((r) => r.phone);
}

export default function AiCallingCampaignsPage() {
  const [campaigns, setCampaigns] = useState<AiCallCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [step, setStep] = useState(1);
  const [campaignName, setCampaignName] = useState('');
  const [recipients, setRecipients] = useState<Array<{ phone: string; name: string }>>([]);
  const [csvError, setCsvError] = useState('');
  const [scheduleMode, setScheduleMode] = useState<'now' | 'later'>('now');
  const [scheduledAt, setScheduledAt] = useState('');
  const [creating, setCreating] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function loadCampaigns() {
    const res = await fetch('/api/ai-calling/campaigns');
    const data = await res.json();
    setCampaigns(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  useEffect(() => {
    loadCampaigns();
    const sb = createSupabaseBrowserClient();
    const channel = sb
      .channel('ai_call_campaigns')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ai_call_campaigns' }, () => {
        loadCampaigns();
      })
      .subscribe();
    return () => { sb.removeChannel(channel); };
  }, []);

  async function handleAction(id: string, action: 'start' | 'pause' | 'resume' | 'stop') {
    await fetch(`/api/ai-calling/campaigns/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const parsed = parseCsv(text);
      if (parsed.length === 0) {
        setCsvError('CSV must have a "phone" column and at least one row');
        setRecipients([]);
      } else {
        setCsvError('');
        setRecipients(parsed);
      }
    };
    reader.readAsText(file);
  }

  async function handleCreate() {
    setCreating(true);
    await fetch('/api/ai-calling/campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: campaignName,
        recipients,
        scheduled_at: scheduleMode === 'later' && scheduledAt ? new Date(scheduledAt).toISOString() : null,
      }),
    });
    setCreating(false);
    setShowModal(false);
    setStep(1);
    setCampaignName('');
    setRecipients([]);
    setScheduleMode('now');
    setScheduledAt('');
  }

  return (
    <div className="flex h-screen flex-col" style={{ background: '#111b21', color: '#e9edef' }}>
      {/* Header */}
      <div className="h-[60px] px-6 flex items-center justify-between border-b" style={{ background: '#202c33', borderColor: '#313d45' }}>
        <div className="flex items-center gap-6">
          <span className="text-[15px] font-semibold" style={{ color: '#e9edef' }}>AI Calling</span>
          <nav className="flex gap-1">
            <span className="px-3 py-1.5 rounded text-[13px] font-medium" style={{ background: '#2a3942', color: '#00a884' }}>Campaigns</span>
            <Link href="/ai-calling/logs" className="px-3 py-1.5 rounded text-[13px]" style={{ color: '#8696a0' }}>Call Logs</Link>
          </nav>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="px-4 py-2 rounded text-[13px] font-medium"
          style={{ background: '#00a884', color: 'white' }}
        >
          + New Campaign
        </button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="flex justify-center pt-20">
            <svg className="animate-spin" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#00a884" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
          </div>
        ) : campaigns.length === 0 ? (
          <div className="flex flex-col items-center pt-24" style={{ color: '#8696a0' }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.63 3.18 2 2 0 0 1 3.6 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.56a16 16 0 0 0 6.29 6.29l.97-.97a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
            </svg>
            <p className="mt-4 text-[14px]">No campaigns yet</p>
            <button onClick={() => setShowModal(true)} className="mt-3 text-[13px]" style={{ color: '#00a884' }}>Create your first campaign</button>
          </div>
        ) : (
          <table className="w-full text-[13px] border-collapse">
            <thead>
              <tr style={{ color: '#8696a0', borderBottom: '1px solid #313d45' }}>
                <th className="text-left py-3 px-4 font-medium">Name</th>
                <th className="text-left py-3 px-4 font-medium">Status</th>
                <th className="text-left py-3 px-4 font-medium">Progress</th>
                <th className="text-left py-3 px-4 font-medium">Scheduled</th>
                <th className="text-left py-3 px-4 font-medium">Created</th>
                <th className="text-left py-3 px-4 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => (
                <tr key={c.id} style={{ borderBottom: '1px solid #202c33' }}>
                  <td className="py-3 px-4 font-medium">{c.name}</td>
                  <td className="py-3 px-4"><StatusBadge status={c.status} /></td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-1.5 rounded-full overflow-hidden" style={{ background: '#2a3942' }}>
                        <div
                          className="h-full rounded-full"
                          style={{
                            background: '#00a884',
                            width: c.total_recipients > 0 ? `${Math.round((c.called_count / c.total_recipients) * 100)}%` : '0%',
                          }}
                        />
                      </div>
                      <span style={{ color: '#8696a0' }}>{c.called_count}/{c.total_recipients}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4" style={{ color: '#8696a0' }}>
                    {c.scheduled_at ? new Date(c.scheduled_at).toLocaleString() : '—'}
                  </td>
                  <td className="py-3 px-4" style={{ color: '#8696a0' }}>
                    {new Date(c.created_at).toLocaleDateString()}
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex gap-2">
                      {c.status === 'draft' && (
                        <button onClick={() => handleAction(c.id, 'start')} className="px-3 py-1 rounded text-[12px]" style={{ background: '#00a884', color: 'white' }}>Start</button>
                      )}
                      {c.status === 'running' && (
                        <>
                          <button onClick={() => handleAction(c.id, 'pause')} className="px-3 py-1 rounded text-[12px]" style={{ background: '#f0b429', color: 'white' }}>Pause</button>
                          <button onClick={() => handleAction(c.id, 'stop')} className="px-3 py-1 rounded text-[12px]" style={{ background: '#ff6b6b', color: 'white' }}>Stop</button>
                        </>
                      )}
                      {c.status === 'paused' && (
                        <>
                          <button onClick={() => handleAction(c.id, 'resume')} className="px-3 py-1 rounded text-[12px]" style={{ background: '#00a884', color: 'white' }}>Resume</button>
                          <button onClick={() => handleAction(c.id, 'stop')} className="px-3 py-1 rounded text-[12px]" style={{ background: '#ff6b6b', color: 'white' }}>Stop</button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create Campaign Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-md rounded-xl p-6 flex flex-col gap-5" style={{ background: '#202c33' }}>
            <div className="flex items-center justify-between">
              <h2 className="text-[15px] font-semibold">New Campaign — Step {step}/3</h2>
              <button onClick={() => { setShowModal(false); setStep(1); }} style={{ color: '#8696a0' }}>✕</button>
            </div>

            {step === 1 && (
              <>
                <div>
                  <label className="block text-[13px] mb-1.5" style={{ color: '#8696a0' }}>Campaign Name</label>
                  <input
                    type="text"
                    value={campaignName}
                    onChange={(e) => setCampaignName(e.target.value)}
                    className="w-full px-3 py-2 rounded text-[14px] outline-none"
                    style={{ background: '#2a3942', color: '#e9edef', border: '1px solid #313d45' }}
                    placeholder="e.g. April Follow-up"
                    autoFocus
                  />
                </div>
                <button
                  disabled={!campaignName.trim()}
                  onClick={() => setStep(2)}
                  className="px-5 py-2 rounded text-[13px] font-medium self-end"
                  style={{ background: campaignName.trim() ? '#00a884' : '#2a3942', color: campaignName.trim() ? 'white' : '#8696a0' }}
                >
                  Next →
                </button>
              </>
            )}

            {step === 2 && (
              <>
                <div>
                  <label className="block text-[13px] mb-1.5" style={{ color: '#8696a0' }}>Upload CSV (columns: phone, name)</label>
                  <div
                    className="flex flex-col items-center justify-center gap-2 rounded-lg py-8 cursor-pointer border-2 border-dashed"
                    style={{ borderColor: '#313d45' }}
                    onClick={() => fileRef.current?.click()}
                  >
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#8696a0" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                    <span className="text-[13px]" style={{ color: '#8696a0' }}>Click to upload CSV</span>
                    <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFileChange} />
                  </div>
                  {csvError && <p className="mt-2 text-[12px]" style={{ color: '#ff6b6b' }}>{csvError}</p>}
                  {recipients.length > 0 && (
                    <div className="mt-3">
                      <p className="text-[12px] mb-2" style={{ color: '#00a884' }}>{recipients.length} contacts loaded</p>
                      <table className="w-full text-[12px] border-collapse">
                        <thead><tr style={{ color: '#8696a0' }}><th className="text-left pb-1">Phone</th><th className="text-left pb-1">Name</th></tr></thead>
                        <tbody>
                          {recipients.slice(0, 5).map((r, i) => (
                            <tr key={i}><td className="py-0.5">{r.phone}</td><td className="py-0.5">{r.name || '—'}</td></tr>
                          ))}
                          {recipients.length > 5 && <tr><td colSpan={2} style={{ color: '#8696a0' }}>…and {recipients.length - 5} more</td></tr>}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
                <div className="flex gap-3 self-end">
                  <button onClick={() => setStep(1)} className="px-4 py-2 rounded text-[13px]" style={{ color: '#8696a0' }}>← Back</button>
                  <button
                    disabled={recipients.length === 0}
                    onClick={() => setStep(3)}
                    className="px-5 py-2 rounded text-[13px] font-medium"
                    style={{ background: recipients.length > 0 ? '#00a884' : '#2a3942', color: recipients.length > 0 ? 'white' : '#8696a0' }}
                  >
                    Next →
                  </button>
                </div>
              </>
            )}

            {step === 3 && (
              <>
                <div className="flex flex-col gap-4">
                  <label className="text-[13px]" style={{ color: '#8696a0' }}>Schedule</label>
                  <div className="flex flex-col gap-2">
                    {(['now', 'later'] as const).map((m) => (
                      <label key={m} className="flex items-center gap-3 cursor-pointer">
                        <input type="radio" value={m} checked={scheduleMode === m} onChange={() => setScheduleMode(m)} />
                        <span className="text-[13px]">{m === 'now' ? 'Start immediately' : 'Schedule for later'}</span>
                      </label>
                    ))}
                  </div>
                  {scheduleMode === 'later' && (
                    <input
                      type="datetime-local"
                      value={scheduledAt}
                      onChange={(e) => setScheduledAt(e.target.value)}
                      className="px-3 py-2 rounded text-[13px] outline-none"
                      style={{ background: '#2a3942', color: '#e9edef', border: '1px solid #313d45' }}
                    />
                  )}
                </div>
                <div className="flex gap-3 self-end">
                  <button onClick={() => setStep(2)} className="px-4 py-2 rounded text-[13px]" style={{ color: '#8696a0' }}>← Back</button>
                  <button
                    disabled={creating || (scheduleMode === 'later' && !scheduledAt)}
                    onClick={handleCreate}
                    className="px-5 py-2 rounded text-[13px] font-medium"
                    style={{ background: '#00a884', color: 'white' }}
                  >
                    {creating ? 'Creating…' : 'Create Campaign'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
