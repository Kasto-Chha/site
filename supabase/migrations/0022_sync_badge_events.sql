-- KastoChha Sync: the website badge becomes part of Sync.
--
-- 1. The badge reports three things, counted against the business whose site it sits on:
--    the popup being opened, and a click on each of its two links. They join the events the
--    hub already records.
--
-- 2. The old badge was approved by name, from the badge_businesses table. The badge now
--    belongs to a business tagged in Sync, so that table is no longer read by anything. Its
--    public-read policy is removed so the list of names stops being readable with the public
--    key. The table itself is left alone: drop it by hand once you are sure it holds nothing
--    you want (`drop table public.badge_businesses;`).
--
-- Idempotent: the migration runner re-runs every file.

alter table public.sync_events drop constraint if exists sync_events_type_check;
alter table public.sync_events add constraint sync_events_type_check check (event_type in (
  'scan', 'hub_share', 'hub_google', 'hub_ask', 'hub_note', 'hub_maps',
  'post_created', 'google_copy',
  'badge_open', 'badge_share', 'badge_ask'
));

do $$
begin
  if to_regclass('public.badge_businesses') is not null then
    drop policy if exists "public read" on public.badge_businesses;
  end if;
end $$;
