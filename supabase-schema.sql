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
