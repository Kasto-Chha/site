// Patch 3a: a thread a business has been tagged to. The pinned title that keeps its posts in
// one thread, the links built from a place ID, and what the page says about the business.

import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { FakePostgrest } from "./support/fake-postgrest.js";

const { reviewLinkFor, mapsLinkFor, reviewLinkIsFor, mapsLinkIsFor } = await import("../lib/sync/placeLinks.js");
const { validateCreate, validateUpdate, googleLink } = await import("../lib/sync/validate.js");
const { slugToTitle, pinnedTitleFor, pinnedTitle, safeGoogleLink, businessPageFacts, businessMetadata } = await import("../lib/sync/threadPage.js");
const { topicSlug } = await import("../lib/slug.js");
const { threadSlugFor } = await import("../lib/sync/slug.js");
const { POST: createRoute } = await import("../app/api/admin/sync/merchants/route.js");
const { PUT: updateRoute } = await import("../app/api/admin/sync/merchants/[id]/route.js");
const { POST: postRoute } = await import("../app/api/reviews/route.js");
const { getMerchantByTopicSlug } = await import("../lib/sync/merchants.js");

const PLACE = "ChIJ4f81abcdefghIJK_-";

// ---------- links built from a place ID ----------

test("the review and Maps links are built from the place ID, on Google's own hosts", () => {
  assert.equal(reviewLinkFor(PLACE), `https://search.google.com/local/writereview?placeid=${PLACE}`);
  assert.equal(mapsLinkFor(PLACE, "Himal Brew House"), `https://www.google.com/maps/search/?api=1&query=Himal%20Brew%20House&query_place_id=${PLACE}`);
  assert.equal(reviewLinkFor(""), "");
  assert.equal(mapsLinkFor(undefined, "x"), "");
  // Each passes the same check as a link typed by hand.
  assert.ok(googleLink(reviewLinkFor(PLACE)));
  assert.ok(googleLink(mapsLinkFor(PLACE, "Himal Brew House")));
});

test("a name is encoded, shortened and defaulted in the Maps link, and cannot break out of it", () => {
  const nasty = mapsLinkFor(PLACE, `Tom's "Bar" & Grill <script>x</script> #1?`);
  assert.ok(googleLink(nasty), nasty);
  const url = new URL(nasty);
  assert.equal(url.hostname, "www.google.com");
  assert.equal(url.searchParams.get("query_place_id"), PLACE);
  assert.equal(url.searchParams.get("query"), `Tom's "Bar" & Grill <script>x</script> #1?`);
  assert.equal(new URL(mapsLinkFor(PLACE, "x".repeat(500))).searchParams.get("query").length, 100);
  assert.equal(new URL(mapsLinkFor(PLACE, "")).searchParams.get("query"), "Google");
  assert.equal(new URL(mapsLinkFor(PLACE, "   ")).searchParams.get("query"), "Google");
});

test("a link is recognised as the one built for a place ID, whatever name is in it", () => {
  assert.equal(reviewLinkIsFor(reviewLinkFor(PLACE), PLACE), true);
  assert.equal(reviewLinkIsFor(reviewLinkFor(PLACE), "ChIJother000000"), false);
  assert.equal(reviewLinkIsFor("https://g.page/r/x/review", PLACE), false);
  assert.equal(mapsLinkIsFor(mapsLinkFor(PLACE, "Old Name"), PLACE), true);
  assert.equal(mapsLinkIsFor(mapsLinkFor(PLACE, "Old Name"), "ChIJother000000"), false);
  assert.equal(mapsLinkIsFor("https://maps.app.goo.gl/abc", PLACE), false);
  for (const empty of ["", null, undefined]) assert.equal(reviewLinkIsFor(empty, PLACE) || mapsLinkIsFor(empty, PLACE), false);
});

// ---------- the rules: a place ID fills in empty links ----------

const BASE = { businessName: "Himal Brew House", area: "Jhamsikhel", threadMode: "new" };

test("a place ID with no links builds both; typed links are kept", () => {
  const built = validateCreate({ ...BASE, googlePlaceId: PLACE }).values;
  assert.equal(built.google_review_url, reviewLinkFor(PLACE));
  assert.equal(built.google_maps_url, mapsLinkFor(PLACE, "Himal Brew House"));
  const typed = validateCreate({ ...BASE, googlePlaceId: PLACE, googleReviewUrl: "https://g.page/r/abc/review" }).values;
  assert.equal(typed.google_review_url, "https://g.page/r/abc/review", "a typed link is never replaced");
  assert.equal(typed.google_maps_url, mapsLinkFor(PLACE, "Himal Brew House"), "the empty one is built");
  const none = validateCreate(BASE).values;
  assert.equal(none.google_review_url, null);
  assert.equal(none.google_maps_url, null);
  assert.equal(validateCreate({ ...BASE, googleReviewUrl: "https://g.page/r/abc/review" }).values.google_maps_url, null, "with no place ID nothing is built");
});

test("an edit: a link sent empty is built from the place ID already saved", () => {
  const current = { slug: "a", topic_slug: "b", status: "active", business_name: "Himal Brew House", google_place_id: PLACE };
  const result = validateUpdate({ googleReviewUrl: "", googleMapsUrl: "" }, current);
  assert.equal(result.values.google_review_url, reviewLinkFor(PLACE));
  assert.equal(result.values.google_maps_url, mapsLinkFor(PLACE, "Himal Brew House"));
  const noId = validateUpdate({ googleReviewUrl: "" }, { ...current, google_place_id: null });
  assert.equal(noId.values.google_review_url, null, "no place ID, no link");
  assert.ok(!("google_review_url" in validateUpdate({ about: "x" }, current).values), "an edit that does not mention the links leaves them alone");
});

test("an edit: changing the place ID rebuilds links that were built for the old one, and keeps typed ones", () => {
  const OLD = "ChIJoldplace12345";
  const current = { slug: "a", topic_slug: "b", status: "active", business_name: "Momo Hub", google_place_id: OLD,
    google_review_url: reviewLinkFor(OLD), google_maps_url: mapsLinkFor(OLD, "Momo Hub") };
  const moved = validateUpdate({ googlePlaceId: PLACE, googleReviewUrl: current.google_review_url, googleMapsUrl: current.google_maps_url }, current).values;
  assert.equal(moved.google_place_id, PLACE);
  assert.equal(moved.google_review_url, reviewLinkFor(PLACE), "a link for the old place is rebuilt, not left pointing there");
  assert.equal(moved.google_maps_url, mapsLinkFor(PLACE, "Momo Hub"));
  const kept = validateUpdate({ googlePlaceId: PLACE, googleReviewUrl: "https://g.page/r/typed/review", googleMapsUrl: "https://maps.app.goo.gl/typed" }, current).values;
  assert.equal(kept.google_review_url, "https://g.page/r/typed/review");
  assert.equal(kept.google_maps_url, "https://maps.app.goo.gl/typed");
  const same = validateUpdate({ googlePlaceId: OLD, googleReviewUrl: current.google_review_url }, current).values;
  assert.equal(same.google_review_url, reviewLinkFor(OLD), "the same ID changes nothing");
  assert.match(validateUpdate({ googlePlaceId: "short" }, current).error, /place ID/);
});

// ---------- the title a post is sent under ----------

test("a title made from a slug makes the same slug again", () => {
  for (const slug of ["himal-brew-house-jhamsikhel", "a", "tvs-ntorq-rtfi", "iphone-18-series", "loksewa-exam-2083", "x-1-y-2"]) {
    assert.equal(topicSlug(slugToTitle(slug)), slug, slug);
  }
  assert.equal(slugToTitle("himal-brew-house"), "himal brew house");
  assert.equal(slugToTitle(""), "");
  assert.equal(slugToTitle(undefined), "");
});

test("the pinned title is the stored one when it makes the thread's slug, and otherwise one that does", () => {
  assert.equal(pinnedTitleFor({ title: "Himal Brew House, Jhamsikhel", slug: "himal-brew-house-jhamsikhel" }), "Himal Brew House, Jhamsikhel");
  assert.equal(pinnedTitleFor({ title: "  Himal Brew House, Jhamsikhel  ", slug: "himal-brew-house-jhamsikhel" }), "Himal Brew House, Jhamsikhel");
  // A stored title that no longer makes the slug is never trusted: it would start a second thread.
  assert.equal(pinnedTitleFor({ title: "Himal Brew House, Patan", slug: "himal-brew-house-jhamsikhel" }), "himal brew house jhamsikhel");
  for (const missing of [null, undefined, "", "   "]) assert.equal(pinnedTitleFor({ title: missing, slug: "himal-brew" }), "himal brew");
  for (const [title, slug] of [["Himal Brew House, Jhamsikhel", "himal-brew-house-jhamsikhel"], ["Wrong", "himal-brew"], [null, "loksewa-exam"], ["TVS Ntorq (RTFi)", "tvs-ntorq-rtfi"]]) {
    assert.equal(topicSlug(pinnedTitleFor({ title, slug })), slug, `${title} / ${slug}`);
  }
  assert.equal(pinnedTitle({ thread_title: "Himal Brew", topic_slug: "himal-brew" }), "Himal Brew");
  assert.equal(pinnedTitle(null), "");
});

// ---------- what the page says about the business ----------

const MERCHANT = { business_name: "Himal Brew House", area: "Jhamsikhel", business_kind: "cafe", kind_label: null, category: "Food", about: "A calm cafe in Jhamsikhel.", google_review_url: reviewLinkFor(PLACE), google_maps_url: mapsLinkFor(PLACE, "Himal Brew House"), topic_slug: "himal-brew-house-jhamsikhel", thread_title: "Himal Brew House, Jhamsikhel" };

test("the facts the page shows are the business's own, and only Google's links get through", () => {
  const facts = businessPageFacts(MERCHANT);
  assert.equal(facts.name, "Himal Brew House");
  assert.equal(facts.title, "Himal Brew House, Jhamsikhel");
  assert.equal(facts.kindName, "Cafe");
  assert.equal(facts.category, "Food");
  assert.equal(facts.about, "A calm cafe in Jhamsikhel.");
  assert.equal(facts.reviewUrl, reviewLinkFor(PLACE));
  assert.equal(safeGoogleLink("https://evil.com/x"), "");
  assert.equal(safeGoogleLink("javascript:alert(1)"), "");
  assert.equal(safeGoogleLink(null), "");
  const hostile = businessPageFacts({ ...MERCHANT, google_review_url: "https://evil.com/review", google_maps_url: "http://maps.google.com/?cid=1" });
  assert.equal(hostile.reviewUrl, "", "a stored link that is not Google's is never put on a button");
  assert.equal(hostile.mapsUrl, "", "nor an insecure one");
  assert.equal(businessPageFacts({ ...MERCHANT, google_review_url: null, google_maps_url: undefined }).reviewUrl, "");
});

test("an Other business shows the words it was given, and an old one the plain word Business", () => {
  assert.equal(businessPageFacts({ ...MERCHANT, business_kind: "other_business", kind_label: "Motorcycle workshop" }).kindName, "Motorcycle workshop");
  assert.equal(businessPageFacts({ ...MERCHANT, business_kind: "other_business", kind_label: null }).kindName, "Business");
});

test("an empty business thread is described by the business", () => {
  const withAbout = businessPageFacts(MERCHANT).emptyDescription;
  assert.match(withAbout, /^Himal Brew House, Jhamsikhel\. A calm cafe in Jhamsikhel\.$/);
  const without = businessPageFacts({ ...MERCHANT, about: "", business_kind: "salon" }).emptyDescription;
  assert.match(without, /^Salon in Jhamsikhel\. Nobody has shared an experience here yet/);
  const long = businessPageFacts({ ...MERCHANT, about: "word ".repeat(200) }).emptyDescription;
  assert.ok(long.length <= 200, `${long.length} characters`);
  assert.ok(long.endsWith("\u2026"));
});

// ---------- the search and share information ----------

function experiences(n) {
  const words = "The upstairs room is quiet in the morning and the coffee is good value for money. Staff are friendly and the wifi works well for a long study session. Parking is limited at weekends so come early.";
  return Array.from({ length: n }, (_, i) => ({ id: `r${i}`, topic: "Himal Brew House, Jhamsikhel", title: "Himal Brew House, Jhamsikhel", summary: words, kind: "experience", category: "Food", created_at: `2026-10-0${i + 1}T00:00:00Z` }));
}

test("a business thread with no posts is described by the business and kept out of search engines", () => {
  const meta = businessMetadata({ slug: MERCHANT.topic_slug, merchant: MERCHANT, thread: [] });
  assert.equal(meta.title, "Himal Brew House, Jhamsikhel - KastoChha");
  assert.equal(meta.description, "Himal Brew House, Jhamsikhel. A calm cafe in Jhamsikhel.");
  assert.deepEqual(Object.keys(meta.robots).sort(), ["follow", "index"]);
  assert.equal(meta.robots.index, false, "an empty business page is not indexed");
  assert.equal(meta.alternates?.canonical ?? meta.openGraph?.url ?? "", meta.alternates?.canonical ?? meta.openGraph?.url ?? "");
});

test("a business thread with posts follows the ordinary rule for being indexed", () => {
  const one = businessMetadata({ slug: MERCHANT.topic_slug, merchant: MERCHANT, thread: experiences(1) });
  assert.equal(one.robots.index, false, "one post is not enough, as for any thread");
  const many = businessMetadata({ slug: MERCHANT.topic_slug, merchant: MERCHANT, thread: experiences(3) });
  assert.equal(many.robots.index, true);
  assert.match(many.description, /3 experiences shared on Himal Brew House, Jhamsikhel/);
  assert.equal(many.title, "Himal Brew House, Jhamsikhel - KastoChha");
});

test("the share card carries the business's name and category, and the thread's own address", () => {
  const meta = businessMetadata({ slug: MERCHANT.topic_slug, merchant: MERCHANT, thread: experiences(3) });
  const image = (meta.openGraph?.images?.[0]?.url || meta.openGraph?.images?.[0] || "").toString();
  assert.ok(image.includes("/api/og?"), image);
  const params = new URL(image, "https://www.kastochhanepal.com").searchParams;
  assert.equal(params.get("title"), "Himal Brew House, Jhamsikhel");
  assert.equal(params.get("kicker"), "Food");
  assert.equal(params.get("type"), "discussions");
  const canonical = JSON.stringify(meta);
  assert.ok(canonical.includes("/discussions/himal-brew-house-jhamsikhel"));
  assert.ok(!canonical.includes("Himal Brew House, Patan"));
});

// ---------- the migration ----------

const SQL = fs.readFileSync("supabase/migrations/0021_sync_thread_title.sql", "utf8").replace(/--.*$/gm, "");

test("the migration pins the title, fills in older rows, and can be run again", () => {
  assert.match(SQL, /add column if not exists thread_title text\s+constraint sync_merchants_thread_title_length check \(thread_title is null or char_length\(thread_title\) between 1 and 160\)/);
  assert.match(SQL, /update public\.sync_merchants m\s+set thread_title = coalesce\(/);
  assert.match(SQL, /from public\.sync_thread_summary s where s\.topic_slug = m\.topic_slug/);
  assert.match(SQL, /m\.business_name \|\| ', ' \|\| m\.area/);
  assert.match(SQL, /where m\.thread_title is null/, "a re-run must not overwrite a title already pinned");
  assert.ok(!/\bdrop\b|\bdelete\b/i.test(SQL));
  const files = fs.readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql")).sort();
  assert.ok(files.indexOf("0021_sync_thread_title.sql") > files.indexOf("0020_sync_kind_label.sql"));
});

// ---------- through the real routes ----------

const fake = new FakePostgrest();
const ENV_KEYS = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
const saved = {};
let savedConsoleError;

before(async () => {
  await fake.listen();
  for (const key of ENV_KEYS) saved[key] = process.env[key];
  process.env.NEXT_PUBLIC_SUPABASE_URL = fake.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  savedConsoleError = console.error;
});

after(async () => {
  console.error = savedConsoleError;
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  await fake.close();
});

function as(role, userId = "user_a") {
  globalThis.__KC_TEST__ = { userId: role ? userId : null, roles: role ? { [userId]: role } : {}, revalidatedPaths: [], cookies: {} };
}

beforeEach(() => {
  fake.reset();
  console.error = () => {};
  as("admin");
});

const json = (url, method, body) => new Request(`http://localhost${url}`, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const create = (body) => createRoute(json("/api/admin/sync/merchants", "POST", body));
const edit = (id, body) => updateRoute(json(`/api/admin/sync/merchants/${id}`, "PUT", body), { params: { id } });
const customerPost = (body) => { as("user", "user_customer"); return postRoute(json("/api/reviews", "POST", body)); };

function seedThread(topic, slug, category = "Food") {
  fake.tables.reviews.push({ id: `r-${fake.tables.reviews.length + 1}`, topic, title: topic, topic_slug: slug, category, kind: "experience", summary: "Existing post.", created_at: "2026-09-01T00:00:00Z" });
}

test("a new thread is pinned under 'Name, Area', and links are built from the place ID", async () => {
  const res = await create({ ...BASE, businessName: "Kupondol Kettle", area: "Kupondol", googlePlaceId: PLACE });
  assert.equal(res.status, 201);
  const { merchant } = await res.json();
  assert.equal(merchant.thread_title, "Kupondol Kettle, Kupondol");
  assert.equal(topicSlug(merchant.thread_title), merchant.topic_slug);
  assert.equal(merchant.google_review_url, reviewLinkFor(PLACE));
  assert.equal(merchant.google_maps_url, mapsLinkFor(PLACE, "Kupondol Kettle"));
  assert.equal(fake.tables.admin_audit_log[0].after.thread_title, "Kupondol Kettle, Kupondol");
});

test("an existing thread is pinned under the title it already has, which is not the business's name", async () => {
  seedThread("Himal Brew", "himal-brew");
  const res = await create({ businessName: "Himal Brew House", area: "Jhamsikhel", threadMode: "existing", threadSlug: "himal-brew" });
  assert.equal(res.status, 201);
  const { merchant } = await res.json();
  assert.equal(merchant.thread_title, "Himal Brew", "not 'Himal Brew House, Jhamsikhel', which would be a different thread");
  assert.equal(topicSlug(merchant.thread_title), "himal-brew");
});

test("an existing thread whose title no longer makes its slug is pinned under one that does", async () => {
  seedThread("Totally Renamed Title", "old-address");
  const res = await create({ businessName: "Old Address Cafe", area: "Patan", threadMode: "existing", threadSlug: "old-address" });
  const { merchant } = await res.json();
  assert.equal(merchant.thread_title, "old address");
  assert.equal(topicSlug(merchant.thread_title), "old-address");
});

test("if the thread's title cannot be read, nothing is created", async () => {
  seedThread("Himal Brew", "himal-brew");
  fake.failReadsFrom = "sync_thread_summary";
  const res = await create({ businessName: "Himal Brew House", area: "Jhamsikhel", threadMode: "existing", threadSlug: "himal-brew" });
  assert.equal(res.status, 500);
  assert.match((await res.json()).error, /migration 0019/);
  assert.equal(fake.tables.sync_merchants.length, 0);
  assert.equal(fake.tables.admin_audit_log.length, 0);
});

test("editing: links are rebuilt when the place ID changes, and the thread title never changes", async () => {
  const { merchant } = await (await create({ ...BASE, googlePlaceId: PLACE })).json();
  const res = await edit(merchant.id, { googlePlaceId: "ChIJnewplace12345", googleReviewUrl: merchant.google_review_url, googleMapsUrl: merchant.google_maps_url });
  const after = (await res.json()).merchant;
  assert.equal(after.google_review_url, reviewLinkFor("ChIJnewplace12345"));
  assert.equal(after.thread_title, merchant.thread_title);
  assert.equal(after.topic_slug, merchant.topic_slug);
});

test("THE POINT: a customer's first post, sent under the pinned title, lands in the business's own thread", async () => {
  const { merchant } = await (await create({ ...BASE, businessName: "Momo Hub", area: "Pulchowk" })).json();
  const post = await customerPost({ title: merchant.thread_title, category: merchant.category, summary: "Great momo, quick service.", verdict: "Ramro chha" });
  assert.equal(post.status, 200, await post.clone().text());
  const row = fake.tables.reviews[0];
  assert.equal(row.topic_slug, merchant.topic_slug, "the post is in the business's thread");
  assert.equal(row.category, "Food");
  assert.equal(row.title, "Momo Hub, Pulchowk");
});

test("renaming the business does not send the next post to a different thread", async () => {
  const { merchant } = await (await create({ ...BASE, businessName: "Momo Hub", area: "Pulchowk" })).json();
  const renamed = await (await edit(merchant.id, { businessName: "Momo Hub & Tea House" })).json();
  assert.equal(renamed.merchant.business_name, "Momo Hub & Tea House");
  // What an admin might fear: posting under the new display name makes a different address.
  assert.notEqual(topicSlug("Momo Hub & Tea House, Pulchowk"), merchant.topic_slug);
  // What the page does: it posts under the pinned title, which never changes.
  const read = await getMerchantByTopicSlug(merchant.topic_slug);
  assert.equal(pinnedTitle(read), "Momo Hub, Pulchowk");
  const post = await customerPost({ title: pinnedTitle(read), category: read.category, summary: "Still the same thread.", verdict: "" });
  assert.equal(post.status, 200);
  assert.equal(fake.tables.reviews[0].topic_slug, merchant.topic_slug);
});

test("a linked thread's next post joins it, and adopts the thread's own category", async () => {
  seedThread("Himal Brew", "himal-brew", "Other");
  const { merchant } = await (await create({ businessName: "Himal Brew House", area: "Jhamsikhel", threadMode: "existing", threadSlug: "himal-brew" })).json();
  const post = await customerPost({ title: merchant.thread_title, category: "Food", summary: "Joins the existing thread.", verdict: "" });
  assert.equal(post.status, 200);
  const added = fake.tables.reviews[fake.tables.reviews.length - 1];
  assert.equal(added.topic_slug, "himal-brew");
  assert.equal(added.topic, "Himal Brew", "the thread keeps its own name");
});

test("older rows with no pinned title still post to the right thread", async () => {
  // A business tagged before 0021 has no thread_title (until the migration fills it in).
  fake.tables.sync_merchants.push({ id: "m-old", slug: "old-cafe", topic_slug: "old-cafe-baneshwor", business_name: "Old Cafe", area: "Baneshwor", business_kind: "cafe", category: "Food", status: "active", thread_title: null });
  const read = await getMerchantByTopicSlug("old-cafe-baneshwor");
  const post = await customerPost({ title: pinnedTitle(read), category: "Food", summary: "Works without the column filled in.", verdict: "" });
  assert.equal(post.status, 200);
  assert.equal(fake.tables.reviews[0].topic_slug, "old-cafe-baneshwor");
});

test("the address made when a business is tagged is the same one a customer's post makes", () => {
  for (const [name, area] of [["Himal Brew House", "Jhamsikhel"], ["Tom's Bar & Grill", "Thamel"], ["Caf\u00e9 Mitra", "Patan Dhoka"], ["Momo Hub", "Pulchowk"], ["BYD Showroom", "Kathmandu-44"]]) {
    const slug = threadSlugFor({ name, area });
    assert.equal(topicSlug(pinnedTitleFor({ title: `${name}, ${area}`, slug })), slug, `${name}, ${area}`);
  }
});

// ---------- guards on the screens ----------

const read = (file) => fs.readFileSync(file, "utf8");

test("the thread page leaves an ordinary thread exactly as it was", () => {
  const page = read("app/discussions/[slug]/page.js");
  assert.match(page, /\) : \(\s*<ThreadClient reviews=\{posts\} threadSlug=\{slug\} myVotes=\{myVotes\} \/>\s*\)\}/, "the ordinary thread's component call changed (it now gets the posts without account ids: patch 12)");
  assert.match(page, /if \(!thread\.length && !merchant\) return \{ title: "Discussion not found - KastoChha" \}/);
  assert.match(page, /<h1 className="page-title">Discussion not found<\/h1>/);
  assert.match(page, /const title = biz \? biz\.title : op\.topic \|\| op\.title \|\| "KastoChha discussion"/);
  assert.match(page, /<div className="page-kicker">\{biz \? biz\.category : op\.category\}<\/div>/);
});

test("a business's lookup can fail without taking the page down", () => {
  const merchants = read("lib/sync/merchants.js");
  assert.match(merchants, /catch \(error\) \{\s*console\.error\("Sync merchant lookup unavailable:"/);
  assert.match(merchants, /return null;/);
});

test("the first-post box posts under the pinned title, through the ordinary posts route", () => {
  const composer = read("app/discussions/[slug]/FirstPostComposer.js");
  assert.match(composer, /^"use client";/);
  assert.match(composer, /fetch\("\/api\/reviews"/);
  assert.match(composer, /body: JSON\.stringify\(\{ title: postTitle, category, verdict: chosenVerdict \|\| "", summary \}\)/);
  assert.match(composer, /useRequireSignIn\(\{\s*draftKey: `thread:\$\{slug\}`/);
  assert.match(composer, /router\.refresh\(\)/);
  assert.ok(!/lib\/sync\/(hubToken|merchants|threads)|supabase|node:crypto/.test(composer), "the box imports something server-only");
  const page = read("app/discussions/[slug]/page.js");
  assert.match(page, /postTitle=\{pinnedTitle\(merchant\)\}/, "the page must hand the box the pinned title, not the display name");
});

test("a business thread's replies are sent under the thread's own title, whatever is displayed", () => {
  const client = read("app/discussions/[slug]/ThreadClient.js");
  assert.match(client, /displayTitle = "", displayCategory = ""/);
  assert.match(client, /showsBusiness \? \(_shown, payload\) => submitReply\(topic, payload\) : submitReply/);
  assert.match(client, /topic=\{shownTopic\}/);
  // The reply function itself must read only the real topic, never the display one.
  const reply = client.slice(client.indexOf("const submitReply = async"), client.indexOf("if (!topic) return null;"));
  assert.ok(reply.length > 200, "could not find the reply function");
  assert.match(reply, /title: topicItem\.title/);
  assert.ok(!/displayTitle|displayCategory|shownTopic/.test(reply), "a reply could be posted under the display name");
});

test("the header shows only what the team entered, opens Google in a new tab safely, and never shows hours or contact details", () => {
  const header = read("app/discussions/[slug]/BusinessHeader.js");
  assert.match(header, /rel="noopener noreferrer"/);
  assert.equal((header.match(/target="_blank"/g) || []).length, 2);
  assert.match(header, /facts\.reviewUrl \?/);
  assert.match(header, /facts\.mapsUrl \?/);
  assert.match(header, /KastoChha doesn&apos;t sell, hide or rank reviews/);
  // The comments say what it leaves out; look only at the code. The one sentence explaining the Visited
  // mark says "6 hours" (how recent a scan must be), which is not a business's opening hours.
  const code = header.replace(/^\s*\/\/.*$/gm, "").replace(/in the 6 hours before posting/g, "");
  for (const forbidden of [/\bhours\b/i, /\bphone\b/i, /\bmenu\b/i, /\bprice/i, /dangerouslySetInnerHTML/]) assert.ok(!forbidden.test(code), `the header mentions ${forbidden}`);
});

test("the editor shows the thread title, and warns the addresses are fixed", () => {
  const editor = read("app/admin/sync/[id]/MerchantEditorClient.js");
  assert.match(editor, /Thread title \(permanent\)/);
  assert.match(read("app/admin/sync/[id]/page.js"), /thread_title: pinnedTitle\(merchant\)/);
});
