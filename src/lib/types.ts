export type ConversationSourceType = "campaign" | "iq_setter" | "direct";

export interface ConversationSource {
  type: ConversationSourceType;
  label: string;
  secondary: string | null;
  template: string | null;
  received_at: string;
}

export interface Conversation {
  id: string;
  phone: string;
  name: string | null;
  mode: "agent" | "human";
  updated_at: string;
  created_at: string;
  source_type: ConversationSourceType | null;
  source_lead_id: string | null;
  source_campaign_id: string | null;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  whatsapp_msg_id: string | null;
  media_url: string | null;
  media_type: string | null;
  created_at: string;
}

export interface ConversationWithLastMessage extends Conversation {
  last_message: string | null;
  /** Timestamp of the most recent inbound (role='user') message, or null if user has never replied. */
  last_user_message_at: string | null;
  source: ConversationSource;
}

/**
 * WhatsApp 24-hour customer-service window state.
 * Window opens when the *user* sends a message, closes 24h after that message.
 * While closed, only Meta-approved templates may be sent — free-form text and media are rejected.
 */
export interface WhatsAppWindowStatus {
  open: boolean;
  expiresAt: string | null;
  msRemaining: number;
}

const WINDOW_MS = 24 * 60 * 60 * 1000;

export function getWhatsAppWindowStatus(
  lastUserMessageAt: string | null,
  now: number = Date.now()
): WhatsAppWindowStatus {
  if (!lastUserMessageAt) {
    return { open: false, expiresAt: null, msRemaining: 0 };
  }
  const lastMs = new Date(lastUserMessageAt).getTime();
  if (Number.isNaN(lastMs)) {
    return { open: false, expiresAt: null, msRemaining: 0 };
  }
  const expiresMs = lastMs + WINDOW_MS;
  const msRemaining = expiresMs - now;
  return {
    open: msRemaining > 0,
    expiresAt: new Date(expiresMs).toISOString(),
    msRemaining: Math.max(0, msRemaining),
  };
}

export type Feature =
  | "dashboard"
  | "campaigns"
  | "settings"
  | "admin"
  | "ai_calling"
  | "lead_types";

export interface AppUser {
  id: string;
  email: string;
  role: "superadmin" | "user";
  allowed_features: Feature[];
  allowed_phones: string[];
  created_at: string;
  updated_at: string;
}

// --- AI Calling ---

export type AiCallCampaignStatus = 'draft' | 'running' | 'paused' | 'done' | 'failed';
export type AiCallRecipientStatus = 'pending' | 'calling' | 'completed' | 'failed' | 'scheduled';

export interface AiCallSettings {
  id: number;
  vapi_api_key: string;
  vapi_phone_number_id: string;
  default_assistant_id: string;
  max_concurrent_calls: number;
  updated_at: string;
}

export interface AiCallCampaign {
  id: string;
  name: string;
  status: AiCallCampaignStatus;
  assistant_id: string;
  total_recipients: number;
  called_count: number;
  answered_count: number;
  failed_count: number;
  scheduled_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AiCallRecipient {
  id: string;
  campaign_id: string;
  phone: string;
  name: string;
  status: AiCallRecipientStatus;
  vapi_call_id: string | null;
  scheduled_at: string | null;
  started_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  ended_reason: string | null;
  retry_count: number;
  error: string | null;
  created_at: string;
}

export interface AiCallTranscript {
  id: string;
  recipient_id: string;
  campaign_id: string;
  messages: Array<{ role: string; content: string; timestamp?: string }>;
  recording_url: string | null;
  summary: string | null;
  success_evaluation: string | null;
  cost_total: number;
  cost_breakdown: {
    transport?: number;
    transcriber?: number;
    model?: number;
    voice?: number;
    vapi?: number;
  };
  created_at: string;
}
