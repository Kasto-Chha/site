// The audit report (patch 14e): what the owner is shown, built from a prospect's facts and drafts. Pure and fixed: the same audit
// always gives the same report, and every sentence lives here, in one place. It is a snapshot of public information, never a
// ranking and never a promise: the "after the fixes" number is an estimate and is called one.

import { ITEMS_INFO, buildFixes, scoreFacts } from "./audit";
import { DRAFT_LABELS } from "./audit";
import { kindDisplay } from "./businessTypes";
import { nepalDay } from "./time";

export const TOKEN_RE = /^[A-Za-z0-9_-]{32}$/;

// Link-preview robots (WhatsApp, Facebook, Slack...), search crawlers and scripts open a link without anyone reading it. They are
// never counted as an open.
const BOT_RE = /bot|crawl|spider|preview|facebookexternalhit|whatsapp|telegram|slack|twitter|linkedin|embedly|discord|skype|google|bing|yahoo|curl|wget|python|node-fetch|headless|monitor|vercel/i;
export const isBot = (userAgent) => !userAgent || BOT_RE.test(String(userAgent));

// ---------- the words around the report ----------

// The price and the ways to reach us come from lib/sync/reportSettings.js (contactsFrom, unfilled): kept in the database.

// Each check, in the words of the report: what it asks, and what the facts say about it.
const SAYS = {
  name: { yes: "Matches the signboard", extra: "Has extra words added", no: "Does not match the signboard" },
  contact: { all: "Address, phone and map pin all set", partial: "Some of address, phone or pin are missing", none: "None of them set" },
  hours: { full: "Full week filled in", partial: "Only some days filled in", none: "No opening hours" },
  festival: { yes: "Special hours set", no: "No special hours set" },
  description: { yes: "There is a description", none: "No description" },
  replies: { fast: "Reviews answered within 48 hours", slowly: "Reviews are answered slowly", never: "Reviews are never answered" }
};

function says(key, f) {
  switch (key) {
    case "name": case "contact": case "hours": case "festival": case "description":
      return SAYS[key][f[key]];
    case "categories": return `${f.categories} ${f.categories === 1 ? "category" : "categories"} chosen`;
    case "photos": return `${f.photos} ${f.photos === 1 ? "photo" : "photos"}`;
    case "photoAge": return f.photos === 0 ? "No photos to be recent" : `Newest photo is ${f.photoAgeMonths} ${f.photoAgeMonths === 1 ? "month" : "months"} old`;
    case "rating": return `${f.rating} stars`;
    case "reviews": return `${f.reviews} ${f.reviews === 1 ? "review" : "reviews"}`;
    case "waiting": return f.waiting === 0 ? "Every review has a reply" : `${f.waiting} ${f.waiting === 1 ? "review has" : "reviews have"} no reply`;
    case "replies": return SAYS.replies[f.replies];
    case "posts": return f.postDays >= 999 ? "Has never posted" : f.postDays === 0 ? "Posted today" : `Last post ${f.postDays} ${f.postDays === 1 ? "day" : "days"} ago`;
    default: return "";
  }
}

// Why a fix matters and how it is done. Plain words, no promise of a result.
export const FIX_TEXT = {
  festival: { why: "Customers check before they travel. A profile that shows the wrong hours on a holiday sends people to a closed door.", how: "In the Google profile, open Hours, then Special hours, and add each festival and public holiday." },
  waiting: { why: "A reply shows the next customer that someone is listening. Unanswered reviews look like nobody is there.", how: "Open the Reviews tab and reply to each one, the kind ones and the unhappy ones, politely and briefly." },
  description: { why: "The description is the only place to say in your own words what the place is.", how: "Paste the description we wrote into Edit profile, then Business description." },
  contact: { why: "People need to find the place and call it. A missing pin or phone number loses them.", how: "In Edit profile, check the address, the phone number and that the map pin sits on the door." },
  hours: { why: "Opening hours are one of the first things a customer looks for.", how: "In Edit profile, fill in the opening time for every day, and mark the days that are closed." },
  name: { why: "Google wants the name that is on the signboard. Extra words can lead to the profile being suspended.", how: "Change the name to exactly what the signboard says, with no keywords or area added." },
  photos: { why: "Real, recent photos show what a visit is like. Old or missing photos make a place look closed.", how: "Add clear photos of the food or rooms, the inside, the outside and the signboard, taken by you." },
  posts: { why: "A recent post shows the business is open and active.", how: "Post one short update a week: a dish, an offer, a festival greeting. Add a real photo." },
  categories: { why: "Categories decide which searches the profile can appear in.", how: "Keep the main category, then add the two or three that describe the place best." },
  replies: { why: "Customers expect an answer within a day or two.", how: "Check the reviews twice a week and answer each one within 48 hours." },
  reviews: { why: "More recent reviews give new customers something to trust. We cannot change a rating, and we do not buy or write reviews.", how: "Ask happy customers, in person, to leave an honest review. A small sign with a QR code at the counter helps." }
};

export const DISCLAIMER = "This is a snapshot of what the public Google profile showed on the date above. It is not a ranking, and it does not promise any result. The score is worked out by fixed rules from the answers in this report, and the figure after the fixes is an estimate. Questions we could not answer from the public profile are left out of the score.";

// ---------- the report ----------

// -> everything either version of the report needs. `contacts` from contactsFrom() in reportSettings.js; `now` in ms.
export function buildReport(prospect, contacts, now = Date.now()) {
  const facts = prospect.facts && typeof prospect.facts === "object" ? prospect.facts : {};
  const scored = scoreFacts(facts);
  const rows = scored.items.map((item) => {
    const info = ITEMS_INFO[item.key];
    return { key: item.key, label: info.label, says: item.points === null ? "Not checked" : says(item.key, facts), points: item.points, max: item.max, known: item.points !== null };
  });
  const fixes = buildFixes(facts).map((fix, index) => ({ n: index + 1, key: fix.key, title: fix.title, priority: fix.priority, ...FIX_TEXT[fix.key] }));
  const drafts = Object.keys(DRAFT_LABELS).filter((key) => prospect.drafts?.[key]).map((key) => ({ key, label: DRAFT_LABELS[key], text: prospect.drafts[key] }));
  return {
    name: prospect.business_name,
    area: prospect.area,
    kind: kindDisplay(prospect.business_kind, prospect.kind_label),
    date: nepalDay(now),
    score: scored.score,
    projected: scored.projected,
    checked: scored.checked,
    total: scored.total,
    rows,
    fixes,
    drafts,
    contacts,
    disclaimer: DISCLAIMER
  };
}

// ---------- the words to send with it ----------

const fixLines = (fixes) => fixes.slice(0, 3).map((fix) => `- ${fix.title}`).join("\n");

// The email and the short WhatsApp message that go with the link. `link` is the private address of the summary or the full report.
export function outreachTexts(prospect, links, contacts) {
  const report = buildReport(prospect, contacts);
  const score = report.score === null ? "" : `${report.score} out of 100`;
  const where = `${prospect.business_name}, ${prospect.area}`;
  const subject = `A free check of the ${prospect.business_name} Google profile`;
  const email = [
    `Namaste,`,
    ``,
    `I looked at the public Google profile of ${where}, as a customer would see it.${score ? ` It scores ${score} on our checklist.` : ""}`,
    ``,
    report.fixes.length ? `The first things worth fixing:\n${fixLines(report.fixes)}` : `Nothing urgent stood out from what we could see.`,
    ``,
    `The short report: ${links.summary}`,
    `The full report, with text you can paste into Google: ${links.full}`,
    ``,
    `This is a free check and there is nothing you need to do. If you would like us to look after the profile for 90 days, reply to this message or call ${contacts.phone}.`,
    ``,
    `KastoChha`
  ].join("\n");
  const whatsapp = `Namaste! I checked the Google profile of ${prospect.business_name}.${score ? ` It scores ${score}.` : ""} Short report: ${links.summary} Questions? ${contacts.whatsapp}`;
  return { subject, email, whatsapp };
}
