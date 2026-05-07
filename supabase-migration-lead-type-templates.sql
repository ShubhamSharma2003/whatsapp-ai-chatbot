-- Migration: Lead Type Templates
-- Per-lead-type welcome flow: WhatsApp template + brochure + extra info + AI knowledge.
-- Run this in Supabase SQL Editor.

create table if not exists lead_type_templates (
  id                       uuid primary key default gen_random_uuid(),
  lead_type                text unique not null,
  display_name             text not null,
  enabled                  boolean not null default true,
  is_default               boolean not null default false,
  -- Welcome template (Meta-approved)
  template_name            text not null,
  template_language        text not null default 'en',
  template_header_image_url text,
  template_body_text       text not null default '',
  -- Ordered jsonb array describing how to fill body params per lead.
  -- Each item: {"type":"name"} | {"type":"literal","value":"..."} | {"type":"body_text"}
  template_body_params     jsonb not null default '[]'::jsonb,
  -- Brochure (sent as second message)
  brochure_url             text,
  brochure_filename        text,
  brochure_mime            text,
  brochure_caption         text,
  -- Extra info (sent as third message, plain text)
  extra_info_text          text,
  -- AI knowledge for this lead type
  system_prompt            text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

-- Only one row may be marked default
create unique index if not exists lead_type_templates_one_default
  on lead_type_templates (is_default) where is_default = true;

create index if not exists idx_lead_type_templates_enabled
  on lead_type_templates(enabled);

-- Track which template config produced this lead's send (for analytics + AI lookup)
alter table leads
  add column if not exists lead_type_template_id uuid references lead_type_templates(id) on delete set null;

-- Denormalize lead_type onto conversation for fast AI lookup on inbound replies
alter table conversations
  add column if not exists active_lead_type text;

create index if not exists idx_conversations_lead_type on conversations(active_lead_type);

-- Allow 'partial' status on leads for cases where template sent but brochure/extra failed
alter table leads
  drop constraint if exists leads_status_check;
-- (No previous CHECK existed in schema; status is free text. Keep it that way to stay flexible.)

-- Backfill: set conversations.active_lead_type from leads where source_type='iq_setter'
update conversations c
   set active_lead_type = l.lead_type
  from leads l
 where c.id = l.conversation_id
   and c.source_type = 'iq_setter'
   and c.active_lead_type is null;

-- updated_at touch trigger
create or replace function touch_lead_type_templates_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_lead_type_templates_touch on lead_type_templates;
create trigger trg_lead_type_templates_touch
  before update on lead_type_templates
  for each row execute function touch_lead_type_templates_updated_at();
