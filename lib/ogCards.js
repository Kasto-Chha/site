// The Trending and Discussion share cards (1200x630), as plain element trees.
// No JSX on purpose: that keeps them buildable and testable outside Next's
// compiler. app/api/og/route.js still draws every other card type itself.
//
// Home (the site's general card): the logo in the middle with Ask / Share / Explore.
// Battle: the two sides' real pictures, "PICK A SIDE. CAST YOUR VOTE.", both names.
// Trending: the topic's own three vote labels as pills, no footer line.
// Discussion: title and the number of experiences shared. Neither card carries a
// footer line; the logo at the top is the branding, and the platforms print the
// site's address under the image themselves.

import { GLYPHS } from "./ogGlyphs";
import { EMOJI } from "./ogEmoji";

const PAPER = "#F5F0E8";
const INK = "#0C0B09";
const RED = "#C8102E";
const BLUE = "#2B3F8C";

export const LABEL_DEFAULTS = ["Thik Chha", "Thikai Chha", "Thik Chhaina"];
// Past this the pill text is cut with an ellipsis; the admin allows 40.
export const LABEL_MAX_CHARS = 21;
// Positive, neutral, negative: the colour follows the position, not the wording.
const TONES = [
  ["#1E7A46", "rgba(30,122,70,0.11)"],
  ["#A8650B", "rgba(168,101,11,0.11)"],
  [RED, "rgba(200,16,46,0.10)"]
];

export function clipText(text, max) {
  const value = String(text ?? "").trim();
  return value.length > max ? `${value.slice(0, max - 1).trimEnd()}\u2026` : value;
}

// A blank label falls back to the same default the live card uses.
export function resolveLabels(labels) {
  const given = Array.isArray(labels) ? labels : [];
  return LABEL_DEFAULTS.map((fallback, i) => {
    const text = String(given[i] ?? "").trim();
    return clipText(text || fallback, LABEL_MAX_CHARS);
  });
}

export function titleFontSize(length) {
  return length <= 40 ? 72 : length <= 70 ? 62 : 54;
}

export function pillFontSize(longestLabel) {
  return longestLabel <= 14 ? 30 : longestLabel <= 18 ? 26 : 23;
}

// ---- tiny element builders (every box is flex, which Satori requires) ----
const h = (type, style, ...kids) => ({
  type,
  props: {
    style: { display: "flex", ...style },
    children: kids.flat().filter((kid) => kid !== null && kid !== undefined && kid !== false)
  }
});
const img = (src, width, height, style = {}) => ({ type: "img", props: { src, width, height, style } });

function chip(label, accent, tint) {
  return h(
    "div",
    {
      alignItems: "center",
      gap: "10px",
      background: `rgba(${tint},0.08)`,
      border: `1px solid rgba(${tint},0.25)`,
      borderRadius: "999px",
      padding: "8px 18px",
      color: accent,
      fontSize: "20px",
      letterSpacing: "3px",
      textTransform: "uppercase",
      fontWeight: 700
    },
    h("div", { width: "10px", height: "10px", borderRadius: "50%", background: accent }),
    label
  );
}

function statPill(text, bordered = false) {
  return h(
    "div",
    {
      background: INK,
      color: PAPER,
      borderRadius: "999px",
      padding: "12px 24px",
      // Long counts ("1,240 experiences shared") step down a little; it never wraps.
      fontSize: text.length > 20 ? "22px" : "24px",
      fontWeight: 700,
      whiteSpace: "nowrap",
      flexShrink: 0,
      ...(bordered ? { border: "2px solid rgba(255,255,255,0.55)" } : {})
    },
    text
  );
}

// The real logo (a data: URI), or plain coloured text if it couldn't be loaded.
function brandMark(logo, width = 270) {
  if (logo) return img(logo, width, Math.round((width * 38) / 270));
  return h(
    "div",
    { fontSize: `${Math.round((width * 36) / 270)}px`, fontWeight: 700, letterSpacing: "-1px" },
    h("span", { color: RED }, "Kasto"),
    h("span", { color: BLUE }, "Chha?")
  );
}

function watermark({ glyph, size, top, color }) {
  const g = GLYPHS[glyph];
  return {
    type: "svg",
    props: {
      width: Math.round((g.advance * size) / 1000),
      height: size,
      viewBox: `0 0 ${g.advance} 1000`,
      style: { position: "absolute", right: "70px", top: `${top}px` },
      children: [{ type: "path", props: { d: g.d, fill: color } }]
    }
  };
}

function pillsRow(labels, top = 30) {
  const text = resolveLabels(labels);
  const size = pillFontSize(Math.max(...text.map((t) => t.length)));
  return h(
    "div",
    { gap: "18px", marginTop: `${top}px`, width: "1056px" },
    text.map((label, i) =>
      h(
        "div",
        {
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          gap: "10px",
          background: TONES[i][1],
          border: `2px solid ${TONES[i][0]}`,
          borderRadius: "999px",
          padding: "14px 20px",
          color: TONES[i][0],
          fontSize: `${size}px`,
          fontWeight: 700,
          whiteSpace: "nowrap"
        },
        h("div", { width: "13px", height: "13px", borderRadius: "50%", background: TONES[i][0] }),
        label
      )
    )
  );
}

function card(o) {
  const title = String(o.title || "Kasto chha?");
  return h(
    "div",
    {
      width: "1200px",
      height: "630px",
      position: "relative",
      fontFamily: o.fontFamily,
      background: o.bg,
      backgroundImage: o.bgImage,
      backgroundSize: "100% 100%, 30px 30px"
    },
    watermark(o.watermark),
    h("div", { position: "absolute", left: 0, top: 0, width: "14px", height: "630px", background: o.accent }),
    h(
      "div",
      {
        position: "absolute",
        left: 0,
        top: 0,
        width: "1200px",
        height: "630px",
        flexDirection: "column",
        justifyContent: "space-between",
        gap: "22px",
        padding: "72px"
      },
      h("div", { alignItems: "center", justifyContent: "space-between" }, brandMark(o.logo), chip(o.chip, o.accent, o.tint)),
      h(
        "div",
        { flexDirection: "column", maxWidth: "1056px" },
        o.kicker
          ? h(
              "div",
              { color: o.accent, fontSize: "24px", letterSpacing: "4px", textTransform: "uppercase", fontWeight: 700, marginBottom: "20px" },
              o.kicker
            )
          : null,
        h(
          "div",
          { color: INK, fontSize: `${Math.min(titleFontSize(title.length), o.titleCap || 999)}px`, fontWeight: 700, lineHeight: 1.05, letterSpacing: "-2px" },
          title
        ),
        o.below
      ),
      h("div", { alignItems: "center", justifyContent: "space-between" }, o.stat ? statPill(o.stat) : h("div", {}), o.footer || h("div", {}))
    )
  );
}

// Devanagari (Nepali script) can't be drawn properly with the card's font, so text
// written in it is left off the picture rather than drawn as gaps.
export function hasDevanagari(text) {
  return /[\u0900-\u097F]/.test(String(text ?? ""));
}

export const DISCUSSION_LINE = "Got Something to Say? Join the Discussion!";
export const QUESTION_LINE = "Got an Answer? Share It!";
const DESCRIPTION_MAX_CHARS = 62;

// The topic's own description, as its page shows it under the title.
function descriptionLine(text) {
  return h("div", { color: "#6F685C", fontSize: "30px", lineHeight: 1.3, marginTop: "18px", whiteSpace: "nowrap" }, text);
}

// The invitation on Discussion and Question cards, in the card's own colour.
function inviteLine(text, color) {
  return h("div", { color, fontSize: "32px", fontWeight: 700, lineHeight: 1.3, marginTop: "20px", whiteSpace: "nowrap" }, text);
}

export function buildTrendingCard({ title, kicker, stat, labels, logo, description, fontFamily = "sans-serif" }) {
  const note = description && !hasDevanagari(description) ? clipText(description, DESCRIPTION_MAX_CHARS) : "";
  return card({
    fontFamily,
    logo,
    title,
    kicker,
    stat,
    accent: RED,
    tint: "200,16,46",
    chip: "Trending",
    bg: PAPER,
    bgImage:
      "radial-gradient(circle at 88% 12%, rgba(200,16,46,0.20) 0%, rgba(200,16,46,0) 46%), radial-gradient(rgba(20,16,14,0.10) 2.5px, rgba(20,16,14,0) 2.5px)",
    watermark: { glyph: "question", size: 600, top: 10, color: "rgba(200,16,46,0.11)" },
    // With a description the title steps down a size to make room for it.
    titleCap: note ? 62 : undefined,
    below: h("div", { flexDirection: "column" }, note ? descriptionLine(note) : null, pillsRow(labels, note ? 24 : 30)),
    footer: null
  });
}

// One colour family per card type, so a feed of shared links tells them apart.
const DISCUSSION_TONE = {
  accent: BLUE,
  tint: "43,63,140",
  bg: "#EEF0F7",
  glow: "rgba(43,63,140,0.20)",
  dots: "rgba(43,63,140,0.11)",
  watermark: "rgba(43,63,140,0.12)"
};
// Plum: a Question card (a "Community is asking" thread) is told apart from a
// Discussion card at a glance.
export const QUESTION_TONE = { accent: "#6B3FA0", tint: "107,63,160", bg: "#F2EDF8", glow: "rgba(107,63,160,0.22)", dots: "rgba(107,63,160,0.11)", watermark: "rgba(107,63,160,0.13)" };

export function buildDiscussionCard({ title, kicker, stat, logo, question = false, fontFamily = "sans-serif" }) {
  const t = question ? QUESTION_TONE : DISCUSSION_TONE;
  return card({
    fontFamily,
    logo,
    title,
    kicker,
    stat,
    accent: t.accent,
    tint: t.tint,
    chip: question ? "Question" : "Discussion",
    bg: t.bg,
    bgImage: `radial-gradient(circle at 12% 88%, ${t.glow} 0%, rgba(0,0,0,0) 48%), radial-gradient(${t.dots} 2.5px, rgba(0,0,0,0) 2.5px)`,
    // A question thread gets a "?" rather than the quote mark, in its own colour.
    watermark: question ? { glyph: "question", size: 600, top: 10, color: t.watermark } : { glyph: "quote", size: 720, top: 40, color: t.watermark },
    // No summary sentence on the image (Facebook, LinkedIn and Reddit print the page's
    // description under the picture themselves): a fixed invitation instead.
    below: inviteLine(question ? QUESTION_LINE : DISCUSSION_LINE, t.accent),
    footer: null
  });
}

const BATTLE_FALLBACK_COLORS = [RED, BLUE];
// A light red / blue wash so each half reads as a side without hiding its picture,
// and a dark fade toward the bottom so the bar, names and votes stay readable on a
// bright picture. (The first version used a 64% tint, which buried the pictures.)
export const BATTLE_TINT = "linear-gradient(90deg, rgba(120,12,28,0.19) 0%, rgba(14,12,10,0.2) 50%, rgba(22,30,86,0.19) 100%)";
export const BATTLE_SCRIM = "linear-gradient(180deg, rgba(10,8,7,0) 30%, rgba(10,8,7,0.5) 100%)";

// Left side's share of the votes as a whole percentage, or null before anyone has voted.
export function battleSplit(votesLeft, votesRight) {
  const a = Math.max(0, Math.floor(Number(votesLeft) || 0));
  const b = Math.max(0, Math.floor(Number(votesRight) || 0));
  if (a + b === 0) return null;
  const left = Math.round((a / (a + b)) * 100);
  return { left, right: 100 - left };
}

// The Battle card's text is kept modest so the pictures are the main thing.
export const BATTLE_TITLE_MAX = 68;
export const BATTLE_TITLE_ONE_LINE_MIN = 47;
export const BATTLE_TITLE_TWO_LINE_MAX = 56;
export const BATTLE_TITLE_MIN = 32;

// "A vs B" on one line when it fits at a good size, otherwise A on the first line and
// "vs B" on the second. The width estimate is deliberately on the wide side.
export function battleTitleLayout(leftName, rightName) {
  const fit = (length) => Math.floor((1056 / length + 2) / 0.54);
  const full = `${leftName} vs ${rightName}`;
  const oneLine = Math.min(BATTLE_TITLE_MAX, fit(full.length));
  if (oneLine >= BATTLE_TITLE_ONE_LINE_MIN) return { lines: [full], size: oneLine };
  const second = `vs ${rightName}`;
  return { lines: [leftName, second], size: Math.min(BATTLE_TITLE_TWO_LINE_MAX, Math.max(BATTLE_TITLE_MIN, fit(Math.max(leftName.length, second.length)))) };
}

// side = { name, image (a data: URI or null), color (a hex colour or null) }
// votes = { left, right } counts (zero or missing: an even bar and no percentages).
export function buildBattleCard({ left, right, votes, stat, logo, fontFamily = "sans-serif" }) {
  const sides = [left, right];
  const split = battleSplit(votes?.left, votes?.right);
  const panel = (side, i) => {
    const x = i * 600;
    if (side.image) return img(side.image, 600, 630, { position: "absolute", left: x, top: 0, objectFit: "cover" });
    const color = side.color || BATTLE_FALLBACK_COLORS[i];
    // Same fallback the Battle page draws when a side has no picture.
    return h("div", { position: "absolute", left: x, top: 0, width: "600px", height: "630px", backgroundImage: `linear-gradient(150deg, ${color} 0%, rgba(10,8,7,0.74) 118%)` });
  };
  const titleLayout = battleTitleLayout(left.name, right.name);
  const shadow = "0 2px 14px rgba(0,0,0,0.55)";
  const barWidth = 1056;
  const redWidth = Math.min(barWidth - 60, Math.max(60, Math.round((barWidth * (split ? split.left : 50)) / 100)));
  const label = (text) => h("div", { whiteSpace: "nowrap" }, text);

  return h(
    "div",
    { width: "1200px", height: "630px", position: "relative", fontFamily, background: "#14100E" },
    sides.map(panel),
    h("div", { position: "absolute", left: 0, top: 0, width: "1200px", height: "630px", backgroundImage: BATTLE_TINT }),
    h("div", { position: "absolute", left: 0, top: 0, width: "1200px", height: "630px", backgroundImage: BATTLE_SCRIM }),
    h("div", { position: "absolute", left: 0, top: 0, width: "14px", height: "630px", background: RED }),
    h(
      "div",
      { position: "absolute", left: 0, top: 0, width: "1200px", height: "630px", flexDirection: "column", justifyContent: "space-between", gap: "22px", padding: "72px" },
      h(
        "div",
        { alignItems: "center", justifyContent: "space-between" },
        h("div", { background: PAPER, borderRadius: "14px", padding: "8px 16px" }, brandMark(logo, 200)),
        h(
          "div",
          { alignItems: "center", gap: "10px", background: "rgba(10,8,7,0.6)", border: "1px solid rgba(255,255,255,0.5)", borderRadius: "999px", padding: "8px 18px", color: "#fff", fontSize: "20px", letterSpacing: "3px", textTransform: "uppercase", fontWeight: 700 },
          h("div", { width: "10px", height: "10px", borderRadius: "50%", background: "#fff" }),
          "Battle"
        )
      ),
      h(
        "div",
        { flexDirection: "column" },
        // A dark label keeps this line readable on a bright picture (a logo on white).
        h("div", { color: "#fff", fontSize: "22px", letterSpacing: "3px", textTransform: "uppercase", fontWeight: 700, marginBottom: "14px", textShadow: shadow, alignSelf: "flex-start", background: "rgba(10,8,7,0.6)", padding: "6px 16px", borderRadius: "999px" }, "Pick your side. Cast your vote."),
        h(
          "div",
          { flexDirection: "column" },
          titleLayout.lines.map((line) => h("div", { color: "#fff", fontSize: `${titleLayout.size}px`, fontWeight: 700, lineHeight: 1.02, letterSpacing: "-2px", whiteSpace: "nowrap", textShadow: shadow }, line))
        ),
        h(
          "div",
          { position: "relative", marginTop: "34px", width: `${barWidth}px`, height: "26px", borderRadius: "13px", background: BLUE },
          h("div", { width: `${redWidth}px`, height: "26px", borderRadius: "13px", background: RED }),
          h("div", { position: "absolute", left: `${redWidth - 30}px`, top: "-17px", width: "60px", height: "60px", borderRadius: "50%", background: "#fff", color: INK, alignItems: "center", justifyContent: "center", fontSize: "22px", fontWeight: 700 }, "VS")
        ),
        split
          ? h(
              "div",
              { justifyContent: "space-between", width: `${barWidth}px`, marginTop: "14px", color: "#fff", fontSize: "24px", fontWeight: 700, textShadow: shadow },
              label(`${left.name}  ${split.left}%`),
              label(`${split.right}%  ${right.name}`)
            )
          : null
      ),
      h("div", { alignItems: "center", justifyContent: "space-between" }, stat ? statPill(stat, true) : h("div", {}), h("div", {}))
    )
  );
}

// "Momo Dekhi Mausam Samma, Gaadi Dekhi Gadget Samma." in two short lines, each word
// that has a picture getting its emoji, drawn from lib/ogEmoji.js.
export const HOME_TAGLINE = [
  [["dumpling", "Momo Dekhi"], ["weather", "Mausam Samma,"]],
  [["car", "Gaadi Dekhi"], ["phone", "Gadget Samma."]]
];

function homeTagline() {
  const line = (parts) =>
    h(
      "div",
      { alignItems: "center", gap: "10px" },
      parts.map(([emoji, text], i) => [
        img(EMOJI[emoji], 36, 36, i ? { marginLeft: "12px" } : {}),
        h("div", { whiteSpace: "nowrap" }, text)
      ])
    );
  return h("div", { flexDirection: "column", alignItems: "center", gap: "10px", color: "#4A453D", fontSize: "32px" }, HOME_TAGLINE.map(line));
}

// The site's general card: the logo large in the middle, three pills below it. It
// takes no text, so every page that inherits it gets the same picture. The logo and
// the whole pill row stay inside the middle 630px, which is all WhatsApp shows.
export function buildHomeCard({ logo, fontFamily = "sans-serif" }) {
  const pills = [
    ["Ask", RED],
    ["Explore", INK],
    ["Share", BLUE]
  ];
  const pill = ([label, color]) =>
    h(
      "div",
      {
        alignItems: "center",
        gap: "12px",
        background: color,
        border: `2px solid ${color}`,
        borderRadius: "999px",
        padding: "14px 32px",
        color: "#fff",
        fontSize: "32px",
        fontWeight: 700
      },
      h("div", { width: "13px", height: "13px", borderRadius: "50%", background: "#fff" }),
      label
    );
  // 620px wide so the whole logo survives the square crop WhatsApp makes of the middle.
  const mark = logo
    ? img(logo, 620, 86)
    : h("div", { fontSize: "104px", fontWeight: 700, letterSpacing: "-4px" }, h("span", { color: RED }, "Kasto"), h("span", { color: BLUE }, "Chha?"));
  return h(
    "div",
    {
      width: "1200px",
      height: "630px",
      position: "relative",
      fontFamily,
      background: PAPER,
      backgroundImage:
        "radial-gradient(circle at 90% 10%, rgba(200,16,46,0.18) 0%, rgba(200,16,46,0) 42%), radial-gradient(circle at 10% 90%, rgba(43,63,140,0.18) 0%, rgba(43,63,140,0) 42%), radial-gradient(rgba(20,16,14,0.10) 2.5px, rgba(20,16,14,0) 2.5px)",
      backgroundSize: "100% 100%, 100% 100%, 30px 30px",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: "40px"
    },
    mark,
    homeTagline(),
    h("div", { alignItems: "center", gap: "16px" }, pills.map(pill))
  );
}
