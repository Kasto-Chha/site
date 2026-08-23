-- ---------------------------------------------------------------------------
-- KastoChha migration 0007 — questions become discussions
--
-- THE PROBLEM
--
-- Asking a question and answering it were two systems that never met. Asking
-- wrote to `questions`; answering wrote to `reviews`. Nothing linked them, so
-- the homepage tried to reconstruct the link by slugifying the question text
-- and hoping it matched a thread slug:
--
--   threadBySlug.get(topicSlug(item.question))
--
--   question: "Sikko calculator kasto chha?"  ->  sikko-calculator-kasto-chha
--   thread:                                       sikko-calculator
--                                                 no match
--
-- That only matches when someone typed the entire question as the topic name.
-- So every question showed as unanswered forever, however many people replied —
-- on a community platform whose whole proposition is that people answer things.
--
-- Worse, answerQuestion() pre-filled the topic field with the full question, so
-- answering created "sikko-calculator-kasto-chha" alongside the existing
-- "sikko-calculator". Two threads, one product: the same fragmentation the
-- topic-slug work removed, arriving through a different door.
--
-- THE FIX
--
-- A question is a discussion with no answers yet. Asking creates the thread;
-- answering adds to it. "Community is asking" becomes a view of threads with
-- no experiences, rather than a separate table.
--
-- Nothing to link, because they were never separate.
--
-- NOTHING IS DROPPED HERE. The questions table is left in place and populated
-- until the new flow is confirmed working in production. Dropping it is a
-- separate, deliberate step.
-- ---------------------------------------------------------------------------


-- 1. Distinguish an opening question from a shared experience.
--
--    Both live in `reviews` and both render in a thread; the difference is that
--    a question is asking rather than reporting, so it has no verdict and does
--    not count toward whether a thread has been answered.
alter table public.reviews
  add column if not exists kind text not null default 'experience';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'reviews_kind_check'
  ) then
    alter table public.reviews
      add constraint reviews_kind_check check (kind in ('experience', 'question'));
  end if;
end
$$;

create index if not exists idx_reviews_kind on public.reviews (kind);


-- 2. A question has no verdict — it hasn't formed one yet, that's the point.
alter table public.reviews alter column verdict drop not null;


-- 3. Bring the existing questions across as question-kind rows.
--
--    topic     the subject, which becomes the thread title and slug
--    summary   the question itself, which becomes the opening post
--
--    Old rows have no separate subject — only the question text — so both are
--    derived from it. New questions asked through the updated form supply the
--    subject explicitly, which is what stops threads being named after whole
--    sentences.
--
--    Skipped where a question-kind row for the same slug already exists, so
--    this is safe to re-run.
insert into public.reviews
  (category, topic, topic_slug, title, summary, verdict, author_name, user_id, created_at, kind)
select
  coalesce(nullif(btrim(q.category), ''), 'General'),
  q.question,
  coalesce(public.kc_slugify(q.question), 'question-' || left(q.id::text, 8)),
  q.question,
  q.question,
  null,
  'KastoChha community',
  q.user_id,
  q.created_at,
  'question'
from public.questions q
where not exists (
  select 1 from public.reviews r
  where r.kind = 'question'
    and r.topic_slug = coalesce(public.kc_slugify(q.question), 'question-' || left(q.id::text, 8))
);


-- 4. Verify
--
--   -- migrated questions now appear as question-kind threads
--   select kind, count(*) from public.reviews group by kind;
--
--   -- threads still waiting for an answer: a question with no experience
--   -- under the same slug. This is what "Community is asking" renders.
--   select r.topic, r.topic_slug, r.summary
--   from public.reviews r
--   where r.kind = 'question'
--     and not exists (
--       select 1 from public.reviews e
--       where e.kind = 'experience' and e.topic_slug = r.topic_slug
--     );
--
--   -- and once the new flow is confirmed working:
--   -- drop table public.questions;
