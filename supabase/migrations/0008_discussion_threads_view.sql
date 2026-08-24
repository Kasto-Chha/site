-- ---------------------------------------------------------------------------
-- KastoChha migration 0008 — a thread index, so every discussion stays reachable
--
-- THE PROBLEM
--
-- The list views find threads by scanning recent rows. That keeps the counts
-- honest, but it means a thread nobody has posted on for a long time eventually
-- falls outside the scan and stops being browsable. Its page still works and
-- search engines still have it — you just cannot reach it from the site.
--
-- On a discussion platform that is the wrong behaviour. A question asked a year
-- ago is exactly the kind of thing someone should be able to find and answer.
-- Reddit does not hide old threads; neither should this.
--
-- WHY A VIEW
--
-- Paginating threads means asking for "threads 61 to 90, newest activity
-- first". That is a GROUP BY over reviews, and PostgREST cannot express it from
-- the client. A view does the grouping in the database, so it can be paged with
-- .range() like any table — and the numbers come from the whole table rather
-- than whatever window was loaded.
--
-- It is a view, not a materialised view: always current, no refresh to schedule
-- and nothing to go stale. The GROUP BY is cheap against idx_reviews_topic_slug
-- and stays cheap well past any volume this site will see for a long time.
-- ---------------------------------------------------------------------------

create or replace view public.discussion_threads
  with (security_invoker = on)
as
select
  topic_slug,
  min(created_at)                              as started_at,
  max(created_at)                              as last_activity,
  count(*)                                     as post_count,
  count(*) filter (where kind = 'experience')  as experience_count,
  count(*) filter (where kind = 'question')    as question_count
from public.reviews
where topic_slug is not null and btrim(topic_slug) <> ''
group by topic_slug;

-- security_invoker matters here. A view is SECURITY DEFINER by default, which
-- would run with the view owner's rights and quietly bypass the RLS on reviews
-- — handing the browser key a way to read rows it is otherwise denied. With
-- invoker semantics the caller's policies apply, so the view is exactly as
-- restricted as the table underneath it.

comment on view public.discussion_threads is
  'One row per discussion thread with activity timestamps and post counts. '
  'Exists so threads can be paged in the database rather than reconstructed '
  'from a window of recent rows — which quietly under-reported counts and made '
  'older threads unreachable.';


-- Verify:
--
--   select * from public.discussion_threads order by last_activity desc limit 10;
--
--   -- page two, thirty threads at a time:
--   select topic_slug, post_count from public.discussion_threads
--   order by last_activity desc offset 30 limit 30;
