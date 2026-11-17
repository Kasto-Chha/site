-- Patch 14a: stages and the 90-day trial.
--
-- Every business gets a stage. WIP is the trial, with onboarding inside it. Active means paying. Free means they chose not
-- to pay: the business keeps its page, QR cards and badge on KastoChha, and we do nothing on its Google side.
--
--   stage             'wip', 'active' or 'free'
--   trial_started_on  the first day of the trial, a Nepal date
--   trial_ends_on     the decision day, 90 days after the start unless changed
--   stage_note        the latest note about the stage: why they said yes, why not, why the trial was extended
--   stage_changed_at, stage_changed_by   when and who last moved it
--
-- A trial that reaches its end date with no yes becomes Free on its own. That is worked out from the dates when a page is
-- shown; nothing runs in the background and nothing is written at midnight.
--
-- Businesses that already exist become WIP with the trial starting the day this runs, because nobody is paying yet. New
-- businesses get the same by default, so tagging a business needs no change here. These are private columns on a table
-- that is already closed to the public key (row level security, no policy, no privileges). Additive only, and safe to run
-- more than once.

alter table public.sync_merchants
  add column if not exists stage text not null default 'wip'
    check (stage in ('wip', 'active', 'free'));

alter table public.sync_merchants
  add column if not exists trial_started_on date not null
    default ((now() at time zone 'Asia/Kathmandu')::date);

alter table public.sync_merchants
  add column if not exists trial_ends_on date not null
    default (((now() at time zone 'Asia/Kathmandu')::date) + 90);

alter table public.sync_merchants
  add column if not exists stage_note text
    check (stage_note is null or char_length(stage_note) <= 500);

alter table public.sync_merchants add column if not exists stage_changed_at timestamptz;
alter table public.sync_merchants add column if not exists stage_changed_by text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sync_merchants_trial_dates_check') then
    alter table public.sync_merchants
      add constraint sync_merchants_trial_dates_check check (trial_ends_on >= trial_started_on);
  end if;
end $$;
