-- Patch 14e: the audit report's private link.
--
-- Each prospect's report can be opened by one unguessable address (report_token). The token is random, long and kept only in
-- this private table; the page that serves it reads it with the server key. report_opens counts real opens (not link-preview
-- bots) and report_last_opened_at says when. Stopping the link, or making a new one, just changes or clears the token.
--
-- Additive and safe to run twice: it adds three columns and one index, and changes nothing that exists.

alter table public.sync_prospects add column if not exists report_token text check (report_token is null or char_length(report_token) between 20 and 100);
alter table public.sync_prospects add column if not exists report_opens integer not null default 0 check (report_opens >= 0);
alter table public.sync_prospects add column if not exists report_last_opened_at timestamptz;

create unique index if not exists sync_prospects_report_token_idx on public.sync_prospects (report_token) where report_token is not null;
