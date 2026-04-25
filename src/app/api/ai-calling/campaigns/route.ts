import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET() {
  const { data, error } = await supabase
    .from('ai_call_campaigns')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('campaigns GET error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const { name, recipients, scheduled_at } = await request.json() as {
    name: string;
    recipients: Array<{ phone: string; name: string }>;
    scheduled_at?: string | null;
  };

  if (!name || !recipients?.length) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const { data: settings } = await supabase
    .from('ai_call_settings')
    .select('default_assistant_id')
    .eq('id', 1)
    .single();

  const assistant_id = settings?.default_assistant_id ?? '';

  const { data: campaign, error: campaignError } = await supabase
    .from('ai_call_campaigns')
    .insert({
      name,
      status: 'draft',
      assistant_id,
      total_recipients: recipients.length,
      scheduled_at: scheduled_at ?? null,
    })
    .select()
    .single();

  if (campaignError || !campaign) {
    return NextResponse.json({ error: campaignError?.message ?? 'Failed to create campaign' }, { status: 500 });
  }

  const recipientRows = recipients.map((r) => {
    // Normalize to E.164: strip spaces/dashes, add +91 for 10-digit Indian numbers
    let phone = r.phone.replace(/[\s\-().]/g, '');
    if (!phone.startsWith('+')) {
      if (phone.length === 10) phone = '+91' + phone;
      else if (phone.startsWith('91') && phone.length === 12) phone = '+' + phone;
      else phone = '+' + phone;
    }
    return { campaign_id: campaign.id, phone, name: r.name, status: 'pending' };
  });

  const { error: insertError } = await supabase
    .from('ai_call_recipients')
    .insert(recipientRows);

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, campaign });
}
