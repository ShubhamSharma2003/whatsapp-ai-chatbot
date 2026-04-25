import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

function validateWebhookSecret(request: NextRequest): boolean {
  const secret = process.env.VAPI_WEBHOOK_SECRET;
  if (!secret) return true;
  const auth = request.headers.get('authorization') ?? '';
  return auth === secret || auth === `Bearer ${secret}`;
}

export async function POST(request: NextRequest) {
  if (!validateWebhookSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json() as {
    message: {
      type: string;
      call?: {
        id: string;
        status?: string;
        startedAt?: string;
        endedAt?: string;
        endedReason?: string;
      };
      artifact?: {
        messages?: Array<{ role: string; content: string; time?: number }>;
        recordingUrl?: string;
        transcript?: string;
      };
      analysis?: { summary?: string; successEvaluation?: string };
      costs?: Array<{ type: string; cost: number }>;
    };
  };

  const { message } = body;
  console.log('webhook received:', message?.type, 'callId:', message?.call?.id, 'status:', message?.call?.status);
  if (!message?.type) return NextResponse.json({ received: true });

  const callId = message.call?.id;

  const { data: recipient } = callId
    ? await supabase
        .from('ai_call_recipients')
        .select('id, campaign_id, status')
        .eq('vapi_call_id', callId)
        .single()
    : { data: null };

  switch (message.type) {
    case 'status-update': {
      const callStatus = message.call?.status;
      if (!recipient || !callStatus) break;

      if (callStatus === 'ringing' || callStatus === 'in-progress') {
        await supabase
          .from('ai_call_recipients')
          .update({
            status: 'calling',
            started_at: message.call?.startedAt ?? new Date().toISOString(),
          })
          .eq('id', recipient.id);
      } else if (callStatus === 'ended') {
        const endedReason = message.call?.endedReason ?? null;
        const startedAt = message.call?.startedAt;
        const endedAt = message.call?.endedAt ?? new Date().toISOString();
        const durationSeconds = startedAt
          ? Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000)
          : null;
        const ANSWERED_REASONS = new Set([
          'customer-ended-call',
          'assistant-ended-call',
          'assistant-forwarded-call',
          'customer-did-not-give-microphone-permission',
        ]);
        const isSuccess = endedReason !== null && ANSWERED_REASONS.has(endedReason);

        await supabase
          .from('ai_call_recipients')
          .update({
            status: 'completed',
            ended_at: endedAt,
            duration_seconds: durationSeconds,
            ended_reason: endedReason,
          })
          .eq('id', recipient.id);

        await supabase.rpc('increment_ai_call_counter', {
          p_campaign_id: recipient.campaign_id,
          p_column: isSuccess ? 'answered_count' : 'failed_count',
          p_delta: 1,
        });

        const { count: pendingCount } = await supabase
          .from('ai_call_recipients')
          .select('*', { count: 'exact', head: true })
          .eq('campaign_id', recipient.campaign_id)
          .in('status', ['pending', 'calling']);

        if ((pendingCount ?? 0) === 0) {
          await supabase
            .from('ai_call_campaigns')
            .update({ status: 'done', updated_at: new Date().toISOString() })
            .eq('id', recipient.campaign_id);
        }

        const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
        fetch(`${baseUrl}/api/ai-calling/worker`, { method: 'POST' }).catch(() => {});
      }
      break;
    }

    case 'end-of-call-report': {
      if (!recipient) break;

      const rawMessages = message.artifact?.messages ?? [];
      const messages = rawMessages.map((m) => ({
        role: m.role,
        content: m.content,
        timestamp: m.time ? new Date(m.time).toISOString() : undefined,
      }));

      const costs = message.costs ?? [];
      const costBreakdown: Record<string, number> = {};
      let costTotal = 0;
      for (const c of costs) {
        costBreakdown[c.type] = c.cost;
        costTotal += c.cost;
      }

      await supabase
        .from('ai_call_transcripts')
        .upsert(
          {
            recipient_id: recipient.id,
            campaign_id: recipient.campaign_id,
            messages,
            recording_url: message.artifact?.recordingUrl ?? null,
            summary: message.analysis?.summary ?? null,
            success_evaluation: message.analysis?.successEvaluation ?? null,
            cost_total: costTotal,
            cost_breakdown: costBreakdown,
          },
          { onConflict: 'recipient_id' }
        );
      break;
    }

    case 'recording-ready': {
      if (!recipient || !message.artifact?.recordingUrl) break;
      await supabase
        .from('ai_call_transcripts')
        .update({ recording_url: message.artifact.recordingUrl })
        .eq('recipient_id', recipient.id);
      break;
    }
  }

  return NextResponse.json({ received: true });
}
