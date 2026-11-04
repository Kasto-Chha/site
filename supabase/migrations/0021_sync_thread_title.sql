-- KastoChha Sync: the title a business thread is posted under.
--
-- A thread is the posts that share a topic_slug, and the posts route makes that slug
-- from the title a post is sent with. So a post only lands in a business's thread if it
-- is sent under the title that makes that exact slug. The slug is pinned when a business
-- is tagged; this pins the title too, so renaming the business (which only changes what
-- is displayed) can never send the next post to a different thread.
--
--   a new thread        its title is "Name, Area" as it was when tagged
--   an existing thread  its title is what the thread was already called (its first post's)
--
-- Existing rows are filled in here: from the thread's first post when it has posts,
-- otherwise from the name and area. The code checks the title against the slug whenever
-- it uses it, and falls back to a title made from the slug if they ever disagree.
--
-- Idempotent: the migration runner re-runs every file.

alter table public.sync_merchants
  add column if not exists thread_title text
  constraint sync_merchants_thread_title_length check (thread_title is null or char_length(thread_title) between 1 and 160);

update public.sync_merchants m
set thread_title = coalesce(
  (select s.title from public.sync_thread_summary s where s.topic_slug = m.topic_slug),
  m.business_name || ', ' || m.area
)
where m.thread_title is null;
