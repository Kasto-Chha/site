# KastoChha Sync: Stage A (the pilot)

What this is: a way for a local business to send its customers to write on KastoChha,
and to see what they said. A customer scans a QR code, lands on a hub page, and can
share an experience, ask a question, send the owner a private note, or review the
café on Google. The posts live in an ordinary KastoChha thread.

Stage A is the part needed to run a pilot with three to five cafés. It is built in eight
patches. Google's API, AI drafting, the geo-grid, approvals and billing are not in it.

## Decisions (change one only on purpose)

1. Admin only in Stage A. An operator role arrives with the dashboard in Stage B.
2. A thread's address (topic_slug) is pinned when a business is tagged and never
   recomputed. Renaming a café changes only what is displayed.
3. Empty business threads stay out of public lists and the sitemap. They are reached by
   QR or direct link.
4. A café that cancels keeps its thread and posts, and loses the business header, the
   badge and the hub.
5. "Visited" means the person opened that café's QR link in the last 6 hours. It is not
   proof of a visit, since a link can be forwarded. Limit: one Visited post per person
   per café per day.
6. Pilot cafés use the site's existing Food category.
7. A business's own account may reply, and gets a "Verified business" label. It cannot
   edit or hide anyone else's post.

## The patches

1. Foundation: the tables, security, the slug rules, the signed token, the readers.
2. Admin: tag a business thread.
3. The thread page becomes a business page, and every list that shows threads knows.
4. QR codes and the hub.
5. Posting through the hub: the Visited label and the "copy and open Google" step.
6. Private feedback and the admin inbox.
7. Linking the owner's account, and the "Verified business" label.
8. Pilot pack: a small overview, a CSV export, a runbook.

## How the pieces fit

- `supabase/migrations/0018_sync_foundation.sql`: sync_merchants, sync_qr_codes,
  sync_events, sync_feedback, and reviews.source. Row level security is on for every
  sync table with no policy, so the public key can read none of it. Only the server,
  with the service role, touches them.
- `lib/sync/slug.js`: slugs. A new business's thread slug is made from "Name, Area" by
  the same function the posts route uses, so posts under that title land in its thread.
- `lib/sync/hubToken.js`: the signed token for "Visited". Server-only. Fails closed
  without SYNC_HUB_SECRET.
- `lib/sync/merchants.js`: server-only readers. They return null on any failure, so a
  page falls back to the ordinary thread.

## Before the code that uses it is deployed

Run the migration (`npm run db:migrate`, after a Supabase backup) and set
SYNC_HUB_SECRET in Vercel. See .env.example.
