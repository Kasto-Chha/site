-- Patch 14m: which private notes the team has passed on to the business.
--
-- A customer's private note is read first by the KastoChha team, who then pass it on to the business in a digest. The owner dashboard
-- shows the business only the notes the team has passed on: shared_with_owner_at is set when a note goes into a digest (and cleared
-- if it is put back to new). A note the team resolves without ever passing it on keeps this empty, so it stays hidden from the owner.
--
-- Notes already marked "in digest" were passed on by the team before this existed, so they are stamped now. Resolved notes are not
-- stamped: nobody can tell now whether they were ever passed on, and the safe side is to keep them hidden.
--
-- One new column and one update that only fills that column. Safe to run twice. Run this BEFORE pushing patch 14m: the team's digest
-- buttons write this column.

alter table public.sync_feedback add column if not exists shared_with_owner_at timestamptz;

update public.sync_feedback
   set shared_with_owner_at = now()
 where status = 'in_digest' and shared_with_owner_at is null;
