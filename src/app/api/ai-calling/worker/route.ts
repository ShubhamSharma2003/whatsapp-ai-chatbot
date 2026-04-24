import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { createVapiCall } from '@/lib/vapi';

export async function POST() {
  const { data: settings } = await supabase
    .from('ai_call_settings')
    .select('vapi_phone_number_id, default_assistant_id, max_concurrent_calls')
    .eq('id', 1)
    .single();

  if (!settings) {
    return NextResponse.json({ error: 'Settings not configured' }, { status: 500 });
  }

  const { count: activeCount } = await supabase
    .from('ai_call_recipients')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'calling');

  const active = activeCount ?? 0;
  const maxConcurrent = settings.max_concurrent_calls;

  if (active >= maxConcurrent) {
    return NextResponse.json({ dispatched: 0, reason: 'concurrency_limit' });
  }

  const slotsAvailable = maxConcurrent - active;

  const { data: claimed, error: claimError } = await supabase
    .rpc('claim_pending_call_recipients', { p_limit: slotsAvailable });

  if (claimError) {
    return NextResponse.json({ error: claimError.message }, { status: 500 });
  }

  if (!claimed || claimed.length === 0) {
    return NextResponse.json({ dispatched: 0, reason: 'no_pending' });
  }

  let dispatched = 0;

  for (const recipient of claimed as Array<{
    id: string;
    campaign_id: string;
    phone: string;
    name: string;
    scheduled_at: string | null;
  }>) {
    try {
      const vapiCall = await createVapiCall({
        assistantId: settings.default_assistant_id,
        phoneNumberId: settings.vapi_phone_number_id,
        customerNumber: recipient.phone,
        customerName: recipient.name,
        scheduledAt: recipient.scheduled_at,
      });

      await supabase
        .from('ai_call_recipients')
        .update({ vapi_call_id: vapiCall.id })
        .eq('id', recipient.id);

      const { error: counterError } = await supabase.rpc('increment_ai_call_counter', {
        p_campaign_id: recipient.campaign_id,
        p_column: 'called_count',
        p_delta: 1,
      });
      if (counterError) console.error('increment called_count failed:', counterError.message);

      dispatched++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await supabase
        .from('ai_call_recipients')
        .update({ status: 'failed', error: message })
        .eq('id', recipient.id);

      await supabase.rpc('increment_ai_call_counter', {
        p_campaign_id: recipient.campaign_id,
        p_column: 'failed_count',
        p_delta: 1,
      });
    }
  }

  return NextResponse.json({ dispatched });
}
