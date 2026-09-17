-- Featured articles can have their slug deliberately edited in the admin
-- panel (not just auto-derived from the title, which 0006 already protects).
-- Confirmed real: renaming
-- /featured/which-is-the-best-ride-sharing-app-in-nepal to
-- /featured/best-ride-sharing-app-in-nepal-for-riders-and-passengers left the
-- old URL 404ing, breaking any existing link, share, or search-indexed result.
--
-- This tracks every slug a story has ever had, so the page can redirect an
-- old URL to wherever the story lives now instead of showing "not found".

create table if not exists public.featured_story_slug_history (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.featured_stories(id) on delete cascade,
  old_slug text not null,
  created_at timestamptz not null default now()
);

-- Looked up by old_slug on every 404, so this needs to be fast and unique —
-- the same old slug should never point at two different stories.
create unique index if not exists idx_featured_slug_history_old_slug
  on public.featured_story_slug_history (old_slug);

create index if not exists idx_featured_slug_history_story_id
  on public.featured_story_slug_history (story_id);

-- Same treatment as featured_stories itself (see 0002_rls.sql): this data is
-- public-facing and non-sensitive (an old slug, and which story it now
-- belongs to), so the anon/publishable key may read it — needed for the
-- redirect lookup to work at all if it's ever queried client-side — but has
-- no write policy, so only the server (service role, which bypasses RLS
-- anyway) can actually insert into it, via the trigger below.
alter table public.featured_story_slug_history enable row level security;
drop policy if exists "public read" on public.featured_story_slug_history;
create policy "public read" on public.featured_story_slug_history for select using (true);

-- Records the previous slug automatically whenever a story's slug actually
-- changes on update. Deliberately does NOT fire on insert (a brand-new story
-- has no "previous" slug to record) and does nothing when the slug is
-- unchanged, so an ordinary edit that leaves the slug alone stays a no-op.
create or replace function public.record_featured_slug_change()
returns trigger
language plpgsql
as $$
begin
  if old.slug is distinct from new.slug and old.slug is not null and btrim(old.slug) <> '' then
    insert into public.featured_story_slug_history (story_id, old_slug)
    values (old.id, old.slug)
    on conflict (old_slug) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_record_featured_slug_change on public.featured_stories;
create trigger trg_record_featured_slug_change
  before update on public.featured_stories
  for each row execute function public.record_featured_slug_change();

-- Backfill: the ride-sharing article's rename already happened before this
-- migration existed, so the trigger above never saw it. Recorded by hand so
-- the old link starts working the moment this ships, not just future renames.
insert into public.featured_story_slug_history (story_id, old_slug)
select id, 'which-is-the-best-ride-sharing-app-in-nepal'
from public.featured_stories
where slug = 'best-ride-sharing-app-in-nepal-for-riders-and-passengers'
on conflict (old_slug) do nothing;
