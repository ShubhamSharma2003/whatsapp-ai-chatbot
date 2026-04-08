export interface Conversation {
  id: string;
  phone: string;
  name: string | null;
  mode: "agent" | "human";
  updated_at: string;
  created_at: string;
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
}

export type Feature = "dashboard" | "campaigns" | "settings" | "admin";

export interface AppUser {
  id: string;
  email: string;
  role: "superadmin" | "user";
  allowed_features: Feature[];
  allowed_phones: string[];
  created_at: string;
  updated_at: string;
}
