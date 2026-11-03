# KastoChha Sync: Stage A (the pilot)

What this is: a way for a local business to send its customers to write on KastoChha,
and to see what they said. A customer scans a QR code, lands on a hub page, and can
share an experience, ask a question, send the owner a private note, or review the
café on Google. The posts live in an ordinary KastoChha thread.

Stage A is the part needed to run a pilot with three to five cafés. It is built in eight
patches. Google's API, AI drafting, the geo-grid, approvals and billing are not in it.

## Decisions (change one only on purpose)

1. Admin only in Stage A. An operator role arrives with the fuller dashboard in Stage B.
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
2. Admin: tag a business thread, with a simple businesses list and editor.
3. The thread page becomes a business page, and every list that shows threads knows.
4. QR codes and the hub.
5. The Overview: scans, taps, posts and questions per business. Moved up so it shows real
   activity as soon as the first QR code is out. It is also where the dashboard shell
   (the canvas's dark sidebar and IBM Plex type) is introduced.
6. Posting through the hub: the Visited label and the "copy and open Google" step.
7. Private feedback and the admin inbox.
8. Linking the owner's account, and the "Verified business" label.
9. Pilot pack: a CSV export, a runbook, and a final smoke test.

## Patch 2 notes

- The Sync admin screens reuse the admin's existing styling, so they match the rest of
  the admin. The canvas look arrives once, with the Overview (patch 5), rather than
  being built twice.
- About text: at most 300 characters (the canvas says 200 to 300; there is no minimum).
- Google links: only search.google.com, g.page, maps.app.goo.gl, maps.google.com and
  Google Maps are accepted, because customers tap them. A look-alike address is refused.
- A business's two addresses (thread and hub) are fixed once tagged. Removing a tag keeps
  the thread and every post; restoring it brings the business header back.
- Every change is written to the admin audit log before it is made. If the log cannot be
  written, nothing changes.

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
