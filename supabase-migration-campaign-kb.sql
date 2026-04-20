-- Migration: Campaign Knowledge Base
-- Run this in Supabase SQL Editor

-- 1. Add system_prompt to campaigns (per-campaign AI instructions)
alter table campaigns
  add column if not exists system_prompt text;

-- 2. Add active_campaign_id to conversations so the AI knows which
--    campaign context to use even when the user sends follow-up messages
--    that don't quote the original broadcast.
alter table conversations
  add column if not exists active_campaign_id uuid references campaigns(id) on delete set null;

create index if not exists idx_conversations_campaign on conversations(active_campaign_id);
