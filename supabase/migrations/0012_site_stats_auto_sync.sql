-- 0012_site_stats_auto_sync.sql
--
-- site_stats is only ever read as an emergency fallback — getLiveSiteStats()
-- in lib/supabase/queries.js computes the real numbers live on every page
-- load, and only falls back to this table if that query errors. Because
-- nothing kept it in sync, it was still sitting at its original seed value
-- (37K) while the real count was 37 — harmless today only because the
-- fallback path is rarely hit, but a real visitor would see that number the
-- moment it ever was.
--
-- This trigger recomputes all three rows from the real tables every time a
-- review or a vote is added or removed, so the fallback is never more than
-- one write behind reality, without needing a cron job or any application
-- code to remember to update it.
create or replace function sync_site_stats() returns trigger as $$
begin
  update public.site_stats
    set value = (select count(*)::text from public.reviews where kind = 'experience')
    where id = 'stat-experiences';

  update public.site_stats
    set value = (select count(*)::text from public.reviews where kind = 'question')
    where id = 'stat-questions';

  update public.site_stats
    set value = (select count(*)::text from public.user_votes)
    where id = 'stat-votes';

  return null;
end;
$$ language plpgsql security definer;

-- security definer here rather than relying on whatever role performs the
-- triggering write: tonight's own RLS audit found every review/vote insert
-- currently goes through server-side code using the service-role key, which
-- would make this unnecessary today — but a trigger tied to that assumption
-- would silently break the moment that ever changes, and site_stats has no
-- write policy for anything less privileged (by design — see 0002_rls.sql).
-- Running as the function owner makes this correct regardless of which role
-- performs the insert, now or later, rather than depending on today's
-- write path staying exactly as it is.

drop trigger if exists reviews_sync_stats on public.reviews;
create trigger reviews_sync_stats
  after insert or delete or update of kind on public.reviews
  for each statement execute function sync_site_stats();

drop trigger if exists user_votes_sync_stats on public.user_votes;
create trigger user_votes_sync_stats
  after insert or delete on public.user_votes
  for each statement execute function sync_site_stats();

-- One-time correction so the stale seed value doesn't sit there until the
-- next write happens to trigger a recompute. A trigger function can't be
-- invoked directly via SELECT — Postgres rejects that outside of an actual
-- trigger firing — so this repeats the same three updates as plain SQL
-- rather than trying to call sync_site_stats() here.
update public.site_stats
  set value = (select count(*)::text from public.reviews where kind = 'experience')
  where id = 'stat-experiences';

update public.site_stats
  set value = (select count(*)::text from public.reviews where kind = 'question')
  where id = 'stat-questions';

update public.site_stats
  set value = (select count(*)::text from public.user_votes)
  where id = 'stat-votes';
