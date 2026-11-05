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
6. Posting through the hub: the Visited label, asking a question and the "copy and open Google" step (done).
7. Private feedback and the admin inbox.
8. Linking the owner's account, and the "Verified business" label.
9. Pilot pack (done): a CSV export, a runbook, and a final smoke test.

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

## Posting through the hub (patch 6)

- **"Visited" works through a cookie, not a link.** Scanning a card (`/q/<code>`) gives the browser a
  cookie for that one business, `kc_v_<slug>`: signed with SYNC_HUB_SECRET, good for 6 hours, bound to
  the business and the card, HttpOnly (a script on the page cannot read it) and Secure over https. It
  is given on every real scan, counted or not, so scanning again starts the 6 hours again. Link
  previews, crawlers and scripts get none. Nothing about it is in the web address, so sharing a page
  never shares the label, and the browser cannot ask for the label: it is decided on the server.
- **Earning it.** An experience (never a question) posted on a tagged business's thread, with a good
  cookie for that business, that is the person's first such post on that thread today (a Nepal day),
  is stored with `source = 'qr'` and drawn with a Visited mark. It also counts as a `post_created`
  event against the card. One a day per person per business is checked in the posting route, not in
  the database, so two posts sent at the same instant could both be labelled: low stakes, and a
  database rule would need an immutable day expression.
- **What Visited means, and the page says it.** The person opened the business's QR link in the 6
  hours before posting. It is not proof of a visit: a link can be forwarded.
- **The label never costs a post.** No secret, no cookie, a bad, expired or other business's cookie, a
  question, a removed business, a lookup that fails, a count that fails: each just means no label (or
  no count) and the post is saved as it would have been. If the `source` column does not exist yet the
  post is saved without it and keeps its thread (this is handled before the older topic_slug fallback,
  which would otherwise take a missing `source` for a missing `topic_slug` and drop the thread). An
  ordinary post, with no such cookie, does no extra lookup at all.
- **Without SYNC_HUB_SECRET** (or with one shorter than 32 characters) no cookie is made and no post is
  labelled; everything else works. The Overview says so.
- **Ask a question.** The hub's options are now Share, Review on Google (if there is a Google link),
  Ask a question, Find us on Google Maps (if there is a link). Ask goes to the business's page at
  `#ask`: a box that posts a question (kind `question`, under the thread's pinned title, so it lands in
  the right thread) which anyone can answer. It is open on a page with nothing else on it and closed
  otherwise, and opens when the address ends in `#ask`. "Send a private note" arrives with the inbox.
- **Copy my text and open Google.** After posting on a business that has a Google link, an offer (never
  a step: "Not now" is as easy): copy the person's own words and open Google's review box. KastoChha
  cannot post a Google review for anyone and says so. The order matters, and a real browser taught it:
  the copy is made first and waited for (a second at most), and only then is Google opened, because a
  browser refuses a copy once a new tab has taken focus (asking for both at once failed in Chrome). The
  card always shows a plain "tap here to open it" link afterwards, for a browser that blocks the new
  tab. If the copy is refused or slow, Google still opens and the page says it could not copy.
- **New reportable events.** A visitor's browser may now report `hub_ask` and `google_copy` (taps), as
  well as the hub's and the badge's. `scan`, `post_created` and the rest stay server-only.
- **The Overview** counts Ask taps, copy-and-open-Google taps and Visited posts.
- No migration: the `source` column and the event types are from 0018.

## Private notes and the inbox (patch 7)

- **For the customer.** The hub's "Send a private note" opens `/hub/<business>/note`: a box for the note (at
  most 2,000 characters), an optional way to reach them (at most 120; any form: a number, an email, "ask for
  Sita"), and a button. No login. It says plainly that only the business and the KastoChha team can read it and
  that it is never posted. The page is kept out of search engines, like the hub.
- **What is kept.** The note's words, the optional contact, which business it is for, whether it was flagged
  urgent, its status and its dates (`sync_feedback`, migration 0018): nothing else. No address, no browser, no
  account. A test fails if another column is ever written.
- **The words never go where they should not.** A failed save logs the database's error *code* only, because a
  database's message can quote the row that was refused, and the row is a private note. The audit log records
  which note moved and where it stands, never its words or the contact. Notes are shown as text in the inbox,
  never as markup.
- **Guarding an open door without locking it.** There is no login, so: five notes per visitor address per ten
  minutes (Upstash; a café's customers share one Wi-Fi address, so it is not lower); at most 100 notes per
  business per day, counted in the database, so a flood stops even when Upstash is off; a hidden field no person
  can see (a program that fills every field is told its note was sent, and nothing is stored); only words are
  accepted. A business whose tag was removed takes no notes.
- **"Urgent" is a nudge, never a decision.** A note is flagged when it contains words about food, hygiene,
  safety or behaviour (whole words only: "great" is not "rat", "chair" is not "hair"; "not clean" and "wasn't
  hygienic" count; a mouse counts only when one was seen or found, not "mouse pad"). Plain "staff" is left out
  on purpose: "lovely staff" would be an emergency. A note with none of these words can be just as serious: a
  person on the team reads every note before anything is forwarded. The few Devanagari words in the list need a
  native speaker's check. Keep the lists in `lib/sync/feedback.js`.
- **The inbox** (`/admin/sync/feedback`, with the number of new notes beside it in the sidebar and a line on the
  Overview): tabs All, Urgent, New, In digest, Resolved, each with its exact count; open urgent notes first, then
  newest first. A note moves new, in digest, resolved, and back (resolving stamps the time; reopening clears it).
  "Forward now (copy)" copies one note to send on its own. Each business with new notes has a digest card: the
  numbered message the team copies and sends on WhatsApp (urgent first, then oldest first, ending with the
  reminder that notes are private, public posts are never removed on request, and there are no rewards for
  reviews), and "Mark all sent", which moves that business's NEW notes (only those) to "in digest".
- **A failed read is never an empty inbox.** If the inbox cannot load, it says so and shows nothing.
- **Not built, on purpose.** Owners do not see notes: they arrive through the team's digest. Owner access comes
  with owner linking (patch 8). There is no delete button: decide how long private notes are kept, and clear
  resolved ones by hand (`delete from public.sync_feedback where status = 'resolved' and handled_at < ...`).
- No migration: the table and its limits are from 0018.

## Owner linking, "Verified business" and the owner's reply (patch 8)

- **Linking an owner is done by hand, by the team, in two steps.** On a business's admin page, "Verified owner":
  look the account up by the email the owner signed up to KastoChha with, check that it is the right person, then
  link it. The account's email must be verified (the label means "we know who is behind this"). One account per
  business (`sync_merchants.owner_user_id`); an account can be the owner of more than one business. Linking and
  unlinking are admin-only and audited by account id (never an email or a name, not even in a failed entry).
  Unlinking takes the right away at once. A business whose tag was removed cannot be given an owner.
- **What the owner can do.** On their own business's page, reply to a post (an experience or a question): one reply
  per post, up to 1,500 characters, shown directly under the post it answers with the business's name and a
  "Verified business" label. They can edit and delete their own reply, and nothing else: they cannot touch anyone
  else's post. They can NOT post an experience about their own business (they reply instead); questions are fine.
  A reply cannot be replied to. The replies belong to the business, not to one person: a new owner can edit what
  the business said.
- **A team member** can remove a reply, and that is recorded (which reply and whose, never what it said). A team
  member cannot reply as a business.
- **A reply is not an experience, by construction.** It lives in its own table (`sync_owner_replies`, migration
  0023), not among the posts. Everything that counts or ranks experiences (the Ramro / Thikai / Naramro tally,
  experience counts, trending, votes, the Visited label, the Overview) reads `reviews` and never sees it. This is
  different from the earlier plan (a reply as a new kind of post with a link to its post): the separate table is
  safer, because no counting code, present or future, can mistake a reply for an experience. One reply per post
  is a database rule (unique on the post), so a double click or two tabs cannot make two. A reply goes when its
  post goes, and when its business goes.
- **Who may do what is decided on the server, from the signed-in account.** The thread page tells the browser
  only yes or no ("may reply", "may remove"), never who the owner is. A test fails if the owner's account id can
  reach a page or a reply.
- **The cost of "owners do not post experiences about their own business":** every experience post now makes one
  small lookup (is the poster this business's linked owner?), on an indexed column. A failed lookup never blocks a
  post.
- **A defect found and fixed here.** The thread card never draws a question as a row (a question is a heading
  there). The Ask box (patch 6) saved a business's question under the business's own title, so the question was
  stored and never shown anywhere. A business page now shows its questions in their own "Questions about
  <business>" section, newest first, with the business's reply under each; the person who asked can delete their
  own question. The thread also remounts when its posts change, so a question just asked appears after the page
  refreshes. Answers to a question are the business's reply and the experiences people share below it.
- **Not built.** Replies show on the business's own page only, not inside the cards on the discussions list. An
  owner cannot yet see a dashboard of unanswered posts. No notification is sent to an owner when someone posts.
- Migration 0023 only adds the table; it does not touch `reviews`.

## The pilot pack (patch 9)

- **Three files to download** (`/admin/sync/export`, admin only, never cached): the businesses (every one ever
  tagged, with what is set up for it), the QR cards (with how many times each was scanned, all time), and an
  activity report per active business for 7 days, 30 days or all time (the Overview's own numbers, plus the
  business's replies and private notes). "CSV" was taken to mean an export, not a bulk import: for a pilot of a
  handful of cafés a report you can send each café is worth more than importing them, which takes a minute each by hand.
- **Safe to open in a spreadsheet.** A name someone typed that begins with `=`, `+`, `-` or `@` (or a tab or a
  carriage return, or those after spaces) would be run as a formula by Excel or Sheets. Such text gets a leading
  apostrophe; numbers are left as numbers. Cells with commas, quotes or line breaks are quoted. Rows end with CRLF.
  The file starts with a byte-order mark so Nepali names show correctly in Excel. Dates are Nepal time.
- **Whole or not made.** Counts page past the server's 1,000-row cap; a read that fails, or more than 100,000 events
  in one file, is an error the team sees, and no file is downloaded. Never a short file that looks complete.
- **What is deliberately not in any file:** private notes (their words and contacts), a reply's words, account ids,
  emails, the Google links themselves (only yes or no).
- **The smoke test** (`scripts/sync-smoke.mjs`, logic in `lib/sync/smoke.mjs`): 14 quick checks for one test
  business, run against any address. Read-only by default and safe on the live site: it identifies itself as a bot
  (a test fails if the site's own bot detector stops recognising its name), so it is never counted as a scan; the only
  requests that could write are an empty note (refused) and a spam-trap note (ignored). `--count-scan` makes one real
  scan and says whether Visited labels are on; `--write` sends one real note marked SMOKE TEST. It exits 1 if
  anything fails, and says not to go live. It was run against the real production build, and the checks match.
- **The runbook** (`runbook.md`): setup, the migrations in order with how to verify them, onboarding a café, the
  daily and weekly routines, the smoke test, what to do when someone asks, a symptoms table, and what is stored about
  people. A test checks it against the repo (every migration named in order, every setting real, every screen real,
  the commands matching), so it cannot quietly go stale.
- No migration and no new package.

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
