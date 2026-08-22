-- ---------------------------------------------------------------------------
-- KastoChha migration 0009
--
-- reviews.updated_at — so an edited experience moves its thread's lastmod
--
-- The sitemap sets each discussion's <lastmod> to the newest experience in the
-- thread. That covers new replies but misses edits: app/api/reviews/[id] has a
-- PATCH endpoint, so someone can rewrite their experience months later. The
-- page genuinely changes; created_at does not; the sitemap keeps reporting the
-- old date. Google is told nothing changed when something did.
--
-- WHY THE TRIGGER IS SELECTIVE, AND WHY THAT MATTERS
--
-- upvotes and downvotes live on this same row, and lib/votes.js updates it on
-- every vote. A plain "updated_at = now()" trigger would therefore fire every
-- time anyone taps Ramro or Naramro, and lastmod would churn constantly while
-- the content sat unchanged.
--
-- That is worse than having no updated_at at all. A sitemap that claims
-- everything changed today, every day, is a sitemap whose dates carry no
-- information — and repeatedly telling a crawler to revisit pages that turn out
-- to be unchanged is exactly how a site trains it to stop bothering. This
-- domain has already been through that once.
--
-- So the trigger compares the columns that constitute the content, and ignores
-- everything else. A vote does not move the date. Rewriting your experience
-- does.
-- ---------------------------------------------------------------------------

alter table public.reviews
  add column if not exists updated_at timestamptz;

-- Deliberately left null for existing rows rather than defaulted to now():
-- these were not edited today, and claiming otherwise would put a false date
-- into the first sitemap Google reads after months of ignoring this site. The
-- sitemap coalesces to created_at when this is null.

-- WHICH COLUMNS COUNT AS CONTENT
--
-- The rule is: every field whose change materially changes the indexable page,
-- and nothing else. Audited against what the page actually renders
-- (app/components/TopicThread.js and app/discussions/[slug]/page.js):
--
--   summary      the experience text                      -> watched
--   verdict      the Ramro / Thikai / Naramro label        -> watched
--   topic        the thread heading                        -> watched
--   title        fallback heading, and used in metadata    -> watched
--   category     the category chip and the metadata kicker -> watched
--   author_name  the byline on each experience             -> watched
--
--   upvotes      a counter                                 -> ignored
--   downvotes    a counter                                 -> ignored
--   comment_count derived; a new reply already moves the
--                thread's lastmod through its own created_at -> ignored
--   topic_slug   derived from topic, so a genuine retitle
--                already trips the topic check; a slug
--                backfill is not a content change          -> ignored
--
-- author_name is included because it is visible on the page and is the
-- authorship signal search engines weigh. It is not editable through any
-- endpoint today — app/api/reviews/[id] PATCH writes only summary and verdict —
-- so this costs nothing now and holds if that changes later.
--
-- One operational note: a bulk backfill that rewrites any watched column across
-- every row would move every lastmod at once, which is the churn this trigger
-- exists to avoid. For a one-off migration like that, disable the trigger for
-- the duration:
--
--   alter table public.reviews disable trigger trg_reviews_content_updated_at;
--   -- ... backfill ...
--   alter table public.reviews enable trigger trg_reviews_content_updated_at;

create or replace function public.set_reviews_content_updated_at()
returns trigger
language plpgsql
as $$
begin
  -- "is distinct from" rather than "<>" so a null-to-value change counts too;
  -- <> returns null when either side is null, which would silently skip it.
  if new.summary is distinct from old.summary
     or new.verdict is distinct from old.verdict
     or new.topic   is distinct from old.topic
     or new.title   is distinct from old.title
     or new.category is distinct from old.category
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

-- Verified against every write path to this table:
--
--   app/api/reviews/route.js        insert only
--   app/api/reviews/[id] PATCH      update({ summary, verdict })  -> trips
--   app/api/reviews/[id] DELETE     delete
--   public.apply_review_vote(...)   sets upvotes/downvotes only   -> does not trip
--
-- So the only thing that moves updated_at today is someone editing their own
-- experience, which is exactly the intent.
