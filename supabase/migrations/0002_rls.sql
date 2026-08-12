-- 0002_rls.sql
-- Lock down direct PostgREST access with Row Level Security, and make vote
-- counting atomic.
--
-- Every read/write in this app goes through the server using the service-role
-- key, which BYPASSES RLS. The public "publishable"/anon key (which ships in the
-- browser) was previously able to read AND write these tables directly via
-- PostgREST because RLS was disabled. Enabling RLS closes that hole without
-- touching any server route. Idempotent — safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. Public display tables: anyone may SELECT (this matches what the site
--    already shows publicly), but there is NO insert/update/delete policy, so
--    writes are only possible via the server (service role).
-- ---------------------------------------------------------------------------
-- The blog_* entries are legacy: the blog was removed from the app and newer
-- databases never get those tables, so each name is skipped when absent.
do $$
declare t text;
begin
  foreach t in array array[
    'trending_topics','battles','reels','featured_stories','site_stats',
    'blog_tags','blog_categories','blog_post_tags','blog_post_categories'
  ] loop
    if to_regclass(format('public.%I', t)) is null then
      continue;
    end if;
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "public read" on public.%I', t);
    execute format('create policy "public read" on public.%I for select using (true)', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Tables holding user identifiers or private signal: enable RLS with NO
--    policy at all, so the anon/publishable key gets ZERO access. These are
--    only ever read/written by the server (service role), which bypasses RLS.
--      reviews, questions  -> carry user_id
--      author_profiles     -> carries user_id + contact links
--      chat_queries        -> per-user chat text
--      user_votes          -> per-user voting ledger
-- ---------------------------------------------------------------------------
alter table public.reviews         enable row level security;
alter table public.questions       enable row level security;
alter table public.author_profiles enable row level security;
alter table public.user_votes      enable row level security;

-- chat_queries was replaced by chat_topics/chat_messages in 0004, which locks
-- the replacements down the same way. Guarded so this migration still replays
-- on a database built from the current schema.sql, where it never existed.
do $$
begin
  if to_regclass('public.chat_queries') is not null then
    execute 'alter table public.chat_queries enable row level security';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Atomic vote counters. The old routes did read-modify-write, which loses
--    increments under concurrency. These functions increment in a single
--    statement and return the updated row. They are SECURITY INVOKER, so they
--    run with the caller's privileges — and execute is granted ONLY to the
--    service role so the anon key can't call them over /rest/v1/rpc to stuff
--    votes. The per-user user_votes unique constraint still gates duplicates.
-- ---------------------------------------------------------------------------
create or replace function public.increment_trending_vote(p_id uuid, p_side text)
returns public.trending_topics
language sql
as $$
  update public.trending_topics set
    votes_yes  = votes_yes + (p_side = 'yes')::int,
    votes_mid  = votes_mid + (p_side = 'mid')::int,
    votes_no   = votes_no  + (p_side = 'no')::int,
    updated_at = now()
  where id = p_id
  returning *;
$$;

create or replace function public.increment_battle_vote(p_id uuid, p_side text)
returns public.battles
language sql
as $$
  update public.battles set
    left_votes  = left_votes  + (p_side = 'a')::int,
    right_votes = right_votes + (p_side = 'b')::int
  where id = p_id
  returning *;
$$;

create or replace function public.increment_review_vote(p_id uuid, p_direction text)
returns public.reviews
language sql
as $$
  update public.reviews set
    upvotes   = upvotes   + (p_direction = 'up')::int,
    downvotes = downvotes + (p_direction = 'down')::int
  where id = p_id
  returning *;
$$;

revoke all on function public.increment_trending_vote(uuid, text) from public;
revoke all on function public.increment_battle_vote(uuid, text)   from public;
revoke all on function public.increment_review_vote(uuid, text)   from public;

grant execute on function public.increment_trending_vote(uuid, text) to service_role;
grant execute on function public.increment_battle_vote(uuid, text)   to service_role;
grant execute on function public.increment_review_vote(uuid, text)   to service_role;
