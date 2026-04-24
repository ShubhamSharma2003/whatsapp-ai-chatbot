import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const campaign_id = searchParams.get('campaign_id');
  const status = searchParams.get('status');
  const search = searchParams.get('search');
  const from = searchParams.get('from');
  const to = searchParams.get('to');

  let query = supabase
    .from('ai_call_recipients')
    .select('*, ai_call_transcripts(recording_url, summary, success_evaluation, cost_total, cost_breakdown, messages)')
    .order('created_at', { ascending: false });

  if (campaign_id) query = query.eq('campaign_id', campaign_id);
  if (status) query = query.eq('status', status);
  if (search) query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%`);
  if (from) query = query.gte('created_at', from);
  if (to) query = query.lte('created_at', to);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
