create extension if not exists "pgcrypto";

create table if not exists snapshots (
  id uuid primary key default gen_random_uuid(),
  "order" int not null default 0,
  kicker text not null,
  title text not null,
  subtitle text,
  meta_primary text,
  meta_secondary text,
  updated_at timestamptz not null default now()
);

create table if not exists trending_topics (
  id uuid primary key default gen_random_uuid(),
  rank int not null default 0,
  category text not null,
  title text not null,
  description text,
  badge_label text,
  badge_tone text,
  trend_note text,
  yes_label text default 'Ramro',
  no_label text default 'Naramro',
  votes_yes int not null default 0,
  votes_no int not null default 0,
  likes int not null default 0,
  comments int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists popular_topics (
  id uuid primary key default gen_random_uuid(),
  rank int not null default 0,
  category text not null,
  title text not null,
  likes int not null default 0,
  comments int not null default 0,
  sentiment_label text,
  sentiment_tone text,
  created_at timestamptz not null default now()
);

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
  right_title text not null,
  right_desc text,
  right_votes int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists experiences (
  id uuid primary key default gen_random_uuid(),
  topic text not null,
  verdict text not null,
  categories text[] default '{}',
  body text not null,
  author_name text not null,
  author_initials text not null,
  user_id text,
  love_count int not null default 0,
  reply_count int not null default 0,
  created_at timestamptz not null default now()
);

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

create index if not exists idx_snapshots_order on snapshots("order");
create index if not exists idx_trending_rank on trending_topics(rank);
create index if not exists idx_popular_rank on popular_topics(rank);
create index if not exists idx_featured_slot on featured_stories(slot);
create index if not exists idx_battles_order on battles("order");
create index if not exists idx_experiences_created on experiences(created_at desc);
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
  created_at timestamptz not null default now()
);

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
