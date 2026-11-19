# KastoChha Sync: runbook

For the team running the pilot. Plain steps for the jobs you will do, and what to check when something looks wrong.
How the pieces work is in `stage-a.md`; this is how to run them.

## One-time setup

**Settings in Vercel** (Settings, Environment Variables, for Production and Preview). After changing one, redeploy.

| Name | What it is |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | The site's address, `https://www.kastochhanepal.com`. QR codes are made from it. |
| `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | The database. The service key stays on the server. |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | Sign-in. |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | The speed limits (private notes, posting, taps, votes). Without them, or if the database cannot be reached, the limits are off and the Overview says "Speed limits are off". Copy both from the database's REST API section in Upstash, and use the main token, not the read-only one. |
| `SYNC_HUB_SECRET` | Makes the "Visited" label possible. At least 32 characters: make one with `openssl rand -hex 32`. Without it everything works except the label, and the Overview says so. |

**Database steps**, in the Supabase SQL editor, in this order, each once. Run only the ones not already run.

1. `0018_sync_foundation.sql`: the businesses, QR codes, events and private notes tables.
2. `0019_sync_thread_summary.sql`: the view the discussions list uses.
3. `0020_sync_kind_label.sql`: the "what is this business?" words for type Other.
4. `0021_sync_thread_title.sql`: pins each business's thread title.
5. `0022_sync_badge_events.sql`: lets the website badge record its events. Check it worked: `select pg_get_constraintdef(oid) from pg_constraint where conname = 'sync_events_type_check';` and look for `badge_open`.
6. `0023_sync_owner_replies.sql`: a business's replies. Check: `select count(*) from public.sync_owner_replies;` returns 0.
7. `0024_sync_audit_log_private.sql`: closes the admin audit log to the public key. Run it once; it changes no data. Check, with the project URL and the public (anon) key: `curl -s "$URL/rest/v1/admin_audit_log?select=id&limit=1" -H "apikey: $KEY" -H "Authorization: Bearer $KEY"` now says `permission denied for table admin_audit_log` (before it, it answered an empty list).
8. `0025_sync_team_and_tasks.sql`: the operator list, which businesses each operator works on, and the team's tasks. Run it on staging first, then on the live project when the patch is released. Safe to run twice; it changes no existing table. Check: `select count(*) from public.sync_tasks;` returns 0, and with the public key `curl -s "$URL/rest/v1/sync_tasks?select=id&limit=1" -H "apikey: $KEY" -H "Authorization: Bearer $KEY"` says `permission denied for table sync_tasks`.
9. `0026_sync_stages.sql`: adds a stage (WIP, Active or Free) and the 90-day trial dates to every business, as private columns. Run it **before** pushing the patch. Safe to run twice; it changes no existing value. Every business that already exists becomes **WIP**, with the trial starting the day you run it, because nobody is paying yet. Check: `select business_name, stage, trial_ends_on from public.sync_merchants;` shows WIP and a date 90 days away.
10. `0027_sync_prospects.sql`: the Audit list (businesses we are about to pitch, with the facts typed from their Google profile). Run it **before** pushing the patch. Safe to run twice; it adds one private table and changes nothing that exists. Check: `select count(*) from public.sync_prospects;` says 0.
11. `0028_sync_report_link.sql`: adds the private report link to the Audit list: a random address per report, a count of opens and the last open. Run it **before** pushing the patch. Safe to run twice; it adds three columns and one index and changes nothing that exists. Check: `select report_token, report_opens from public.sync_prospects limit 1;` runs without an error.
12. `0029_sync_report_settings.sql`: the report's price and numbers, kept in the database (one private table), and a place on each prospect to keep a copy of them when its report is sent. Run it **after 0028** and **before** pushing the patch. Safe to run twice; it adds one table and one column and changes nothing that exists. Check: `select count(*) from public.sync_report_settings;` says 0.
13. `0030_sync_google_numbers.sql`: the monthly Google numbers typed in by hand (one private table; deleting a business deletes its numbers). Run it **before** pushing the patch. Safe to run twice; it adds one table and changes nothing that exists. Check: `select count(*) from public.sync_google_numbers;` says 0.

The old website badge table can be dropped by hand once it is empty: `select count(*) from public.badge_businesses;` and, if it says 0, `drop table public.badge_businesses;`.
14. `0031_sync_health_checks.sql`: the profile-health checks typed in by hand (one private table; deleting a business deletes its checks). Run it **before** pushing the patch. Safe to run twice. Check: `select count(*) from public.sync_health_checks;` says 0.
15. `0032_sync_posts.sql`: the posts plan typed in by hand (one private table; deleting a business deletes its posts). Run it **before** pushing the patch. Safe to run twice. Check: `select count(*) from public.sync_posts;` says 0.
16. `0033_sync_replies.sql`: the replies queue typed in by hand (one private table; deleting a business deletes its replies). Run it **before** pushing the patch. Safe to run twice. Check: `select count(*) from public.sync_replies;` says 0.
17. `0034_sync_menu_items.sql`: the menu, rooms and rates, or services, typed in by hand (one private table; deleting a business deletes its list). Run it **before** pushing the patch. Safe to run twice. Check: `select count(*) from public.sync_menu_items;` says 0.
18. `0035_sync_feedback_shared.sql`: records which customer notes the team has passed on to the business (one new column on `sync_feedback`; notes already marked "in digest" are stamped as passed on, resolved ones are not). Run it **before** pushing patch 14m: the digest buttons write this column. Safe to run twice. Check: `select count(*) from public.sync_feedback where shared_with_owner_at is not null;` equals the number of notes currently "in digest".
19. `0036_sync_owner_feedback.sql`: the owner's comment on menu items, posts and replies, and the team's question and the owner's answer on replies (new columns only, nothing is removed). Run it **before** pushing patch 14n. Safe to run twice. Check: `select count(*) from public.sync_replies where owner_answer is not null;` says 0.
20. `0037_sync_owner_whatsapp.sql`: the owner's WhatsApp number and when the team last messaged them (two new columns on `sync_merchants`; nothing is removed). Run it **before** pushing patch 14o. Safe to run twice. Check: `select count(*) from public.sync_merchants where owner_whatsapp is not null or owner_messaged_at is not null;` says 0.
21. `0038_sync_ai_drafts.sql`: the optional AI reply drafts: a one-row settings table (starts OFF) and a small per-day usage table (two new private tables; deleting a business deletes its usage). Run it **before** pushing patch 14p. Safe to run twice. Check: `select replies_enabled from public.sync_ai_settings;` says `false`.
22. `0039_sync_billing.sql`: billing recorded by hand: a one-row money settings table, a payments table, and an optional agreed price per business (two new private tables and one new column on `sync_merchants`; deleting a business deletes its payments). Run it **before** pushing patch 14q. Safe to run twice. Check: `select count(*) from public.sync_payments;` says 0.

## The Audit (admins only)

**Audit** in the sidebar is for businesses you want to approach. **New audit** asks for the name, area and type. Then you open the business's public Google profile in another tab and answer the questions on the page; a question you cannot tell is left empty and is left out of the score. The page works out the score and the five fixes from fixed rules (the same facts always give the same score), and you write the three drafts (description, categories, festival hours). **Save for later** keeps your place. **Make the report** needs both boxes ticked (you checked the facts, you read the drafts); changing the facts or drafts clears them. Then record how and when you sent it, and whether they replied. **Tag as business** opens the usual form with the details filled in, and links the audit to the business. A place that is already on the list, or already a business, cannot be added twice. Every change is in the audit log (statuses and ids, never the facts or drafts).

### The report and its private link

**Make the report** also makes its private link (`/report/<a long random address>`). Under **The report** on the audit page you can preview the **full report** (five pages) and the **short summary** (two pages), copy either link, and copy the email and the short WhatsApp message that go with it. For a PDF, open a preview and use **Print or save as PDF**, then choose Save as PDF: nothing is built on the server, so it costs no Vercel time. Anyone with the link can read the report and it is kept out of search engines, so send it only to the business. **Make a new link** kills the old address and starts the count again; **Stop the link** turns it off. Editing the facts again also takes the link off until the report is made again. **Opened** counts real opens only: link-preview robots (WhatsApp, Facebook and the like) and your own previews are not counted, and nothing about the person who opened it is kept.

What the report says about price and how to reach you is set on **Audit, Report settings** (admins only): the price after the 90 days, the phone, the WhatsApp number and, if you have one, a booking link (https only; empty leaves its line out). Until the first three are filled in the report shows `[PRICE]`, `[PHONE]` or `[WHATSAPP]`, and the audit page warns you before you send. A change takes effect at once, with no redeploy. When you record a report as sent, the price and numbers it showed that day are saved with it, so changing the settings later never alters a report an owner already has. (If a placeholder was still showing when you recorded it as sent, nothing is saved, and the report keeps following the settings until you fix them.) The log records which settings changed, never their values.

## The Google tab and the monthly numbers

A business's **Google** tab (admins and the operators assigned to it) is the Google half, typed in by hand until the Google connection is approved. It starts with **Google numbers for a month**: open the business's Business Profile screen on Google, read the Performance figures for a month (calls, directions requests, profile views, average rating, total reviews) and type them in. A figure that is not shown can be left empty, but at least one is needed. Typing a month again replaces it; **Edit** puts a saved month back in the form, and **Remove** deletes one typed by mistake (it asks twice). The audit log records the business and the month, never the figures. A business on the Free plan has the form held, because we do not work on its Google profile; the months already typed stay visible. Deleting a business deletes its numbers with it. These figures will feed the monthly report.

### Profile health

On the Google tab, **Profile health** is 22 checks of what the public sees on Google, in six groups. Press **Check again** and type in what the public profile shows today; leave a question empty when you cannot tell (it is left out of the score, never counted against the business). The score is the share of the checks that could be judged which pass: fixed rules, not a ranking. Each check is saved, so the history shows the score over time. **Make a task** (or **Make tasks from all gaps**) turns a failed check into a task; pressing twice never doubles a task that is still open. The free audit has its own 13-check score on a different scale and is shown beside, never inside, this history. A Free business is held.

### Posts

On the Google tab, **Posts** is the plan for what goes on the business's Google profile. **Add a post** (or press a festival name for a head start; festival dates move every year, so check the date). A post moves Idea, Drafted, Waiting for owner, Approved, Published. A post cannot be sent to the owner, approved or marked posted while it has no words. **Copy for Google** copies the text to paste into Google; then press **Mark as posted** (this records the day). Posts are kept after posting. Remove asks twice. A Free business is held, but its posts can still be removed.

### Replies

On the Google tab, **Replies** is the queue of reviews that need an answer. **Add a review** (paste the reviewer's name, the stars and the words, and the day), write our reply, and move it along: New review, Drafted, Waiting for owner, Approved, Posted. **Ask the owner** parks a review while we need a fact from the owner before we can write (what really happened, whether a refund is agreed). **Send for the owner** is the draft going to the owner for a yes. A reply cannot be sent to the owner, approved or marked posted while it has no words. **Copy for Google** copies the reply to paste into Google; then press **Mark as posted** (this records the day). Reviewer names are personal data: they stay in this table and are never written to the audit log. Remove asks twice. A Free business is held, but its replies can still be removed.

### The monthly report

On the Google tab, **Monthly report** opens one A4 page for the owner (admins only). It puts the month's Google calls, direction requests and profile views beside the month before, with the star rating and review count, then lists what we did that month (posts posted, reviews answered, jobs finished, by type), the profile checklist score, and what is still to fix. Use it like this: type the month's figures from the Business Profile screen on the Google tab (replace them if they were wrong), open the report, read it, press **Print or save as PDF**, and send the PDF. The report is made fresh each time you open it; nothing is stored or sent from the page. If a figure was not typed in it says so instead of guessing. The note typed with the figures is printed, so keep it fit for the owner. The report never says the work caused the change.

### Menu, rooms and rates, services

On the Google tab the next panel is named by the business type: **Menu** for cafés, restaurants, bakeries, bars and sweet shops, **Rooms and rates** for hotels and homestays, **Services** for the rest. Add each item with a name, an optional section, a price in whole rupees (or none), a unit such as "per cup" or "per night", and a short description. An item starts as a **Draft**. **Send for the owner** (or **Send all drafts for the owner**) puts it with the owner; once the owner has agreed, press **Owner confirmed** (or **Owner confirmed all waiting**). Changing what a confirmed item says (name, section, price, unit, description) turns it back into a draft, so a changed price is never shown as confirmed. **Copy confirmed items** gives plain text to paste; **Copy everything** includes drafts. Up and Down reorder inside a section. This is our own record: it is not posted to Google from here, because menus on Google for Nepal are not confirmed. Names and prices are never written to the audit log. A Free business is held, but its items can still be removed.

## The owner dashboard

Owners sign in at `/owner` with the account the team linked to their business (Setup tab, Owner). One business: they go straight to it; several: they pick; none linked: a message tells them to ask us. An owner sees only their own business: this month's Google figures beside last month, the profile checklist and what we are working on, what we did, the monthly report (print or save as PDF), and an **Inbox** of customer private notes. They never see the team's tasks, the team's private notes, the note typed with the Google figures, or the audit log. The page is kept out of search engines.

**Inbox:** the owner sees a customer note only after the team has passed it on: **Mark sent in digest** (one note) or **Mark all sent** (a business's digest) is what releases it. Putting a note back to New hides it again. Resolving a note keeps it visible only if it was passed on first; a note resolved straight from New is never shown to the owner. Urgent notes show an Urgent mark until resolved. The inbox is read only: the owner follows up with the customer themselves.

**Needs you:** the home page shows "N things need you" when the team has sent something to the owner. The owner opens it and, for each menu item, post or reply draft that is **Waiting for owner**, taps **Looks right** (it becomes Confirmed / Approved) or **Needs a change** with a short comment (up to 300 characters; it goes back to the team as a draft with the comment shown on the team's list as "Owner asked for a change"). A menu can be approved in one go with **All look right**. Only items that are Waiting for owner can be decided, so a second tap or a stale page is refused politely. When a reply is **Asking the owner**, the team must first type the question (the **Question for the owner** box in the reply's Edit form); the owner sees the review and the question and types an answer (up to 1,000 characters). The answer goes to the team only and is never posted as written; the team writes the reply and sends it back to the owner to approve. The owner never sees a post's team title, who created anything, the team's notes or the audit log. A Free business is held. The audit log records who and which item, never the comment or the answer. Sending an item to the owner again clears the old comment.

## Messaging the owner on WhatsApp

The owner dashboard only helps if the owner knows something is waiting. There is no automatic message: your team sends it from their own phone, so no WhatsApp service or fee is involved. On a business's **Google** tab, the top card **Message the owner** shows how many things are waiting for the owner (menu items, posts and reply drafts that are Waiting for owner, and questions not yet answered) and a ready message with the owner's own link to the Needs you page. The message holds counts and the link only, never a review, a price or a comment.

Press **Open WhatsApp**: WhatsApp opens with the words typed in. If you have saved the owner's number (**Owner's WhatsApp number**, a Nepal mobile like 9841 000 000 is fine) it opens straight to them; without it WhatsApp asks you to choose the contact. Read it, change it if you like, and send. Then press **Mark as sent**, so the card shows "Last messaged" and a teammate does not send the same reminder. **Copy message** is there for when you would rather paste it somewhere else. A business with no linked owner account (Setup tab) shows a warning, because the link would not work for them. A Free business has no card. The audit log records who saved a number or marked a message sent, never the number itself. Both operators and admins can use the card on the businesses they work on.

## AI drafts of review replies

An optional helper, **off until an admin turns it on**. On a business's Replies list an admin sees **AI drafts of replies: Off** with a **Turn on** button (and **Turn off** to stop it at once; no redeploy needed). When it is on, the team sees **Draft a reply** in the review's Edit form. It sends the review text, the star rating, the business name and type, and any facts the owner gave (their answer, or their requested change) to Gemini, and puts a first draft in the reply box. It never sends the reviewer's name.

Nothing is saved or posted by the button: the team reads the draft, fixes it and saves, the owner approves it, and the team posts it on Google by hand, as before. The draft follows fixed rules: thank them, apologise for a bad experience without arguing, no invented facts, offers, refunds or contact details, short, and in the language of the review. It cannot know anything beyond the review and what the owner told us, so a review that needs a fact still goes through **Ask the owner** first. If a reply is already in the box, the button asks "Really replace my reply".

Each business gets 20 drafts a day (Nepal day), so the free Gemini allowance, which the site's chat also uses, cannot run out. It needs the same `GEMINI_API_KEY` the chat uses; without it the button does not appear. Operators can use it on their assigned businesses; only admins can switch it on or off. Free businesses are held. The audit log records who used it and who changed the switch, never the review or the draft.

## Billing

Businesses pay you outside the site (cash, bank transfer, eSewa, Khalti). The team records each payment by hand, so you always know who is paid up, due or late, and can hand over a receipt. Billing is for **admins only**: an operator never sees money.

**First, set the money settings** on the **Billing** page (sidebar): the standard monthly price in rupees, **How to pay** (your eSewa or Khalti number and bank account, which goes into every reminder), and the line printed at the bottom of receipts (your business name, address, PAN if you have one).

**Who is billed.** Only an **Active** business pays. A trial (WIP) is not billed; a Free business is not billed at all. An Active business owes from the later of the day its trial ended and the day it was made Active. Each payment covers whole months, and the next period starts the day after the last covered day. The business's **Plan** tab shows where it stands: Paid up to a date, Due in N days (the last 7 days), Due today, or Overdue by N days.

**Recording a payment** (Plan tab, Payments): the amount received, how many months it pays for, how it was paid, the day it was received, and an optional reference (the transaction number) and note. Leave **First day it covers** blank to continue from where the last payment ended; for a business's first payment that is the day its trial ended. Each payment gets a receipt number (KC-00001, running across all businesses). A payment can be recorded during the trial, as a payment in advance; it is not allowed for a Free business.

**A mistake is cancelled, never deleted.** **Cancel payment** asks for a reason (press **Really cancel**); the payment stays in the history, struck out with the reason, and no longer counts towards the paid-up date or the receipt.

**An agreed price** for one business goes in **Price for this business** on its Plan tab; blank means the standard price. A price of 0 is allowed for a free-of-charge deal.

**Who owes what.** The **Billing** page lists every Active business, the ones to chase at the top, with a **Remind on WhatsApp** button: it opens WhatsApp with the reminder typed in (the amount, the date, and how to pay), straight to the owner if their WhatsApp number is saved on the Google tab. Your own phone sends it; nothing is sent automatically.

**Receipts** open from the history (**Receipt**): a printable page, Print then Save as PDF. It says the payment was received and is **not a tax invoice**: if you must issue PAN or VAT bills, ask your accountant and keep doing that separately.

The audit log records who recorded, cancelled or changed what, never the amounts, references, notes or reasons.

## Stages and the 90-day trial

Every business has a stage. **WIP** is the trial, with onboarding inside it: the whole service runs until the decision day. **Active** means they pay. **Free** means they chose not to pay: the business keeps its page, label, QR cards and badge on KastoChha, and we do nothing on its Google side.

A business you tag starts as WIP for 90 days. A trial that reaches its end date with no yes becomes **Free on its own**; nothing runs in the background, the dates are simply read when a page opens. Check-ins fall on days 30, 60 and 80, and from the last 10 days the business page says "Decide by" with the date. Day 0 is the day the trial starts and day 90 is the decision day.

On a business's page, the **Stage** panel (admins only) has the moves: **Make Active**, **Move to Free**, **Start a trial again**, and **Change the end date** (which needs a reason). **Move to Free** cannot finish until you tick that KastoChha has been removed as a manager on the business's Google profile, which you do yourself in Google. Every move is recorded in the audit log with the stage and the dates, never the note's words. An Active business never goes back to a trial; to run another trial, move it to Free first.

## The business page, its tabs, and deleting a business

The **Businesses** list has stage chips (All, WIP, Active, Free) with a count on each, and a search box that finds a business by name or area. The choice is kept in the address, so a view can be bookmarked.

One business's page has a header (its stage, thread, and **Open on Google** when it has a Google link) and tabs: **Overview** (details at a glance and a checklist for this kind of business), **Plan** (the stage, the 90-day trial and its moves, and a history of every move: when, what, and who), **KastoChha** (QR cards, the owner's link, the website badge; admins only), **Tasks** (what the team has to do for it) and **Setup** (details, assigned operators, the business tag, delete). An operator sees Overview, Plan (to read), Tasks and Setup (details only). More tabs arrive with the pieces that fill them.

**The page follows the business's Type.** A hotel or homestay gets the Hotel page (rooms and rates, booking link), a cafe, restaurant, bakery, bar or sweet shop the Food page (menu), and every other type the general Business page. Change the Type in Setup and the page's wording and checklist change with it. The rooms, rates and menu sections themselves arrive with the Google part of Sync.

**Delete business** (Setup, admins only) is for something tagged by mistake that is not a business at all. You must type the business's name exactly. The thread and every post stay on KastoChha as ordinary posts; the QR cards, scan counts, private notes, owner replies, tasks and assignments are deleted, and it cannot be undone. It is recorded in the audit log. To only take the business header off the thread, use **Remove tag** instead.

## Operators and tasks

An **operator** is a team member who works on the businesses an admin gives them and cannot change anything else. To add one: the person signs up on the site first; then, on **Team**, enter their email, press **Look up**, check it is the right account, and confirm. Give them businesses on the Team page or on a business's own page, under **Assigned operators**.

An operator sees only **Tasks** and **Businesses** in the menu, and only the businesses assigned to them. They can edit those businesses' details and work their tasks. They cannot remove or restore a tag, link an owner, touch QR cards or the website badge, read private notes, see the Overview or exports, or reach the Team page.

To stop someone being an operator, press **Remove operator** on the Team page: their access ends at once and their tasks become nobody's. A business's linked owner cannot be made an operator.

**Tasks** is the team's to-do list: one thing to do for one business, who does it, and by when. Admins can start one from a private note with **Make a task** in the inbox; it copies what the customer wrote, never their contact details. The Overview shows how many open tasks are due today or earlier, in Nepal time.

## Onboard a café

1. **Tag it.** `/admin/sync/new`: its name, area and type (for type Other, write what it is). Add its Google place ID if it has one: that builds its Google review and Maps links.
2. **Look at its hub** on a phone: `/hub/<its-address>`. You should see Share your experience, Ask a question and Send a private note, and Google options if it has links.
3. **Make its QR cards.** Open the business from `/admin/sync/businesses`, then QR codes: one for the counter, one for each table or place, each with a label. Download the print sheet (A5 PDF). At most 30 cards per business.
4. **Print, place, and scan each one with a real phone camera.** A printed card has not been tested by a camera in the build: do it every time. The hub should open, and the scan should appear in the Overview.
5. **Website badge**, if it has a website: on its page, copy the badge line and send it to whoever looks after the site. Check it shows a red button at the bottom right.
6. **Link the owner**, when they are ready. They sign up to KastoChha with their email and verify it. On the business's page, under Verified owner, look them up by that email, check the name is right, and link. They can then reply to posts on the café's page, shown as "Verified business". They cannot post experiences about their own café.
7. **Tell the owner three things:** private notes reach them as a digest from you; public posts are never removed on request; there are no rewards for reviews.

## Every day (about five minutes)

1. Open `/admin/sync/feedback`. Urgent notes are first. Read every note: the urgent flag is a nudge, and a note without a flagged word can be serious.
2. For an urgent note, use "Forward now (copy)" and send it to the owner yourself.
3. At the end of the day, for each café under Digests to send: "Copy digest", send it on WhatsApp, then "Mark all sent".
4. Resolve notes that have been dealt with.

## Every week

1. Overview, last 7 days. Look at the Status column: **No scans this week**, **QR codes switched off** or **Add a QR code** each need a visit or a call.
2. `/admin/sync/export`: download the activity report for 7 days and send each café its row.
3. In the Feedback inbox, look at the "In digest" tab and resolve old items.

## Before and after every deploy

Run the smoke test against a TEST café: it takes seconds and is safe to run on the live site (it identifies itself as a bot and is never counted as a scan).

    node scripts/sync-smoke.mjs --base https://www.kastochhanepal.com --slug <test-cafe> --code <its-code>

Add `--count-scan` to also make one real scan and check the cookies and the Visited label's setting. Add `--write` to also send one real private note (resolve it in the inbox after). If any line says FAIL, do not go live until it is fixed.

## When someone asks

- **"Remove my review."** Public posts are not removed on request. If a post breaks the site's rules (abuse, something illegal), handle it through the site's normal moderation.
- **"Delete my private note."** There is no button. Find it, then delete it: `delete from public.sync_feedback where id = '<its id>';` (read the id from the database).
- **An owner's reply is abusive.** Signed in as an admin, open the café's page and press Remove under the reply (it is recorded). If it keeps happening, unlink the owner on the business's page.
- **A café leaves.** Remove its tag. Its hub and QR cards stop working (they go to the home page); its thread and posts stay. Its older private notes stay in the inbox, marked "(tag removed)": send or resolve them.

## If something looks wrong

| What you see | Check |
| --- | --- |
| The hub does not open, or goes to the home page | Is the business active, not removed? Is the card switched on (business page, QR codes)? |
| Scans are not counted | Are you testing from a script or a link preview? Those are never counted, by design. Scan with a phone camera. A second scan within 10 minutes is not counted again. |
| "Visited" never appears | The Overview says "Visited labels are off" if `SYNC_HUB_SECRET` is missing or short. Also: the person must scan, then post within 6 hours, and only the first such post of the day on that café gets it. |
| A private note does not arrive | Look in the inbox with the All tab. A visitor can send 20 notes in 5 minutes, and a business can receive 200 a day. A removed café takes none. |
| An owner cannot reply | Is their account linked (business page, Verified owner)? Is it the right account? A former owner is refused at once. They reply from the café's page, under a post. |
| The Overview says "Speed limits are off" | It says why. Missing: add the two Upstash settings in Vercel and redeploy. "Could not be reached": does the Upstash database still exist and show as active? "WRONGPASS": the token does not belong to that database, or it is the read-only one. Test the pair from a terminal with `curl "$URL/ping" -H "Authorization: Bearer $TOKEN"`; it should answer PONG. Until it is fixed, the only thing limiting private notes is the daily cap for each business. |
| A removed business's card, or a switched-off card, still goes to the hub | It should take effect at once. If it does not, redeploy, and tell whoever is fixing the site: the scan address must never reuse an earlier answer from the database. |
| The Overview says it could not load | It is telling you the truth: it will not show zeros it could not read. Reload; if it persists, look at the database. |
| An export says there is too much data | Choose a shorter range. |
| A post by the owner was refused | By design: an owner replies to posts, and does not post experiences about their own café. |

## What is stored about people

- **Private notes:** the words, an optional contact the person chose to leave, which café, a date. No address, no browser, no account.
- **Scans and taps:** which card or option, and when. No person.
- **A reply:** the words, which post, which café, and which account wrote it (never sent to a browser).
- **The audit log:** who on the team did what, by account id. Never a private note's words, a contact, an email or a name.
- **The exports** contain none of the above notes, and no account ids or emails.

Decide how long to keep private notes, and clear what you do not need, for example resolved ones older than 90 days:
`delete from public.sync_feedback where status = 'resolved' and handled_at < now() - interval '90 days';`

## Not built yet

An owner dashboard (unanswered posts, their own numbers), notifications to owners, replies inside the cards on the discussions list, a Nepali version of the hub (it is English only), a way to delete a private note from the screen, billing, the Google Business Profile connection, and monthly reports sent automatically. The Overview and exports read data in memory, which is fine for a pilot and stops being fine at around a hundred thousand events.
