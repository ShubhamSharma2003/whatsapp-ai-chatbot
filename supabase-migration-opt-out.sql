-- Opt-out support: when user replies STOP/UNSUBSCRIBE etc, mark conversation
-- so webhook + IQ Setter skip all auto-sends. Audit trail preserved.

alter table conversations
  add column if not exists opted_out boolean not null default false,
  add column if not exists opted_out_at timestamptz;

create index if not exists idx_conversations_opted_out
  on conversations(opted_out)
  where opted_out = true;

-- Allow leads.status to reflect opt-out skip (no enum constraint exists today,
-- but document the new value for future readers).
-- Possible values: received, template_sent, failed, opted_out_skipped
