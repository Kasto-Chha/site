// Patch 11a: what visitors read and see. Each test is tied to a finding from the Stage A test (check numbers in the names).

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { JSDOM } from "jsdom";

const read = (file) => fs.readFileSync(file, "utf8");
const { revealWhenPresent } = await import("../lib/revealNew.js");
const { buildTopics } = await import("../lib/topics.js");

// ---------- fix 3: the page scrolls to what was just posted ----------

function page(html = "") {
  const dom = new JSDOM(`<!doctype html><body>${html}</body>`);
  const calls = [];
  dom.window.Element.prototype.scrollIntoView = function scrollIntoView(options) { calls.push({ id: this.id, options }); };
  return { dom, document: dom.window.document, calls };
}
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test("an item that is already on the page is brought into view, focused and highlighted, then the highlight goes", async () => {
  const { document, calls } = page('<div id="exp-1">my post</div>');
  revealWhenPresent("exp-1", { root: document, highlightMs: 30 });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].options, { block: "center", behavior: "smooth" });
  assert.equal(document.activeElement.id, "exp-1", "keyboard focus moves to it so a screen reader announces it");
  assert.equal(document.getElementById("exp-1").getAttribute("tabindex"), "-1");
  assert.ok(document.getElementById("exp-1").classList.contains("just-posted"));
  await wait(60);
  assert.ok(!document.getElementById("exp-1").classList.contains("just-posted"), "the highlight is brief");
});

test("an item that arrives a moment later is found when it appears (the page refreshes its data, then draws it)", async () => {
  const { document, calls } = page();
  revealWhenPresent("q-9", { root: document, highlightMs: 20 });
  assert.equal(calls.length, 0, "nothing yet");
  await wait(30);
  const element = document.createElement("article"); element.id = "q-9"; document.body.appendChild(element);
  await wait(30);
  assert.equal(calls.length, 1);
  assert.equal(document.activeElement.id, "q-9");
});

test("if the item never appears nothing scrolls, nothing throws, and the wait ends", async () => {
  const { document, calls } = page();
  revealWhenPresent("never", { root: document, timeoutMs: 40 });
  await wait(80);
  const late = document.createElement("div"); late.id = "never"; document.body.appendChild(late);
  await wait(30);
  assert.equal(calls.length, 0, "it gave up after its timeout and does not scroll to an item that turns up much later");
});

test("a person who asks for reduced motion gets a jump, not a smooth scroll", () => {
  const { dom, document, calls } = page('<div id="reply-3"></div>');
  dom.window.matchMedia = () => ({ matches: true });
  revealWhenPresent("reply-3", { root: document });
  assert.equal(calls[0].options.behavior, "auto");
});

test("it can be cancelled, and a missing id or page does nothing", async () => {
  const { document, calls } = page();
  const cancel = revealWhenPresent("later", { root: document });
  cancel();
  const element = document.createElement("div"); element.id = "later"; document.body.appendChild(element);
  await wait(30);
  assert.equal(calls.length, 0);
  assert.equal(typeof revealWhenPresent("", { root: document }), "function");
  assert.equal(typeof revealWhenPresent("x", { root: null }), "function");
});

test("every kind of posting asks for the new item to be brought into view, and every such item has the address it looks for (patch 11a, fix 3)", () => {
  const thread = read("app/discussions/[slug]/ThreadClient.js");
  assert.match(thread, /setLastPost\(summary\);\s*revealWhenPresent\("google-copy-card"\);/);
  assert.match(thread, /\} else if \(data\?\.review\?\.id\) \{\s*revealWhenPresent\(`exp-\$\{data\.review\.id\}`\);/);
  assert.equal((thread.match(/revealWhenPresent\(`reply-\$\{result\.data\.reply\.id\}`\)/g) || []).length, 2, "an owner's reply, new and edited");
  assert.match(read("app/discussions/[slug]/AskComposer.js"), /if \(saved\?\.review\?\.id\) revealWhenPresent\(`q-\$\{saved\.review\.id\}`\);/);
  const first = read("app/discussions/[slug]/FirstPostComposer.js");
  assert.match(first, /setPosted\(summary\);\s*revealWhenPresent\("google-copy-card"\);/);
  assert.match(first, /if \(saved\?\.review\?\.id\) revealWhenPresent\(`exp-\$\{saved\.review\.id\}`\);/);
  assert.match(read("app/components/useExperienceEdits.js"), /revealWhenPresent\(`exp-\$\{id\}`\)/);
  const note = read("app/hub/[slug]/note/NoteForm.js");
  assert.match(note, /state === "sent" \? revealWhenPresent\("note-thanks"\)/);
  assert.match(note, /id="note-thanks"/);
  // The addresses those calls look for.
  assert.match(read("app/discussions/[slug]/GoogleCopyCard.js"), /id="google-copy-card"/);
  assert.match(read("app/discussions/[slug]/BusinessQuestions.js"), /id=\{`q-\$\{q\.id\}`\}/);
  assert.match(read("app/components/OwnerReply.js"), /id=\{`reply-\$\{reply\.id\}`\}/);
  assert.match(read("app/components/TopicThread.js"), /id=\{`exp-\$\{exp\.id\}`\}/);
});

// ---------- fix 5: a post with no verdict is not counted in the tally ----------

const row = (id, verdict, kind = "experience") => ({ id, topic_slug: "t", topic: "T", title: "T", category: "Food", kind, verdict, summary: `post ${id}`, upvotes: 0, downvotes: 0, created_at: `2026-11-0${(id % 8) + 1}T00:00:00Z` });
const tally = (rows) => buildTopics(rows)[0].verdicts;

test("a post with no verdict counts as nothing: eight posts, seven with a verdict, adds up to seven (check E14, decided)", () => {
  const rows = [...Array.from({ length: 7 }, (_, i) => row(i, "Ramro chha")), row(7, null)];
  assert.deepEqual(tally(rows), { pos: 7, neu: 0, neg: 0 });
  assert.equal(buildTopics(rows)[0].count, 8, "it is still an experience in the thread");
});

test("a short reply with no verdict, an empty verdict and a blank one count as nothing; a real Thikai chha still counts", () => {
  assert.deepEqual(tally([row(1, "Ramro chha"), row(2, ""), row(3, "   "), row(4, undefined), row(5, "Thikai chha"), row(6, "Naramro chha")]), { pos: 1, neu: 1, neg: 1 });
  assert.deepEqual(tally([row(1, "  thikai CHHA ")]), { pos: 0, neu: 1, neg: 0 }, "case and spaces do not matter");
  assert.deepEqual(tally([row(1, null), row(2, null)]), { pos: 0, neu: 0, neg: 0 }, "a thread with no verdicts at all is zeros, not 100% Thikai");
  assert.deepEqual(tally([row(1, "Ramro chha"), row(2, null, "question")]), { pos: 1, neu: 0, neg: 0 }, "questions still count as nothing");
});

// ---------- fix 2: line breaks ----------

test("a post's text, the preview line and the card quote keep the line breaks that were saved, and still collapse runs of spaces (check E16)", () => {
  const css = read("app/globals.css");
  for (const rule of [".exp-text{", ".topic-preview{", ".disc-quote{"]) assert.ok(css.includes(`${rule}white-space:pre-line;`), rule);
  assert.doesNotMatch(css.match(/\.exp-text\{[^}]*\}/)[0], /pre-wrap/, "pre-line, not pre-wrap: spaces still collapse");
});

// ---------- fix 4: "· edited" ----------

test("a post and a question show \"· edited\" when their words or verdict changed, and the database only sets that time on such a change (check E16 follow-up)", () => {
  assert.match(read("app/components/TopicThread.js"), /exp\.updated_at \? \(\s*<span className="exp-edited"[^>]*>\s*· edited/);
  assert.match(read("app/discussions/[slug]/BusinessQuestions.js"), /q\.updated_at \? " · edited" : ""/);
  assert.match(read("app/globals.css"), /\.exp-edited\{/);
  // A vote must not make a post look edited: the trigger moves the time on content changes only.
  const trigger = read("supabase/migrations/0006_seo_url_structure.sql");
  assert.match(trigger, /new\.summary\s+is distinct from old\.summary/);
  assert.match(trigger, /new\.verdict\s+is distinct from old\.verdict/);
  assert.match(trigger, /never on votes/);
});

// ---------- fixes 7 and 8 ----------

test("the chat leaves question posts out when it gathers community experiences, and every post has a kind so no old post is lost (fix 7)", () => {
  const chat = read("app/api/chat/route.js");
  assert.match(chat, /\.select\("topic, title, summary, verdict, category, created_at"\)\s*\.neq\("kind", "question"\)/);
  assert.match(read("supabase/migrations/0007_questions_become_discussions.sql"), /add column if not exists kind text not null default 'experience'/);
});

test("the business page no longer says the hub arrives with a later patch (fix 8)", () => {
  const editor = read("app/admin/sync/[id]/MerchantEditorClient.js");
  assert.doesNotMatch(editor, /arrives with the QR patch/);
  assert.match(editor, /renaming the business never splits its thread/);
});
