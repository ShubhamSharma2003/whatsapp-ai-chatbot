-- Migration: Direct-form auto-reply trigger
-- When source_type='direct' and a new conversation's first inbound message
-- contains a configured phrase (default: Meta lead-form preamble), webhook
-- fires a defined sequence of messages (template / text / media) before AI
-- auto-reply continues normally.
--
-- Run in Supabase SQL Editor.

alter table settings
  add column if not exists direct_form_trigger_enabled boolean not null default false,
  add column if not exists direct_form_trigger_phrase text not null default
    'Hello! I filled out your form and would like to know more about your business.',
  -- Ordered jsonb array of messages to send. Each item is one of:
  --   {"type":"template","template_name":"...","template_language":"en",
  --    "header_image_url":"...","body_text":"...","body_params":[...]}
  --   {"type":"text","text":"..."}
  --   {"type":"media","url":"...","mime":"...","filename":"...","caption":"..."}
  add column if not exists direct_form_messages jsonb not null default '[]'::jsonb;

-- Optional: stamp on the conversation so we don't double-fire if Meta retries
-- the webhook before our insert commits.
alter table conversations
  add column if not exists direct_form_template_sent_at timestamptz;

-- Storage bucket for direct-form attachments (separate from campaign-images).
insert into storage.buckets (id, name, public)
  values ('direct-form-attachments', 'direct-form-attachments', true)
  on conflict (id) do nothing;

-- Public read so WhatsApp Cloud API can fetch the link.
-- Uses pg_policies (system catalog, always present) for existence check.
do $$
begin
  if not exists (
    select 1
      from pg_policies
     where schemaname = 'storage'
       and tablename  = 'objects'
       and policyname = 'Public read direct-form-attachments'
  ) then
    create policy "Public read direct-form-attachments"
      on storage.objects for select
      using (bucket_id = 'direct-form-attachments');
  end if;
end $$;
