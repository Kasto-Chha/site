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
   3b. the discussions list and the Share box's suggestions: a business is named, marked and
       offered even with no posts. (Done.)
4. QR codes and the hub (done: scans, the hub, taps, and QR downloads).
   4b. The website badge, connected to Sync (done): one list, the business's own thread, counted clicks.
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

## Lists and suggestions (patch 3b)

- **The discussions list** names a thread a business is tagged to by the business ("Name,
  Area") and its category, with a Business mark beside the category. That is for the eye
  only: the thread's own title is kept as `postTitle` (lib/sync/businessTopics.js), and a
  reply from a list card is sent under it, so it lands in the same thread. The category
  filter uses the business's category too, so the filter and the card agree. A thread with
  no business, or one whose tag was removed, renders exactly as before.
- **The Share box's suggestions** (`/api/topics/search`) offer a business even when its
  thread has no posts yet, and name a business thread for the business. Picking one fills the
  form with the pinned title (`title`), not the name shown (`label`), so the post is filed in
  the business's thread. Suggestions are built from posts, so before this an empty business
  thread could never be offered, and typing its name would have started a second thread.
  Businesses lead, at most three; the rest are as before.
- **Failure is quiet.** If the business lookup cannot be read, the list and the suggestions
  are exactly what they were. The load-more route also returns the businesses among the
  threads it returns.
- Not changed: the home page's sections and the trending lists still show a thread by its
  first post's title. Add the business name there if it is wanted.

## QR codes and the hub (patch 4)

- **The journey.** A printed QR code opens `/q/<code>`. That route counts the scan, then sends
  the customer to `/hub/<business>?c=<code>` (302, never 301: a code can be switched off). The
  destination is built from the business's own address in the database, never from the
  request, so it can only lead to a hub.
- **A scan is counted once per person per ten minutes** (the `kc_q` cookie), and never for a
  link preview, crawler or script (`isBot`). A code that is switched off, a business whose tag
  was removed, an unknown or malformed code all go to the home page and are not counted.
  Counting never blocks the customer: if it fails, they still reach the hub.
- **The hub** is public (no login) and kept out of search engines (`noindex`, and robots.txt
  disallows `/hub/` and `/q/`). It shows the business's name, kind and area and a few equal
  options. An option appears only when it can really be done: sharing on KastoChha always;
  the Google review and Maps options only when the business has a link that is Google's.
  "Ask a question" and "Send a private note" arrive with the patches that build them (posting
  and feedback), so there is no button for something that does not work yet. Every option is
  the same size: the hub must not steer anyone toward or away from a Google review. The hub
  shows no hours, menu, prices, phone number or photos. English only for now: the Nepali text
  needs a native speaker's check before it goes live.
- **Taps** are reported by the page with `sendBeacon` to `/api/sync/event` (a plain link, so the
  hub works with no script). The route is public, so it is limited to 120 a minute per visitor
  address (Upstash; if Upstash is not configured every check passes, as for the other limits),
  accepts only `hub_share`, `hub_google` and `hub_maps` (a visitor cannot inflate scans or fake a
  post), and credits a table only if that code belongs to the same business and is on. It stores
  nothing about the person.
- **In the admin** (a business's page, below the editor): add a code (a label such as Table 4,
  Counter or Window; at most 30 per business), rename it, switch it off or on, and download it
  as a PNG or as an A5 print sheet (PDF). The code itself is made on the server at random (8
  characters, no look-alikes) and never changes: it is printed on a table, so the only way to
  retire one is to switch it off and make another. Each code's scan count (all time and the last
  7 days) is shown. Each change is audited first, like the rest of Sync.
- **The address a code points at** is `NEXT_PUBLIC_SITE_URL` (or, if that is not set, the
  address the admin is using), and it is shown under each code. Check it before printing:
  a code printed from a preview deployment points at the preview. A QR code on a preview
  deployment points at production when the variable is set for Previews too.
- **The files.** The PNG is at least 1000 px with whole-pixel squares and a 4-square quiet
  zone. The PDF is drawn with vectors and the standard Helvetica fonts, so it needs no
  library and embeds no font; a name those fonts cannot draw (Devanagari) is left off the sheet,
  and the QR code and the instruction stay. Both were scanned with a real QR reader in the tests.
- **Dependencies.** `qrcode` (runtime, pure JavaScript, MIT) makes the squares. `jsqr`
  (dev only, Apache-2.0) lets the tests scan the generated images.
- No migration: the tables are from 0018.

## The website badge (patch 4b)

- **What it is.** A small red "Ask KastoChha" button a business pastes on its own website
  (`public/badge-widget.js`). It opens a popup with two links: **Share Your KastoChha Experience**
  (the business's own page on KastoChha, where the box to write an experience is) and **Ask
  KastoChha Assist about us** (the chat, asked about the business).
- **It is part of Sync now.** The badge names a business by its Sync address (its slug), not by
  its name: `data-business="himal-brew-house"`. A business tagged in Sync can have the badge; one
  whose tag is removed loses it from every site it was pasted on, within a minute, with nothing to
  change there. There is no second list to keep. The admin shows the exact line to paste on each
  business's page (a "Website badge" section, after the QR codes).
- **Why "Share" goes to the thread.** The old badge sent the raw name to the home page's share
  box, which made a post's address from the name alone ("himal-brew-house"), a different thread from
  the business's own ("himal-brew-house-jhamsikhel"). The link now goes to the business's page, where
  the box posts under the pinned title and category. A badge click is not a visit: those posts never
  get a "Visited" label, which is for people who scanned a QR code.
- **The check** (`/api/badge/check`) answers one question: is this business on Sync right now? A yes
  carries only what the business's page already shows: its name and where its thread is. It is limited
  per visitor address (120 a minute), cached at the edge for 60 seconds (30 for a no), and fails closed:
  any trouble means no badge. It is open to any website (CORS `*`), which is the point.
- **The script trusts nothing from the server.** The name is put in as text, never as HTML, and the
  thread address must be one of KastoChha's own `/discussions/...` pages, so a tampered answer cannot
  send a visitor anywhere else. A name typed where the address belongs is refused with a clear message
  in the console, and asks the server nothing.
- **What it counts.** Three events, against the business: the popup opened (once per page view) and a
  click on each link (`badge_open`, `badge_share`, `badge_ask`, migration 0022). Sent with a request
  that carries no cookies, survives the page being left and shows nothing in the host site's console.
  Nothing is recorded about the visitor, and nothing is sent when a page merely loads. The admin shows
  the totals and the last 7 days.
- **The old table.** `badge_businesses` is no longer read by anything. Migration 0022 removes its
  public-read policy (so the names are no longer readable with the public key) but leaves the table
  and its rows alone: drop it by hand (`drop table public.badge_businesses;`) when you are sure it
  holds nothing you want. The home page's `?share=` handler was only for the old badge; it is
  unused and harmless, and can be removed later.
- **Changing the script changes every embed at once.** `/badge-widget.js` is not versioned, and a
  business pastes it once. It is covered by tests that run the real script in a simulated page against
  the real routes; keep it that way.
- **Limits.** A host site's own security settings, or an ad blocker, can stop the badge or its counts.
  That only shows on a real site: check it once on a real page after deploying.
- **Dependencies.** `jsdom` (dev only, MIT) lets the tests run the script in a simulated page. The
  26 series is used because newer ones need a very recent Node.

## The overview and the Sync look (patch 5)

- **Where things are now.** `/admin/sync` is the **Overview**. The list of businesses moved to
  `/admin/sync/businesses`; the tag form (`/admin/sync/new`) and a business's page
  (`/admin/sync/<id>`) are where they were. The admin home still opens `/admin/sync`.
- **What the Overview shows**, for the last 7 days, the last 30 days or all time (a rolling
  window, not calendar days): QR scans, hub taps (share, Google, Maps), website badge opens and
  link clicks, and posts (experiences and questions) on the tagged businesses' threads; a table
  with one row per business, those needing something first; scans per day for the last 30
  days; each kind of activity as a bar; and the most scanned QR codes. Every number is a count.
  It does not follow a person from a scan to a post (nothing links them yet), so it shows no
  conversion rate: a ratio of posts to taps would claim more than the data can say. Taps show
  intent only; Google does not say whether a review was posted.
- **Days are Nepal days** (UTC+05:45, no daylight saving): a scan at 11 p.m. in Kathmandu belongs
  to that day. The day turns over at 18:15 UTC.
- **What "needs attention" means**, worked out from the last 7 days whatever range is shown, most
  urgent first: no QR code at all, or every code switched off (weight 3); a working code but no
  scans this week (2); no Google link yet (1, a to-do, not a fault: a business with no Google
  profile is a normal starting point). The first is the status; the rest are listed as "+N more".
- **Counting is paged.** Hosted Supabase never returns more than its max-rows setting (1,000 by
  default) from one request and says nothing when it cuts a result short. Patches 4 and 4b read
  scan and badge counts in one request, so they would have stopped at 1,000 per business without
  a sign. They now read every page (`lib/sync/paging.js`), as the Overview does. A read that gives
  up (100,000 rows) says so on the page. The pages are ordered by time and id, so rows that share a
  timestamp are never skipped or repeated.
- **A failed read is never shown as zeros.** If anything cannot be loaded the page says so and shows
  no numbers: a page full of zeros reads as "nothing is happening".
- **Reading is done in memory.** Events and posts for the range are read and added up in the
  server. That is right for a pilot (a few businesses, thousands of events). When the numbers grow
  into hundreds of thousands, move the adding-up into the database (a view or a function) and keep
  this page's shape.
- **The Sync look** (dark sidebar, pale page, IBM Plex, teal) is for every page under `/admin/sync`
  and nothing else: its layout loads the fonts and the stylesheet, every rule sits under
  `.sync-shell`, and a test fails if one does not. An admin sees the sidebar; anyone else sees the
  page's own plain "admin access required" message. The pages that were there before keep their
  markup and are restyled to match. On a phone the sidebar becomes a bar along the top.
- **Never use a `<nav>` element in these pages.** The site's stylesheet makes every `<nav>` its fixed
  top bar. The sidebar links and the range tabs are `<div role="navigation">`; a test fails if a
  `<nav>` comes back.
- **No migration, no new package.** It reads what patches 2 to 4b collect.

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
