-- One-shot backfill: flag conversations whose users already replied STOP
-- (or other opt-out keywords) before opt-out support was deployed.
-- Safe to re-run: only updates rows where opted_out is still false.
--
-- Match rule: lowercase, strip non-alphanumeric/space chars, then trim.
-- Matched keywords: stop, unsubscribe, cancel, end, quit, stop all.
-- Keep this list aligned with OPT_OUT_KEYWORDS in webhook/route.ts.

-- 1. Preview which conversations will be flagged (run first to sanity-check)
select c.id,
       c.phone,
       c.name,
       m.first_stop_at,
       m.stop_message
  from conversations c
  join (
    select conversation_id,
           min(created_at) as first_stop_at,
           (array_agg(content order by created_at))[1] as stop_message
      from messages
     where role = 'user'
       and trim(regexp_replace(lower(content), '[^a-z0-9 ]+', '', 'g'))
           in ('stop', 'unsubscribe', 'cancel', 'end', 'quit', 'stop all')
     group by conversation_id
  ) m on m.conversation_id = c.id
 where c.opted_out = false
 order by m.first_stop_at desc;

-- 2. Apply the flag (uncomment to run after preview looks correct)
-- update conversations c
--    set opted_out = true,
--        opted_out_at = m.first_stop_at,
--        mode = 'human'
--   from (
--     select conversation_id, min(created_at) as first_stop_at
--       from messages
--      where role = 'user'
--        and trim(regexp_replace(lower(content), '[^a-z0-9 ]+', '', 'g'))
--            in ('stop', 'unsubscribe', 'cancel', 'end', 'quit', 'stop all')
--      group by conversation_id
--   ) m
--  where c.id = m.conversation_id
--    and c.opted_out = false;

-- 3. Also mark any pending IQ Setter leads for these phones as opted_out_skipped
--    so a stuck retry queue doesn't fire templates. (uncomment to run)
-- update leads l
--    set status = 'opted_out_skipped'
--   from conversations c
--  where c.phone = l.phone
--    and c.opted_out = true
--    and l.status in ('received', 'failed');
