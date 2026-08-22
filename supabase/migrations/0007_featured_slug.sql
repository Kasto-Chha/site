-- ---------------------------------------------------------------------------
-- KastoChha migration 0007
--
-- featured_stories.slug and .updated_at
--
-- Featured articles are addressed by uuid today: /featured/{uuid}. That URL
-- carries no signal about what the page is about, and it reads as machine
-- output to anyone who sees it shared. The ten articles being republished here
-- already have good slugs on the old site — how-lokta-paper-outlived-empires,
-- argeli-that-produces-the-japanese-yen — and there is no reason to lose them.
--
-- updated_at comes along because the sitemap needs an honest "last modified"
-- date. Using created_at means correcting a typo in a two-year-old article
-- never tells Google anything changed; using a trigger that fires on any touch
-- means every trivial write claims the article is new. This column is updated
-- by the trigger below on genuine row updates.
-- ---------------------------------------------------------------------------

alter table public.featured_stories
  add column if not exists slug text;

alter table public.featured_stories
  add column if not exists updated_at timestamptz not null default now();

-- 1. Derive a slug from the title for any row missing one. Mirrors what
--    lib/slug.js does in JS: lowercase, non-alphanumerics collapsed to single
--    hyphens, no leading or trailing hyphen.
update public.featured_stories
set slug = nullif(
  btrim(
    regexp_replace(lower(coalesce(title, '')), '[^a-z0-9]+', '-', 'g'),
    '-'
  ),
  ''
)
where slug is null or btrim(slug) = '';

-- 2. A title written entirely in Devanagari reduces to an empty string above.
--    Give anything still empty a stable fallback from its own id.
update public.featured_stories
set slug = 'story-' || left(id::text, 8)
where slug is null or btrim(slug) = '';

-- 3. Two stories can legitimately share a title. The slug is now a URL, so it
--    has to be unique: append a short suffix from the id to any duplicate,
--    keeping the oldest row's slug clean.
with ranked as (
  select
    id,
    slug,
    row_number() over (partition by slug order by created_at, id) as rn
  from public.featured_stories
)
update public.featured_stories f
set slug = f.slug || '-' || left(f.id::text, 6)
from ranked r
where f.id = r.id and r.rn > 1;

-- 4. Lock it in.
alter table public.featured_stories alter column slug set not null;

create unique index if not exists idx_featured_stories_slug
  on public.featured_stories (slug);

-- 5. Keep updated_at honest without touching every write path by hand.
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
