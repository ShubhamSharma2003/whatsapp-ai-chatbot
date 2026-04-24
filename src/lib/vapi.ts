import { supabase } from './supabase';

const VAPI_BASE = 'https://api.vapi.ai';

async function getVapiKey(): Promise<string> {
  if (process.env.VAPI_API_KEY) return process.env.VAPI_API_KEY;
  const { data } = await supabase
    .from('ai_call_settings')
    .select('vapi_api_key')
    .eq('id', 1)
    .single();
  if (!data?.vapi_api_key) throw new Error('VAPI API key not configured');
  return data.vapi_api_key;
}

export interface CreateCallParams {
  assistantId: string;
  phoneNumberId: string;
  customerNumber: string;
  customerName?: string;
  scheduledAt?: string | null;
}

export interface VapiCallResponse {
  id: string;
  status: string;
  type: string;
}

export async function createVapiCall(params: CreateCallParams): Promise<VapiCallResponse> {
  const apiKey = await getVapiKey();

  const body: Record<string, unknown> = {
    assistantId: params.assistantId,
    phoneNumberId: params.phoneNumberId,
    customer: {
      number: params.customerNumber,
      name: params.customerName ?? undefined,
    },
  };

  if (params.scheduledAt) {
    body.schedulePlan = { earliestAt: params.scheduledAt };
  }

  const res = await fetch(`${VAPI_BASE}/call`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`VAPI error ${res.status}: ${text}`);
  }

  return res.json() as Promise<VapiCallResponse>;
}
