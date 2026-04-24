import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { action } = await request.json() as { action: 'start' | 'pause' | 'resume' | 'stop' };

  if (action === 'stop') {
    await supabase
      .from('ai_call_recipients')
      .update({ status: 'failed', error: 'Campaign stopped by user' })
      .eq('campaign_id', id)
      .in('status', ['pending', 'calling']);
  }

  const statusMap: Record<string, string> = {
    start: 'running',
    pause: 'paused',
    resume: 'running',
    stop: 'failed',
  };

  const newStatus = statusMap[action];
  if (!newStatus) {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('ai_call_campaigns')
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (action === 'start' || action === 'resume') {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
    fetch(`${baseUrl}/api/ai-calling/worker`, { method: 'POST' }).catch(() => {});
  }

  return NextResponse.json(data);
}
