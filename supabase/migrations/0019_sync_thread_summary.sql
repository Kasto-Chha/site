-- KastoChha Sync: a summary of every thread, for the admin's thread search.
--
-- A thread is not a row: it is the posts in `reviews` that share a topic_slug. The tag
-- form needs to search them, count them and page through them without loading every
-- post, so this view does the grouping in the database. One row per thread:
--   title      the first post's topic (or title): what the thread is called
--   category   the first post's category
--   posts      experiences (everything that is not a question)
--   questions  questions
--   latest     the newest post's time
--   tagged_as  the business it already belongs to, if any
--
-- SECURITY. The public roles have no privileges on this view, and it runs with the
-- caller's own rights (security_invoker), so it cannot be used to read posts or
-- merchants around their tables' rules. Only the server's service role reads it.
--
-- Idempotent: the migration runner re-runs every file.

create or replace view public.sync_thread_summary
with (security_invoker = true) as
with first_post as (
  select distinct on (r.topic_slug)
         r.topic_slug,
         coalesce(nullif(btrim(r.topic), ''), r.title) as title,
         r.category,
         r.created_at as first_at
  from public.reviews r
  where r.topic_slug is not null and r.topic_slug <> ''
  order by r.topic_slug, r.created_at asc, r.id asc
),
totals as (
  select r.topic_slug,
         (count(*) filter (where r.kind <> 'question'))::int as posts,
         (count(*) filter (where r.kind = 'question'))::int as questions,
         max(r.created_at) as latest
  from public.reviews r
  where r.topic_slug is not null and r.topic_slug <> ''
  group by r.topic_slug
)
select f.topic_slug,
       f.title,
       f.category,
       t.posts,
       t.questions,
       t.latest,
       f.first_at,
       m.business_name as tagged_as
from first_post f
join totals t on t.topic_slug = f.topic_slug
left join public.sync_merchants m on m.topic_slug = f.topic_slug;

revoke all on table public.sync_thread_summary from anon, authenticated;
