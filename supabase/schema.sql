create extension if not exists "pgcrypto";

create table if not exists trending_topics (
  id uuid primary key default gen_random_uuid(),
  rank int not null default 0,
  category text not null,
  title text not null,
  description text,
  badge_label text,
  badge_tone text,
  trend_note text,
  yes_label text default 'Thik Chha',
  mid_label text default 'Thikai Chha',
  no_label text default 'Thik Chhaina',
  votes_yes int not null default 0,
  votes_mid int not null default 0,
  votes_no int not null default 0,
  likes int not null default 0,
  comments int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Backfill the neutral ("Thikai Chha") poll option for existing databases.
alter table trending_topics add column if not exists votes_mid int not null default 0;
alter table trending_topics add column if not exists mid_label text default 'Thikai Chha';

create table if not exists featured_stories (
  id uuid primary key default gen_random_uuid(),
  slot text not null,
  title text not null,
  description text,
  why_text text,
  link_url text,
  icon text,
  created_at timestamptz not null default now()
);

create table if not exists battles (
  id uuid primary key default gen_random_uuid(),
  "order" int not null default 0,
  category text not null,
  left_title text not null,
  left_desc text,
  left_votes int not null default 0,
  left_color text,
  left_image text,
  right_title text not null,
  right_desc text,
  right_votes int not null default 0,
  right_color text,
  right_image text,
  created_at timestamptz not null default now()
);

-- Optional split-screen styling for existing databases (gradient colours or
-- product photos per side); both fall back to brand colours when null.
alter table battles add column if not exists left_color text;
alter table battles add column if not exists left_image text;
alter table battles add column if not exists right_color text;
alter table battles add column if not exists right_image text;

create table if not exists reels (
  id uuid primary key default gen_random_uuid(),
  "order" int not null default 0,
  tag text not null,
  title text not null,
  handle text,
  accent text,
  video_url text,
  channel_url text,
  created_at timestamptz not null default now()
);

create index if not exists idx_reels_order on reels("order");

create table if not exists reviews (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  topic text,
  topic_slug text,
  title text not null,
  summary text not null,
  verdict text,
  upvotes int not null default 0,
  downvotes int not null default 0,
  author_name text not null,
  comment_count int not null default 0,
  user_id text,
  created_at timestamptz not null default now()
);

-- Backfill / add the grouping slug for existing databases.
alter table reviews add column if not exists topic_slug text;

create table if not exists questions (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  category text,
  user_id text,
  created_at timestamptz not null default now()
);

-- Chat is a two-level tree: a user owns conversations (chat_topics) and every
-- turn (chat_messages) hangs off one conversation. A null user_id on a topic
-- means an anonymous trial visitor — still threaded, just unowned. See
-- supabase/migrations/0004_chat_topics.sql for the full rationale.
create table if not exists chat_topics (
  id uuid primary key default gen_random_uuid(),
  user_id text,
  title text not null,
  message_count int not null default 0,
  last_message_at timestamptz not null default now(),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references chat_topics(id) on delete cascade,
  -- Copied from the parent so per-user sweeps never need a join.
  user_id text,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

-- Assistant usage, counted apart from the conversation it produced. Deleting
-- your chat history must not also delete the record that you used your quota,
-- and a guest has no user_id to count against — so this is keyed by an opaque
-- identity ('user:<clerk id>' or 'ip:<sha256>') and cascaded from nothing. See
-- supabase/migrations/0013_chat_usage_ledger.sql for the full rationale.
create table if not exists chat_usage (
  id uuid primary key default gen_random_uuid(),
  identity text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_chat_topics_user on chat_topics(user_id, last_message_at desc);
create index if not exists idx_chat_topics_created on chat_topics(created_at desc);
create index if not exists idx_chat_messages_topic on chat_messages(topic_id, created_at);
create index if not exists idx_chat_messages_user on chat_messages(user_id, created_at desc);
create index if not exists idx_chat_usage_identity on chat_usage(identity, created_at desc);

-- Indexed title search for the sidebar; falls back to a scan without pg_trgm.
do $$
begin
  create extension if not exists pg_trgm;
  create index if not exists idx_chat_topics_title_trgm
    on public.chat_topics using gin (title gin_trgm_ops);
exception when others then
  raise notice 'pg_trgm unavailable — chat title search falls back to a scan';
end $$;

-- Keeps message_count / last_message_at on the parent correct. Messages are
-- only deleted with their topic (cascade), so insert is the only event.
create or replace function public.touch_chat_topic()
returns trigger
language plpgsql
as $$
begin
  update public.chat_topics set
    message_count = message_count + 1,
    last_message_at = greatest(last_message_at, new.created_at),
    updated_at = now()
  where id = new.topic_id;
  return new;
end;
$$;

drop trigger if exists trg_chat_messages_touch_topic on public.chat_messages;
create trigger trg_chat_messages_touch_topic
  after insert on public.chat_messages
  for each row execute function public.touch_chat_topic();

create table if not exists site_stats (
  id uuid primary key default gen_random_uuid(),
  "order" int not null default 0,
  label text not null,
  value text not null
);

-- One row per (user, thing voted on). The unique constraint is what prevents
-- a signed-in user from stuffing the counters by replaying vote requests.
create table if not exists user_votes (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  target_type text not null,
  target_id uuid not null,
  value text not null,
  created_at timestamptz not null default now(),
  unique (user_id, target_type, target_id)
);

create index if not exists idx_user_votes_target on user_votes(target_type, target_id);
-- Every page load asks "what has this user already voted on?".
create index if not exists idx_user_votes_user on user_votes(user_id, target_type);

create index if not exists idx_trending_rank on trending_topics(rank);
create index if not exists idx_featured_slot on featured_stories(slot);
create index if not exists idx_battles_order on battles("order");
create index if not exists idx_reviews_created on reviews(created_at desc);
create index if not exists idx_reviews_topic_slug on reviews(topic_slug);

create table if not exists author_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id text not null unique,
  display_name text,
  bio text,
  avatar_url text,
  title text,
  links jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The blog (blog_posts, blog_comments, blog_tags, blog_categories and their
-- join tables) was removed from KastoChha. Existing databases keep whatever
-- rows they had — nothing in the app reads or writes them any more — but a new
-- database is no longer given the tables. Drop them when you no longer want the
-- data.

-- Row Level Security for the rest of the schema. The app reads/writes everything
-- through the server (service-role key, which bypasses RLS); this only blocks
-- the public anon/publishable key from touching tables directly via PostgREST.
-- See supabase/migrations/0002_rls.sql for the full rationale.

-- Public display tables: anyone may read, nobody may write via the anon key.
do $$
declare t text;
begin
  foreach t in array array[
    'trending_topics','battles','reels','featured_stories','site_stats'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "public read" on public.%I', t);
    execute format('create policy "public read" on public.%I for select using (true)', t);
  end loop;
end $$;

-- Tables with user identifiers / private signal: RLS on, no policy => the anon
-- key gets no access at all; only the server (service role) can touch them.
alter table public.reviews         enable row level security;
alter table public.questions       enable row level security;
alter table public.author_profiles enable row level security;
alter table public.chat_topics     enable row level security;
alter table public.chat_messages   enable row level security;
alter table public.chat_usage      enable row level security;
alter table public.user_votes      enable row level security;

-- Check both assistant windows and reserve a slot, atomically. The advisory
-- lock serializes callers sharing an identity, so concurrent requests cannot
-- all read the same count and all find room. Full rationale, including why the
-- quota is not counted from chat_messages any more, in migration 0013.
create or replace function public.consume_chat_quota(
  p_identity text,
  p_day_limit int,
  p_burst_limit int,
  p_check_burst boolean default false
)
returns table (allowed boolean, remaining int, scope text, retry_after int)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_day_used int;
  v_burst_used int;
  v_oldest timestamptz;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_identity, 0));

  -- Rows outside the widest window can never change an answer again.
  delete from public.chat_usage
   where identity = p_identity
     and created_at < now() - interval '24 hours';

  select count(*) into v_day_used
    from public.chat_usage where identity = p_identity;

  if v_day_used >= p_day_limit then
    select min(created_at) into v_oldest
      from public.chat_usage where identity = p_identity;
    return query select false, 0, 'day'::text,
      greatest(1, ceil(extract(epoch from
        (v_oldest + interval '24 hours' - now())))::int);
    return;
  end if;

  if p_check_burst then
    select count(*), min(created_at) into v_burst_used, v_oldest
      from public.chat_usage
     where identity = p_identity
       and created_at >= now() - interval '1 minute';

    if v_burst_used >= p_burst_limit then
      return query select false, p_day_limit - v_day_used, 'burst'::text,
        greatest(1, ceil(extract(epoch from
          (v_oldest + interval '1 minute' - now())))::int);
      return;
    end if;
  end if;

  insert into public.chat_usage (identity) values (p_identity);
  return query select true, p_day_limit - v_day_used - 1, null::text, 0;
end;
$$;

-- The limits are arguments, so anyone able to call this could simply ask for a
-- bigger one. Same posture as the vote counters above: revoked from public,
-- granted only to the service role, so it is reachable from our server and not
-- over /rest/v1/rpc with the publishable key.
revoke all on function public.consume_chat_quota(text, int, int, boolean) from public;
grant execute on function public.consume_chat_quota(text, int, int, boolean) to service_role;

-- Atomic vote counters (see migration 0003 for details). p_old is the user's
-- previous choice and p_new their new one, so a single statement can move both
-- counters when a vote is changed, and only decrement when one is withdrawn
-- (p_new = ''). Execute is granted only to the service role so the anon key
-- cannot call them over /rest/v1/rpc.
create or replace function public.apply_trending_vote(p_id uuid, p_old text, p_new text)
returns public.trending_topics
language sql
as $$
  update public.trending_topics set
    votes_yes = greatest(0, votes_yes
      + (coalesce(p_new, '') = 'yes')::int - (coalesce(p_old, '') = 'yes')::int),
    votes_mid = greatest(0, votes_mid
      + (coalesce(p_new, '') = 'mid')::int - (coalesce(p_old, '') = 'mid')::int),
    votes_no  = greatest(0, votes_no
      + (coalesce(p_new, '') = 'no')::int  - (coalesce(p_old, '') = 'no')::int),
    updated_at = now()
  where id = p_id
  returning *;
$$;

create or replace function public.apply_battle_vote(p_id uuid, p_old text, p_new text)
returns public.battles
language sql
as $$
  update public.battles set
    left_votes = greatest(0, left_votes
      + (coalesce(p_new, '') = 'a')::int - (coalesce(p_old, '') = 'a')::int),
    right_votes = greatest(0, right_votes
      + (coalesce(p_new, '') = 'b')::int - (coalesce(p_old, '') = 'b')::int)
  where id = p_id
  returning *;
$$;

create or replace function public.apply_review_vote(p_id uuid, p_old text, p_new text)
returns public.reviews
language sql
as $$
  update public.reviews set
    upvotes = greatest(0, upvotes
      + (coalesce(p_new, '') = 'up')::int - (coalesce(p_old, '') = 'up')::int),
    downvotes = greatest(0, downvotes
      + (coalesce(p_new, '') = 'down')::int - (coalesce(p_old, '') = 'down')::int)
  where id = p_id
  returning *;
$$;

revoke all on function public.apply_trending_vote(uuid, text, text) from public;
revoke all on function public.apply_battle_vote(uuid, text, text)   from public;
revoke all on function public.apply_review_vote(uuid, text, text)   from public;

grant execute on function public.apply_trending_vote(uuid, text, text) to service_role;
grant execute on function public.apply_battle_vote(uuid, text, text)   to service_role;
grant execute on function public.apply_review_vote(uuid, text, text)   to service_role;
