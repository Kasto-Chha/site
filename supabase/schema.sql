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

create table if not exists chat_queries (
  id uuid primary key default gen_random_uuid(),
  query text not null,
  response text,
  user_id text,
  created_at timestamptz not null default now()
);

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

create table if not exists blog_posts (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  excerpt text,
  content text not null,
  status text not null default 'draft',
  cover_image_url text,
  author_user_id text not null,
  author_name text,
  reading_time int,
  seo_title text,
  seo_description text,
  seo_image_url text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists blog_tags (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique
);

create table if not exists blog_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique
);

create table if not exists blog_post_tags (
  post_id uuid references blog_posts(id) on delete cascade,
  tag_id uuid references blog_tags(id) on delete cascade,
  primary key (post_id, tag_id)
);

create table if not exists blog_post_categories (
  post_id uuid references blog_posts(id) on delete cascade,
  category_id uuid references blog_categories(id) on delete cascade,
  primary key (post_id, category_id)
);

create table if not exists blog_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references blog_posts(id) on delete cascade,
  author_user_id text not null,
  author_name text,
  body text not null,
  status text not null default 'published',
  created_at timestamptz not null default now(),
  -- Stamped when the author edits their comment; null means never edited.
  updated_at timestamptz
);

alter table blog_comments add column if not exists updated_at timestamptz;

create index if not exists idx_blog_posts_status on blog_posts(status);
create index if not exists idx_blog_posts_published on blog_posts(published_at desc);
create index if not exists idx_blog_posts_author on blog_posts(author_user_id);
create index if not exists idx_blog_comments_post on blog_comments(post_id);

alter table blog_posts enable row level security;
alter table blog_comments enable row level security;

create policy "public read published posts" on blog_posts
  for select
  using (status = 'published');

create policy "public read published comments" on blog_comments
  for select
  using (status = 'published');

create policy "authenticated insert comments" on blog_comments
  for insert
  with check (auth.role() = 'authenticated');

-- Row Level Security for the rest of the schema. The app reads/writes everything
-- through the server (service-role key, which bypasses RLS); this only blocks
-- the public anon/publishable key from touching tables directly via PostgREST.
-- See supabase/migrations/0002_rls.sql for the full rationale.

-- Public display tables: anyone may read, nobody may write via the anon key.
do $$
declare t text;
begin
  foreach t in array array[
    'trending_topics','battles','reels','featured_stories','site_stats',
    'blog_tags','blog_categories','blog_post_tags','blog_post_categories'
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
alter table public.chat_queries    enable row level security;
alter table public.user_votes      enable row level security;

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
