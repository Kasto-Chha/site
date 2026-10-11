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
    const [fonts, logo, imageA, imageB] = await Promise.all([loadOgFonts(origin), loadOgLogo(origin), loadBattleImage(param("ia")), loadBattleImage(param("ib"))]);
    const color = (key) => (HEX_COLOR.test(param(key)) ? param(key) : null);
    const element = buildBattleCard({
      left: { name: clamp(param("a") || titleA || "Side A", 24), image: imageA, color: color("ca") },
      right: { name: clamp(param("b") || titleB || "Side B", 24), image: imageB, color: color("cb") },
      votes: { left: param("va"), right: param("vb") },
      // Only a plain "N votes" is accepted; an old link's "62% X · 38% Y" is ignored.
      stat: VOTES_PILL.test(param("stat")) ? param("stat") : "",
      logo,
      fontFamily: fonts ? "DM Sans" : "sans-serif"
    });
    return new ImageResponse(element, { width: 1200, height: 630, ...(fonts ? { fonts } : {}) });
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
      ? buildTrendingCard({ ...input, logo, fontFamily, labels: ["l1", "l2", "l3"].map((key) => clamp(param(key), 40)) })
      : buildDiscussionCard({ ...input, logo, fontFamily, subtitle: clamp(param("subtitle"), 160), question: param("kind") === "question" });

  return new ImageResponse(element, { width: 1200, height: 630, ...(fonts ? { fonts } : {}) });
}
