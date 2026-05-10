-- Migration: Add 'website' to conversations.source_type enum.
-- Triggered by inbound WhatsApp messages whose prefill text carries the
-- [#WEB] marker (set on the website's floating WhatsApp button).
-- Webhook detects marker → tags source_type='website' instead of 'direct'.

alter table conversations drop constraint if exists conversations_source_type_check;

alter table conversations
  add constraint conversations_source_type_check
  check (source_type in ('campaign', 'iq_setter', 'direct', 'website'));
