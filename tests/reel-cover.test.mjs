// A reel's cover: the one set by hand in the admin wins, an unsafe or missing one
// falls back to the automatic cover, and the database knows the column. TikTok no
// longer returns covers from its public lookup, which is why this exists.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const { reelCover, toThumbUrl } = await import("../lib/embeds.js");
const { isAllowedUrl } = await import("../lib/safeUrl.js");
const contentTypes = await import("../lib/admin/contentTypes.js");

const TIKTOK = "https://www.tiktok.com/@kasto/video/123";
const YOUTUBE = "https://www.youtube.com/watch?v=abc123";
const COVER = "https://abc.supabase.co/storage/v1/object/public/Reel%20Covers/gadgets.jpg";

test("a cover set by hand is used, even for a TikTok reel whose own cover can't be fetched", () => {
  assert.equal(reelCover({ video_url: TIKTOK, cover_url: COVER }), COVER);
  assert.equal(reelCover({ video_url: YOUTUBE, cover_url: COVER }), COVER, "a hand-set cover wins over the automatic one");
  assert.equal(reelCover({ video_url: TIKTOK, cover_url: `  ${COVER}  ` }), COVER, "stray spaces around it are ignored");
  assert.equal(reelCover({ video_url: TIKTOK, cover_url: "/reel-covers/gadgets.jpg" }), "/reel-covers/gadgets.jpg", "a path on this site works too");
});

test("with no hand-set cover, the automatic one is used as before", () => {
  assert.equal(reelCover({ video_url: YOUTUBE }), "https://i.ytimg.com/vi/abc123/hqdefault.jpg");
  assert.equal(reelCover({ video_url: TIKTOK }), toThumbUrl(TIKTOK));
  assert.match(reelCover({ video_url: TIKTOK, cover_url: null }), /^\/api\/embeds\/thumb\?url=/);
  assert.equal(reelCover({ video_url: TIKTOK, cover_url: "" }), toThumbUrl(TIKTOK));
  assert.equal(reelCover({ channel_url: YOUTUBE }), "https://i.ytimg.com/vi/abc123/hqdefault.jpg", "the channel link is the second choice");
  assert.equal(reelCover({}), null);
  assert.equal(reelCover(undefined), null);
  assert.equal(reelCover({ video_url: "https://vimeo.com/123" }), null, "a link with no automatic cover gives none");
});

test("an unsafe hand-set cover is ignored, and the automatic one takes over", () => {
  const unsafe = ["javascript:alert(1)", "http://abc.supabase.co/c.jpg", "//evil.example.com/c.jpg", "/\\evil.example.com/c.jpg", "data:image/png;base64,AAAA", "https://user:pw@abc.supabase.co/c.jpg", "https://abc.supabase.co/c .jpg", "ftp://x/c.jpg", "not a url"];
  for (const cover_url of unsafe) {
    assert.equal(reelCover({ video_url: YOUTUBE, cover_url }), "https://i.ytimg.com/vi/abc123/hqdefault.jpg", `${cover_url} was used`);
  }
  assert.equal(reelCover({ video_url: TIKTOK, cover_url: 42 }), toThumbUrl(TIKTOK), "a non-text value is ignored");
});

test("the admin validates the cover the same way it validates other addresses", () => {
  const base = { title: "T", tag: "Tech", order: 1, accent: "#5a1f24", video_url: TIKTOK };
  const ok = contentTypes.sanitizeContent("reels", { ...base, cover_url: COVER });
  assert.equal(ok.values.cover_url, COVER);
  assert.equal(contentTypes.sanitizeContent("reels", { ...base, cover_url: "/covers/a.jpg" }).values.cover_url, "/covers/a.jpg");
  assert.equal(contentTypes.sanitizeContent("reels", { ...base, cover_url: "" }).values.cover_url, null, "blank means none");
  assert.equal(contentTypes.sanitizeContent("reels", base).values.cover_url, null, "left out means none");
  for (const bad of ["http://abc.supabase.co/c.jpg", "javascript:alert(1)", "//evil.example.com/c.jpg", "https://abc.supabase.co/a b.jpg"]) {
    const result = contentTypes.sanitizeContent("reels", { ...base, cover_url: bad });
    assert.ok(result.error, `${bad} was accepted`);
    assert.match(result.error, /Cover image/);
  }
  const field = contentTypes.CONTENT_TYPES.reels.fields.find((f) => f.name === "cover_url");
  assert.equal(field.type, "url");
  assert.equal(field.allowRelative, true);
  assert.ok(!field.required, "the cover must stay optional");
});

test("isAllowedUrl keeps its behaviour and is still exported from the admin module", () => {
  assert.equal(contentTypes.isAllowedUrl, isAllowedUrl);
  assert.equal(isAllowedUrl("https://example.com/x"), true);
  assert.equal(isAllowedUrl("/x"), false);
  assert.equal(isAllowedUrl("/x", { allowRelative: true }), true);
  assert.equal(isAllowedUrl("//evil.com", { allowRelative: true }), false);
  assert.equal(isAllowedUrl("http://example.com"), false);
});

test("the database knows the column: schema.sql, and a migration to run first", () => {
  const schema = fs.readFileSync("supabase/schema.sql", "utf8");
  const table = schema.match(/create table if not exists reels \(([\s\S]*?)\n\);/)[1];
  for (const field of contentTypes.CONTENT_TYPES.reels.fields) {
    const column = field.name === "order" ? '"order"' : field.name;
    assert.ok(new RegExp(`(^|\\s)${column}\\s`).test(table), `schema.sql's reels table is missing ${field.name}`);
  }
  const migration = fs.readdirSync("supabase/migrations").filter((f) => f.includes("reels_cover_url"));
  assert.equal(migration.length, 1, "expected exactly one reels cover migration");
  const sql = fs.readFileSync(`supabase/migrations/${migration[0]}`, "utf8");
  assert.match(sql, /alter table reels add column if not exists cover_url text;/);
  assert.match(sql, /BEFORE DEPLOYING/);
});

test("the reel card uses reelCover, so a hand-set cover reaches the page", () => {
  const source = fs.readFileSync("app/components/ReelsRail.js", "utf8");
  assert.match(source, /const thumb = reelCover\(reel\);/);
  assert.ok(!/toThumbUrl\(reel\./.test(source), "the card still builds its cover without reelCover");
});
