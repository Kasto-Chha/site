// Draws the Home, Trending, Discussion and Battle share cards for /api/og. Returns null for
// every other card type so the route carries on with its own layout.
//
// Only an explicit type switches the design. The homepage's image address has
// no type at all (the route's default is "trending"), and it, plus the list
// pages that inherit it, must keep today's card.

import { ImageResponse } from "next/og";
import { buildTrendingCard, buildDiscussionCard, buildBattleCard, buildHomeCard } from "./ogCards";
import { loadBattleImage } from "./ogImages";
import { loadOgFonts, loadOgLogo } from "./ogAssets";

function clamp(value, max) {
  if (!value) return "";
  return value.length > max ? `${value.slice(0, max - 1)}\u2026` : value;
}

const VOTES_PILL = /^[\d,]{1,12} votes?$/i;
const HEX_COLOR = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

// Old shared battle links carry only the "X vs Y" title, so fall back to that for the names.
function namesFromTitle(title) {
  const parts = String(title || "").split(/\s+vs\.?\s+/i);
  return parts.length === 2 ? parts : [null, null];
}

export async function renderCard(request) {
  const { searchParams, origin } = new URL(request.url);
  const type = (searchParams.get("type") || "").toLowerCase();
  if (type !== "trending" && type !== "discussions" && type !== "battle" && type !== "home") return null;
  const param = (key) => searchParams.get(key) || "";

  if (type === "home") {
    const [fonts, logo] = await Promise.all([loadOgFonts(origin), loadOgLogo(origin)]);
    return new ImageResponse(buildHomeCard({ logo, fontFamily: fonts ? "DM Sans" : "sans-serif" }), { width: 1200, height: 630, ...(fonts ? { fonts } : {}) });
  }

  const title = clamp(param("title") || "Kasto chha?", 110);

  if (type === "battle") {
    const [titleA, titleB] = namesFromTitle(title);
    const [fonts, logo, pictureA, pictureB] = await Promise.all([loadOgFonts(origin), loadOgLogo(origin), loadBattleImage(param("ia"), origin), loadBattleImage(param("ib"), origin)]);
    const color = (key) => (HEX_COLOR.test(param(key)) ? param(key) : null);
    const side = (key, name, title, picture, useImage) => ({
      name: clamp(param(name) || title || (name === "a" ? "Side A" : "Side B"), 24),
      image: useImage ? picture.image : null,
      color: color(key)
    });
    const draw = async (useA, useB) => {
      const element = buildBattleCard({
        left: side("ca", "a", titleA, pictureA, useA),
        right: side("cb", "b", titleB, pictureB, useB),
        votes: { left: param("va"), right: param("vb") },
        // Only a plain "N votes" is accepted; an old link's "62% X \u00b7 38% Y" is ignored.
        stat: VOTES_PILL.test(param("stat")) ? param("stat") : "",
        logo,
        fontFamily: fonts ? "DM Sans" : "sans-serif"
      });
      // Says, for each side, whether its picture was used or why not (see lib/ogImages.js).
      const reason = (picture, used) => (used || !picture.image ? picture.reason : "render-failed");
      const headers = { "X-Card-Pictures": `left=${reason(pictureA, useA)}; right=${reason(pictureB, useB)}` };
      const res = new ImageResponse(element, { width: 1200, height: 630, headers, ...(fonts ? { fonts } : {}) });
      // The engine draws lazily, so a picture it can't decode only fails here.
      const body = await res.arrayBuffer();
      return new Response(body, { status: 200, headers: res.headers });
    };
    // A picture can pass every check and still be one the engine can't decode (a
    // damaged upload, say). That must never take the whole card down, or a social
    // platform is handed the default card instead of this battle: try again with
    // one picture dropped, then the other, then neither.
    const combos = [];
    for (const [useA, useB] of [[true, true], [true, false], [false, true], [false, false]]) {
      const effective = [useA && Boolean(pictureA.image), useB && Boolean(pictureB.image)];
      if (!combos.some(([x, y]) => x === effective[0] && y === effective[1])) combos.push(effective);
    }
    let lastError;
    for (const [useA, useB] of combos) {
      try {
        return await draw(useA, useB);
      } catch (error) {
        lastError = error;
        console.error("Battle card failed to draw with its pictures:", error?.message || error);
      }
    }
    throw lastError;
  }

  const input = {
    title,
    kicker: clamp(param("kicker"), 36),
    stat: clamp(param("stat"), 60)
  };

  const [fonts, logo] = await Promise.all([loadOgFonts(origin), loadOgLogo(origin)]);
  const fontFamily = fonts ? "DM Sans" : "sans-serif";
  const element =
    type === "trending"
      ? buildTrendingCard({ ...input, logo, fontFamily, description: clamp(param("subtitle"), 160), labels: ["l1", "l2", "l3"].map((key) => clamp(param(key), 40)) })
      : buildDiscussionCard({ ...input, logo, fontFamily, question: param("kind") === "question" });

  return new ImageResponse(element, { width: 1200, height: 630, ...(fonts ? { fonts } : {}) });
}
