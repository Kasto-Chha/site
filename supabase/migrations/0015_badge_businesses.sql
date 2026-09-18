-- Allowlist of businesses approved to use the embeddable badge widget
-- (public/badge-widget.js). Without this, the widget would show for any
-- data-business value someone typed into a script tag — including a bare
-- test page, never a real business's site — with no way to know it's
-- happening or control which names the badge will ever respond to. This
-- table is what actually makes the badge "KastoChha's," curated, rather
-- than a generic public tool anyone can repurpose under any name.
--
-- Deliberately just a name column: no per-business dashboard, no config —
-- adding a business is one row, added by hand in Supabase's own table
-- editor, matching the same manual, one-at-a-time distribution as handing
-- out the snippet itself.

create table if not exists public.badge_businesses (
  id uuid primary key default gen_random_uuid(),
  business_name text not null,
  created_at timestamptz not null default now()
);

-- Matched case-sensitively, exact-match against the widget's data-business
-- value — the check endpoint does no fuzzy matching, so the name entered
-- here must exactly match what's in the business's own script tag.
create unique index if not exists idx_badge_businesses_name
  on public.badge_businesses (business_name);

-- Same posture as every other public-facing table (see 0002, 0013): RLS on,
-- public read (the check endpoint's anon-key query needs this), no write
-- policy — only the service role, or you directly via Supabase's own table
-- editor, can add a row.
alter table public.badge_businesses enable row level security;
drop policy if exists "public read" on public.badge_businesses;
create policy "public read" on public.badge_businesses for select using (true);
