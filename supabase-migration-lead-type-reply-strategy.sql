-- Per-row reply strategy on lead_type_templates.
-- 'lead_type' (default) → send this row's template/brochure/extra_info sequence.
-- 'direct_form' → defer to the global direct-form config for this lead.
-- Lets specific lead_types (e.g. GODREJ GCR LS) keep custom templates while
-- everything else falls back to the shared direct-form sequence.

alter table lead_type_templates
  add column if not exists reply_strategy text not null default 'lead_type'
    check (reply_strategy in ('lead_type', 'direct_form'));
