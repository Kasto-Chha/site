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

The old website badge table can be dropped by hand once it is empty: `select count(*) from public.badge_businesses;` and, if it says 0, `drop table public.badge_businesses;`.

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
