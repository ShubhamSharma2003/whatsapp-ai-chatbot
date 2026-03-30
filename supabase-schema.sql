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
