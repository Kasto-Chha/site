-- ---------------------------------------------------------------------------
-- KastoChha migration 0010
--
-- trending_topics.slug and battles.slug
--
-- These pages are noindexed — they live two or three days and their audience
-- arrives from TikTok and Facebook, not search. So this is not an SEO change.
--
-- It is a sharing change, and for these two sections that matters more. A link
-- posted to a story reading
--
--   kastochhanepal.com/battle/nepal-vs-uae
--
-- tells someone what they are about to tap. A link reading
--
--   kastochhanepal.com/battle/7c9e1f04-2a86-4d31-b8e7-5f2a91c4d0e3
--
-- tells them nothing, and looks like something to be wary of. These pages exist
-- to be shared, so the URL is part of the product rather than an afterthought.
--
-- Battles slug from both sides — "nepal-vs-uae", "yango-vs-indrive" — because a
-- battle has no single title and the comparison is the point.
-- ---------------------------------------------------------------------------

alter table public.trending_topics add column if not exists slug text;
alter table public.battles         add column if not exists slug text;

-- --- trending_topics --------------------------------------------------------

-- 1. Derive from the title, matching lib/slug.js: lowercase, non-alphanumerics
--    collapsed to single hyphens, trimmed.
update public.trending_topics
set slug = nullif(
  btrim(regexp_replace(lower(coalesce(title, '')), '[^a-z0-9]+', '-', 'g'), '-'),
  ''
)
where slug is null or btrim(slug) = '';

-- 2. A Devanagari-only title reduces to empty above. Stable fallback.
update public.trending_topics
set slug = 'topic-' || left(id::text, 8)
where slug is null or btrim(slug) = '';

-- 3. Trending topics repeat by nature — the same subject can trend twice in a
--    year, and both rows need their own URL. Oldest keeps the clean slug.
with ranked as (
  select id, slug, row_number() over (partition by slug order by created_at, id) as rn
  from public.trending_topics
)
update public.trending_topics t
set slug = t.slug || '-' || left(t.id::text, 6)
from ranked r
where t.id = r.id and r.rn > 1;

-- --- battles ----------------------------------------------------------------

-- 1. "left-vs-right" from both sides.
update public.battles
set slug = nullif(
  btrim(
    regexp_replace(
      lower(coalesce(left_title, '') || ' vs ' || coalesce(right_title, '')),
      '[^a-z0-9]+', '-', 'g'
    ),
    '-'
  ),
  ''
)
where slug is null or btrim(slug) = '';

-- 2. Fallback for titles with no Latin characters.
update public.battles
set slug = 'battle-' || left(id::text, 8)
where slug is null or btrim(slug) = '';

-- 3. The same match-up can run more than once.
with ranked as (
  select id, slug, row_number() over (partition by slug order by created_at, id) as rn
  from public.battles
)
update public.battles b
set slug = b.slug || '-' || left(b.id::text, 6)
from ranked r
where b.id = r.id and r.rn > 1;

-- --- lock both in -----------------------------------------------------------

alter table public.trending_topics alter column slug set not null;
alter table public.battles         alter column slug set not null;

create unique index if not exists idx_trending_topics_slug on public.trending_topics (slug);
create unique index if not exists idx_battles_slug          on public.battles (slug);
