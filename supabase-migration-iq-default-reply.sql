-- IQ Setter default reply sequence.
-- Separate from `direct_form_messages` so cold-lead Facebook flows can use a
-- single template with an embedded media header (delivers without an open
-- customer-care window). Falls back to direct_form_messages, then to legacy
-- hardcoded constants in the IQ Setter route.

alter table settings
  add column if not exists iq_default_messages jsonb not null default '[]'::jsonb;
