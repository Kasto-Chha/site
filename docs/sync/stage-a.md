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
3. The thread page becomes a business page. Split in two:
   3a. the thread page itself: the business header, the empty-thread invitation, the
       business's name and category on the page and its share card, the pinned thread title,
       and links built from a place ID.
   3b. the discussions list, the search suggestions and the cards that carry the name.
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

## The tag form (patch 2, revised)

- **Finding the thread** is done in the database, one page at a time (8 by default, 20 at
  most), through the `sync_thread_summary` view (migration 0019). It never loads every
  post. Filters: a title search, a category, and whether to include threads that are
  already business threads (hidden by default). Pasting a discussion link, `/discussions/x`
  or a bare address like `himal-brew-house` jumps to that thread. The count says how many
  threads there are in all, and Show more loads the next page.
- **Choosing a thread is undoable.** A linked thread shows as a card with Change and
  Remove. Removing it takes back the name and area that choosing filled in, but never
  anything the admin typed since.
- **Starting a new thread** shows the address that will be made, and a way back.
- **Business types and the category.** There are 23 business types, in seven groups (Food,
  Health & Lifestyle, Travel, Tech & Gadgets, Motors, Career, Other), each filed under
  that category by default, with "Other business" for anything else. The server works the
  category out from the type. It can be changed by hand, only on purpose ("Change
  category"), and only to one of KastoChha's own categories: the form then sends
  `categoryOverride`, and a plain `category` from a browser is never read, so a stale value
  cannot get through (a cafe once ended up as "Career"). A hand-chosen category shows as
  "Chosen by hand", with "Use the type's category" to undo it. A linked thread filed under
  another category says so; its posts keep theirs. To list a new kind of business, add a
  line to `lib/sync/businessTypes.js`: the type is plain text in the database, so no
  migration is needed. Clinics, banks and foreign-employment agencies are kept out of the
  pilot as an onboarding policy, not by the form.
- **A business that fits none of the types** is listed as "Other (write it in)", the last
  entry of the type dropdown. Choosing it shows one box, "What is this business?", where
  the admin writes what it is (for example "Motorcycle workshop"). It is required for the
  Other type, at least two and at most 60 characters, tidied for spacing, and nothing else
  is asked of it. Customers see those words in place of the business type. Switching to a
  standard type clears them. They are stored in `sync_merchants.kind_label` (migration
  0020), and `kindDisplay()` shows "Business" for an Other business that has none (one
  tagged before the box existed). When the same kind keeps appearing, add it to
  `lib/sync/businessTypes.js` as a standard type.

## The business thread page (patch 3a)

- A thread with an active business tagged to it shows a header above its posts: a Business
  chip, the kind and area, the About text, and buttons to share an experience and, when the
  links exist, to review on Google and see the place on Google Maps. It shows no hours,
  menu, prices, phone number or photos (Google keeps those), and no Google rating. A thread
  with no business, or one whose tag was removed, renders exactly as before.
- The page is headed by the business's name and filed under its category. A thread that has
  no posts yet is still a page: the header and an invitation to be first, kept out of search
  engines until it has posts (then the ordinary rule applies).
- **The pinned thread title (migration 0021).** A post lands in a thread only if it is sent
  under the title that makes the thread's address. The address is pinned when a business is
  tagged; the title is pinned with it (`sync_merchants.thread_title`): "Name, Area" for a new
  thread, and the thread's existing title for a linked one. Renaming the business changes
  only what is displayed, so it can never send a post to a different thread. The code checks
  the title against the address every time and falls back to a title made from the address.
- A reply on a business thread is sent under the thread's own title; the business's name is
  only what is displayed (ThreadClient: displayTitle and displayCategory).
- **Links from a place ID.** Enter the place ID once; empty review and Maps links are built
  from it, and rebuilt if the ID changes (a link typed by hand is never replaced). Check each
  generated link once on a real business.
- Run migrations 0019 to 0021 before using the Sync screens: the search reads the thread
  summary view, the admin screens read the business-type words, and the thread page reads the
  pinned title.

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
