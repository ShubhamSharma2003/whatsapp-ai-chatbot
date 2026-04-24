-- AI Calling (VAPI) migration
-- Run in Supabase SQL Editor

-- Settings table (single row, id = 1)
create table ai_call_settings (
  id int primary key default 1 check (id = 1),
  vapi_api_key text not null default '',
  vapi_phone_number_id text not null default '',
  default_assistant_id text not null default '',
  max_concurrent_calls int not null default 3 check (max_concurrent_calls between 1 and 10),
  updated_at timestamp with time zone default now()
);

insert into ai_call_settings (id) values (1) on conflict do nothing;

-- Campaigns table
create table ai_call_campaigns (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  status text not null default 'draft' check (status in ('draft','running','paused','done','failed')),
  assistant_id text not null default '',
  total_recipients int not null default 0,
  called_count int not null default 0,
  answered_count int not null default 0,
  failed_count int not null default 0,
  scheduled_at timestamp with time zone,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Recipients table
create table ai_call_recipients (
  id uuid default gen_random_uuid() primary key,
  campaign_id uuid references ai_call_campaigns(id) on delete cascade not null,
  phone text not null,
  name text not null default '',
  status text not null default 'pending' check (status in ('pending','calling','completed','failed','scheduled')),
  vapi_call_id text,
  scheduled_at timestamp with time zone,
  started_at timestamp with time zone,
  ended_at timestamp with time zone,
  duration_seconds int,
  ended_reason text,
  retry_count int not null default 0,
  error text,
  created_at timestamp with time zone default now()
);

create index idx_ai_call_recipients_campaign on ai_call_recipients(campaign_id);
create index idx_ai_call_recipients_pending on ai_call_recipients(status) where status = 'pending';
create index idx_ai_call_recipients_vapi_call_id on ai_call_recipients(vapi_call_id);

-- Transcripts table
create table ai_call_transcripts (
  id uuid default gen_random_uuid() primary key,
  recipient_id uuid references ai_call_recipients(id) on delete cascade not null unique,
  campaign_id uuid references ai_call_campaigns(id) on delete cascade not null,
  messages jsonb not null default '[]',
  recording_url text,
  summary text,
  success_evaluation text,
  cost_total numeric(10,4) not null default 0,
  cost_breakdown jsonb not null default '{}',
  created_at timestamp with time zone default now()
);

-- Enable Realtime
alter publication supabase_realtime add table ai_call_campaigns;
alter publication supabase_realtime add table ai_call_recipients;

-- Atomic claim function (across all running campaigns)
create or replace function claim_pending_call_recipients(p_limit int)
returns table(id uuid, campaign_id uuid, phone text, name text, scheduled_at timestamp with time zone)
language plpgsql
as $$
begin
  return query
  update ai_call_recipients r
  set status = 'calling'
  from (
    select r2.id
    from ai_call_recipients r2
    join ai_call_campaigns c on c.id = r2.campaign_id
    where r2.status = 'pending'
      and c.status = 'running'
      and (c.scheduled_at is null or c.scheduled_at <= now())
      and (r2.scheduled_at is null or r2.scheduled_at <= now())
    order by r2.created_at
    limit p_limit
    for update of r2 skip locked
  ) sub
  where r.id = sub.id
  returning r.id, r.campaign_id, r.phone, r.name, r.scheduled_at;
end;
$$;

-- Atomic counter increment
create or replace function increment_ai_call_counter(p_campaign_id uuid, p_column text, p_delta int)
returns void
language plpgsql
as $$
begin
  if p_column not in ('called_count', 'answered_count', 'failed_count') then
    raise exception 'invalid column: %', p_column;
  end if;
  execute format(
    'update ai_call_campaigns set %I = %I + $1, updated_at = now() where id = $2',
    p_column, p_column
  ) using p_delta, p_campaign_id;
end;
$$;
