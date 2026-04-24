-- Run this in Supabase SQL Editor to set up the database

create table conversations (
  id uuid default gen_random_uuid() primary key,
  phone text unique not null,
  name text,
  mode text not null default 'agent' check (mode in ('agent', 'human')),
  updated_at timestamp with time zone default now(),
  created_at timestamp with time zone default now()
);

create table messages (
  id uuid default gen_random_uuid() primary key,
  conversation_id uuid references conversations(id) on delete cascade not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  whatsapp_msg_id text unique,
  created_at timestamp with time zone default now()
);

create index idx_messages_conversation on messages(conversation_id);
create index idx_conversations_updated on conversations(updated_at desc);

-- Enable Realtime for the dashboard
alter publication supabase_realtime add table messages;
alter publication supabase_realtime add table conversations;

-- Campaigns feature
create table campaigns (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  template_name text not null,
  template_language text not null default 'en',
  status text not null default 'pending' check (status in ('pending', 'sending', 'done', 'failed')),
  total_recipients int not null default 0,
  sent_count int not null default 0,
  failed_count int not null default 0,
  created_at timestamp with time zone default now()
);

create table campaign_recipients (
  id uuid default gen_random_uuid() primary key,
  campaign_id uuid references campaigns(id) on delete cascade not null,
  phone text not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  error text,
  created_at timestamp with time zone default now()
);

create index idx_campaign_recipients_campaign on campaign_recipients(campaign_id);

-- Settings (single-row config table)
create table settings (
  id int primary key default 1 check (id = 1),
  system_prompt text not null default '',
  ai_model text not null default 'gpt-4o-mini',
  temperature numeric(3,2) not null default 0.7,
  max_context_messages int not null default 20,
  auto_reply_enabled boolean not null default true,
  default_conversation_mode text not null default 'agent' check (default_conversation_mode in ('agent', 'human')),
  agent_name text not null default 'Pallavi',
  updated_at timestamp with time zone default now()
);

-- User management (RBAC)
create table app_users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  role text not null default 'user' check (role in ('superadmin', 'user')),
  allowed_features text[] not null default '{}',
  allowed_phones text[] not null default '{}',
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Seed superadmin row (run after creating the auth user for admin@uniselrealty.com)
-- insert into app_users (id, email, role, allowed_features, allowed_phones)
-- values ('<auth-user-uuid>', 'admin@uniselrealty.com', 'superadmin', '{"dashboard","campaigns","settings","admin"}', '{}');

-- ============================================================
-- Campaign Reporting & Tracking (run this migration)
-- ============================================================

-- Add delivery status tracking to campaign_recipients
alter table campaign_recipients
  add column if not exists whatsapp_msg_id text,
  add column if not exists delivered_at timestamp with time zone,
  add column if not exists read_at timestamp with time zone,
  add column if not exists replied_at timestamp with time zone,
  drop constraint if exists campaign_recipients_status_check;

alter table campaign_recipients
  add constraint campaign_recipients_status_check
  check (status in ('pending', 'sent', 'delivered', 'read', 'failed'));

create index if not exists idx_campaign_recipients_wamid on campaign_recipients(whatsapp_msg_id);

-- Add report summary columns to campaigns
alter table campaigns
  add column if not exists delivered_count int not null default 0,
  add column if not exists read_count int not null default 0,
  add column if not exists replied_count int not null default 0,
  add column if not exists has_buttons boolean not null default false,
  add column if not exists template_buttons jsonb;

-- Add campaign_id to messages so we can link replies back to a campaign
alter table messages
  add column if not exists campaign_id uuid references campaigns(id) on delete set null;

create index if not exists idx_messages_campaign on messages(campaign_id);

-- Media support for chat messages
alter table messages
  add column if not exists media_url text,
  add column if not exists media_type text;

-- ============================================================
-- Queued broadcast worker (split dispatch from sending)
-- ============================================================

-- Persist template config so worker can render per-recipient
alter table campaigns
  add column if not exists template_params jsonb,
  add column if not exists header_image_url text,
  add column if not exists template_body text;

-- Track last send attempt for retry/stale detection
alter table campaign_recipients
  add column if not exists attempt_count int not null default 0,
  add column if not exists last_attempt_at timestamp with time zone;

-- Extend status enum to include transient 'sending' (claimed by worker)
alter table campaign_recipients
  drop constraint if exists campaign_recipients_status_check;
alter table campaign_recipients
  add constraint campaign_recipients_status_check
  check (status in ('pending', 'sending', 'sent', 'delivered', 'read', 'failed'));

create index if not exists idx_campaign_recipients_pending
  on campaign_recipients(status, campaign_id)
  where status = 'pending';

-- Atomic claim: mark N pending rows as 'sending' and return them.
-- Uses FOR UPDATE SKIP LOCKED so concurrent workers can't grab the same row.
create or replace function claim_pending_recipients(p_limit int)
returns table(id uuid, campaign_id uuid, phone text)
language plpgsql as $$
begin
  return query
  with claimed as (
    select r.id
    from campaign_recipients r
    where r.status = 'pending'
    order by r.created_at
    limit p_limit
    for update skip locked
  )
  update campaign_recipients r
     set status = 'sending',
         attempt_count = coalesce(r.attempt_count, 0) + 1,
         last_attempt_at = now()
    from claimed
   where r.id = claimed.id
  returning r.id, r.campaign_id, r.phone;
end;
$$;

-- Recover rows stuck in 'sending' longer than N seconds (crashed worker)
create or replace function reclaim_stuck_sending(p_older_than_seconds int default 120)
returns int language plpgsql as $$
declare
  n int;
begin
  update campaign_recipients
     set status = 'pending'
   where status = 'sending'
     and last_attempt_at < now() - make_interval(secs => p_older_than_seconds);
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Atomic counter increments (avoid lost-update races from webhooks)
create or replace function increment_campaign_counter(
  p_campaign_id uuid,
  p_column text,
  p_delta int default 1
) returns void language plpgsql as $$
begin
  execute format(
    'update campaigns set %I = coalesce(%I, 0) + $1 where id = $2',
    p_column, p_column
  ) using p_delta, p_campaign_id;
end;
$$;

-- IQ Setter leads
CREATE TABLE IF NOT EXISTS leads (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id         TEXT NOT NULL,
  phone           TEXT NOT NULL,
  name            TEXT NOT NULL,
  lead_source     TEXT NOT NULL,
  lead_type       TEXT NOT NULL,
  conversation_id UUID REFERENCES conversations(id),
  template_sent   TEXT,
  status          TEXT NOT NULL DEFAULT 'received',
  error           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads(phone);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at DESC);
