-- Migration: Conversation Source/Origin Tracking
-- Records the ORIGINAL source that created each conversation:
--   'campaign'  → started from a broadcast template reply
--   'iq_setter' → started from the IQ Setter webhook
--   'direct'    → unsolicited inbound message
-- Run this in Supabase SQL Editor.

alter table conversations
  add column if not exists source_type text
    check (source_type in ('campaign', 'iq_setter', 'direct')),
  add column if not exists source_lead_id uuid references leads(id) on delete set null,
  add column if not exists source_campaign_id uuid references campaigns(id) on delete set null;

create index if not exists idx_conversations_source_type on conversations(source_type);

-- ============================================================
-- Backfill existing rows
-- Order matters: IQ Setter first (it creates the conversation
-- inline), then Campaign (only if no lead matches), then Direct.
-- ============================================================

-- 1. IQ Setter origin: earliest lead row whose created_at is at or
--    just before the conversation's own creation timestamp.
update conversations c
   set source_type = 'iq_setter',
       source_lead_id = l.id
  from (
    select distinct on (phone) id, phone, created_at
    from leads
    order by phone, created_at asc
  ) l
 where c.source_type is null
   and c.phone = l.phone
   and l.created_at <= c.created_at + interval '60 seconds';

-- 2. Campaign origin: earliest campaign_recipient sent to this
--    phone before the conversation existed.
update conversations c
   set source_type = 'campaign',
       source_campaign_id = r.campaign_id
  from (
    select distinct on (phone) phone, campaign_id, created_at
    from campaign_recipients
    where status in ('sent', 'delivered', 'read')
    order by phone, created_at asc
  ) r
 where c.source_type is null
   and c.phone = r.phone
   and r.created_at <= c.created_at;

-- 3. Everything else = direct
update conversations
   set source_type = 'direct'
 where source_type is null;
