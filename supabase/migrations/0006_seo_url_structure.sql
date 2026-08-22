-- ---------------------------------------------------------------------------
-- KastoChha migration 0006 — SEO URL structure
--
-- Everything the SEO work needs from the database, in one file. Replaces what
-- was previously six separate migrations (0006–0011).
--
-- Written against the actual live schema, not against supabase/schema.sql —
-- that file has drifted and describes a state no database is in. Verified
-- 2026-08-22 against the working project, which already has chat_categories,
-- append_chat_message, start_chat_topic, pg_trgm and RLS. None of that is
-- touched here.
--
-- WHAT THIS ADDS
--
--   reviews.updated_at            when an experience was genuinely edited
--   reviews.topic_slug            backfilled and made required (column exists)
--   featured_stories.slug         readable article URLs
--   featured_stories.updated_at   honest lastmod for the sitemap
--   featured_stories.author_name  bylines, and a real Person in the schema.org
--   trending_topics.slug          readable URLs
--   battles.slug                  "nepal-vs-uae" rather than a uuid
--
-- Plus triggers that fill slugs in automatically, and a trigger that moves
-- reviews.updated_at on content edits but never on votes.
--
-- IDEMPOTENT. Every statement is guarded. Safe to run repeatedly, and safe to
-- run on both the working project and any other environment.
--
-- NOTHING IS DELETED. Six columns, five triggers, three unique indexes.
-- ---------------------------------------------------------------------------


-- ===========================================================================
-- 1. Shared helpers
-- ===========================================================================

-- title -> slug, matching lib/slug.js: lowercase, runs of non-alphanumerics
-- collapsed to a single hyphen, no leading or trailing hyphen. Returns null
-- rather than '' when nothing survives, so callers can coalesce to a fallback.
create or replace function public.kc_slugify(input text)
returns text
language sql
immutable
as $$
  select nullif(
    btrim(regexp_replace(lower(coalesce(input, '')), '[^a-z0-9]+', '-', 'g'), '-'),
    ''
  );
$$;

-- Slugs are unique per table, so a second row with the same title would fail
-- the unique index — swapping one error for another. Append a short id fragment
-- when the derived slug is taken. Deterministic and still readable.
create or replace function public.kc_unique_slug(
  p_table text,
  p_slug  text,
  p_id    uuid
)
returns text
language plpgsql
as $$
declare
  taken boolean;
begin
  execute format(
    'select exists (select 1 from public.%I where slug = $1 and id <> $2)',
    p_table
  )
  into taken
  using p_slug, p_id;

  if taken then
    return p_slug || '-' || left(p_id::text, 6);
  end if;

  return p_slug;
end;
$$;


-- ===========================================================================
-- 2. reviews — topic_slug required, updated_at added
-- ===========================================================================

-- The column already exists on the working project; guarded for any that lack it.
alter table public.reviews add column if not exists topic_slug text;

-- Discussion URLs are keyed on topic_slug, so a row without one has no
-- reachable page. Backfill from the topic (or title).
update public.reviews
set topic_slug = public.kc_slugify(coalesce(topic, title))
where topic_slug is null or btrim(topic_slug) = '';

-- A title written entirely in Devanagari or emoji slugifies to nothing. Give
-- anything still empty a stable fallback so the row stays addressable.
update public.reviews
set topic_slug = 'topic-' || left(id::text, 8)
where topic_slug is null or btrim(topic_slug) = '';

alter table public.reviews alter column topic_slug set not null;

create index if not exists idx_reviews_topic_slug on public.reviews (topic_slug);

-- Deliberately NOT unique: many experiences share one topic_slug. That is the
-- whole point — one topic is one page, and the slug is what groups them.

-- ---------------------------------------------------------------------------

alter table public.reviews add column if not exists updated_at timestamptz;

-- Left null for existing rows rather than defaulted to now(): they were not
-- edited today, and a false date in the first sitemap Google reads after months
-- of ignoring this domain is exactly the wrong signal. The sitemap coalesces to
-- created_at when this is null.

-- WHY THIS TRIGGER IS SELECTIVE
--
-- upvotes and downvotes live on this same row, and lib/votes.js updates it on
-- every vote. A plain "updated_at = now()" trigger would fire each time anyone
-- taps Ramro or Naramro, and the sitemap's lastmod would churn constantly while
-- the content sat unchanged.
--
-- That is worse than having no updated_at at all. A sitemap claiming everything
-- changed today, every day, has dates that carry no information — and
-- repeatedly telling a crawler to revisit unchanged pages is how a site teaches
-- it to stop coming. This domain has already been through that once.
--
-- The columns below are exactly those rendered on the public page, audited
-- against app/components/TopicThread.js and app/discussions/[slug]/page.js.
-- comment_count is derived (a new reply already moves lastmod through its own
-- created_at) and topic_slug is derived from topic, so neither is watched.
create or replace function public.set_reviews_content_updated_at()
returns trigger
language plpgsql
as $$
begin
  -- "is distinct from" rather than "<>" so a null-to-value change counts;
  -- <> returns null when either side is null and would silently skip it.
  if new.summary     is distinct from old.summary
     or new.verdict     is distinct from old.verdict
     or new.topic       is distinct from old.topic
     or new.title       is distinct from old.title
     or new.category    is distinct from old.category
     or new.author_name is distinct from old.author_name
  then
    new.updated_at = now();
  end if;

  return new;
end;
$$;

drop trigger if exists trg_reviews_content_updated_at on public.reviews;

create trigger trg_reviews_content_updated_at
  before update on public.reviews
  for each row
  execute function public.set_reviews_content_updated_at();


-- ===========================================================================
-- 3. featured_stories — slug, updated_at, author_name
-- ===========================================================================

alter table public.featured_stories add column if not exists slug text;
alter table public.featured_stories add column if not exists updated_at timestamptz not null default now();
alter table public.featured_stories add column if not exists author_name text;

-- author_name is nullable on purpose: a story genuinely produced by the team
-- rather than one person should be allowed no byline, and lib/seo/schema.js
-- falls back to the Organization in that case.

update public.featured_stories
set slug = public.kc_slugify(title)
where slug is null or btrim(slug) = '';

update public.featured_stories
set slug = 'story-' || left(id::text, 8)
where slug is null or btrim(slug) = '';

-- Two stories can legitimately share a title; a URL cannot. Oldest keeps the
-- clean slug.
with ranked as (
  select id, slug, row_number() over (partition by slug order by created_at, id) as rn
  from public.featured_stories
)
update public.featured_stories f
set slug = f.slug || '-' || left(f.id::text, 6)
from ranked r
where f.id = r.id and r.rn > 1;

alter table public.featured_stories alter column slug set not null;

create unique index if not exists idx_featured_stories_slug
  on public.featured_stories (slug);

-- updated_at must reflect genuine edits: using created_at means fixing a typo
-- in an old article never signals a change, and the sitemap reads
-- updated_at || created_at.
create or replace function public.set_featured_stories_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_featured_stories_updated_at on public.featured_stories;

create trigger trg_featured_stories_updated_at
  before update on public.featured_stories
  for each row
  execute function public.set_featured_stories_updated_at();


-- ===========================================================================
-- 4. trending_topics and battles — slug
-- ===========================================================================
--
-- These pages are noindexed: they live two or three days and their audience
-- arrives from TikTok, not search. So this is not an SEO change — it is a
-- sharing one. "/battle/nepal-vs-uae" tells someone what they are about to tap.
-- A uuid tells them nothing and looks like something to be wary of.

alter table public.trending_topics add column if not exists slug text;
alter table public.battles         add column if not exists slug text;

-- --- trending_topics --------------------------------------------------------

update public.trending_topics
set slug = public.kc_slugify(title)
where slug is null or btrim(slug) = '';

update public.trending_topics
set slug = 'topic-' || left(id::text, 8)
where slug is null or btrim(slug) = '';

-- A subject can trend twice in a year and both rows need their own URL.
with ranked as (
  select id, slug, row_number() over (partition by slug order by created_at, id) as rn
  from public.trending_topics
)
update public.trending_topics t
set slug = t.slug || '-' || left(t.id::text, 6)
from ranked r
where t.id = r.id and r.rn > 1;

alter table public.trending_topics alter column slug set not null;

create unique index if not exists idx_trending_topics_slug
  on public.trending_topics (slug);

-- --- battles ----------------------------------------------------------------

-- A battle has no single title; the comparison is the point. "nepal-vs-uae".
update public.battles
set slug = public.kc_slugify(coalesce(left_title, '') || ' vs ' || coalesce(right_title, ''))
where slug is null or btrim(slug) = '';

update public.battles
set slug = 'battle-' || left(id::text, 8)
where slug is null or btrim(slug) = '';

-- The same match-up can run more than once.
with ranked as (
  select id, slug, row_number() over (partition by slug order by created_at, id) as rn
  from public.battles
)
update public.battles b
set slug = b.slug || '-' || left(b.id::text, 6)
from ranked r
where b.id = r.id and r.rn > 1;

alter table public.battles alter column slug set not null;

create unique index if not exists idx_battles_slug on public.battles (slug);


-- ===========================================================================
-- 5. Slug autofill — so a missing slug can never break an insert
-- ===========================================================================
--
-- Making slug NOT NULL creates an ordering trap: the admin form only sends a
-- slug in the patched code, so between running this and deploying, creating a
-- story or battle would fail with a NOT NULL violation.
--
-- Sequencing carefully would work, but the database would be briefly
-- incompatible with the code running against it — and it stays fragile, because
-- a rollback, a second environment, or a seed script written before the change
-- all reintroduce the same failure.
--
-- These triggers derive a slug from the title whenever one is missing:
--
--   old code, no slug sent  -> derived here, insert succeeds
--   new code, slug sent     -> left exactly as provided
--   seed script, manual sql -> still gets a valid slug
--
-- The ordering dependency disappears entirely.

create or replace function public.set_featured_story_slug()
returns trigger
language plpgsql
as $$
begin
  if new.slug is null or btrim(new.slug) = '' then
    new.slug := coalesce(public.kc_slugify(new.title), 'story-' || left(new.id::text, 8));
    new.slug := public.kc_unique_slug('featured_stories', new.slug, new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_featured_story_slug on public.featured_stories;
create trigger trg_featured_story_slug
  before insert or update on public.featured_stories
  for each row execute function public.set_featured_story_slug();

create or replace function public.set_trending_topic_slug()
returns trigger
language plpgsql
as $$
begin
  if new.slug is null or btrim(new.slug) = '' then
    new.slug := coalesce(public.kc_slugify(new.title), 'topic-' || left(new.id::text, 8));
    new.slug := public.kc_unique_slug('trending_topics', new.slug, new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_trending_topic_slug on public.trending_topics;
create trigger trg_trending_topic_slug
  before insert or update on public.trending_topics
  for each row execute function public.set_trending_topic_slug();

create or replace function public.set_battle_slug()
returns trigger
language plpgsql
as $$
begin
  if new.slug is null or btrim(new.slug) = '' then
    new.slug := coalesce(
      public.kc_slugify(coalesce(new.left_title, '') || ' vs ' || coalesce(new.right_title, '')),
      'battle-' || left(new.id::text, 8)
    );
    new.slug := public.kc_unique_slug('battles', new.slug, new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_battle_slug on public.battles;
create trigger trg_battle_slug
  before insert or update on public.battles
  for each row execute function public.set_battle_slug();

-- These fire on update too, but only when slug is null or blank. An existing
-- slug is never rewritten — changing a published URL breaks every link to it.
-- Renaming a story's title leaves its slug alone, deliberately.


-- ===========================================================================
-- 6. Verify
-- ===========================================================================
--
-- Run after applying. Every row should report ok = true.
--
--   select 'reviews.topic_slug'    as check, count(*) = 0 as ok from public.reviews          where topic_slug is null or btrim(topic_slug) = ''
--   union all
--   select 'featured.slug',              count(*) = 0 from public.featured_stories where slug is null or btrim(slug) = ''
--   union all
--   select 'trending.slug',              count(*) = 0 from public.trending_topics  where slug is null or btrim(slug) = ''
--   union all
--   select 'battles.slug',               count(*) = 0 from public.battles          where slug is null or btrim(slug) = '';
--
-- And confirm the autofill works — this insert has no slug, exactly as the
-- pre-deploy admin code sends it:
--
--   insert into public.featured_stories (slot, title, description)
--   values ('side', 'Trigger Test Story', 'temporary')
--   returning id, title, slug;   -- expect slug = 'trigger-test-story'
--
--   delete from public.featured_stories where title = 'Trigger Test Story';
