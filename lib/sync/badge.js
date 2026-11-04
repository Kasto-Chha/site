import { fetchAll } from "./paging";
import { BADGE_EVENTS } from "./qr";

// The website badge, as far as the server and the admin are concerned. Pure, apart from
// badgeStats, which reads the events table.

export { BADGE_EVENTS };

// The address the badge script is served from. Always the real site: a business pastes this on
// its own website, so a preview address here would break it the day the preview is deleted.
export const BADGE_SITE_DEFAULT = "https://www.kastochhanepal.com";

const escapeAttr = (value) => String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// The one line a business pastes before the closing </body> of its own site. The business is
// identified by its Sync address (its slug), so there is no name to mistype.
export function badgeSnippet(siteUrl, slug) {
  const base = (siteUrl || BADGE_SITE_DEFAULT).toString().replace(/\/+$/, "");
  return `<script src="${escapeAttr(base)}/badge-widget.js" data-business="${escapeAttr(slug)}" async></script>`;
}

// What the badge is told about a business, and nothing else: whether to show, what to call it,
// and where its thread is. All of it is already public on the business's own page.
export function badgeCheckAnswer(merchant) {
  if (!merchant) return { allowed: false };
  return { allowed: true, name: merchant.business_name, thread: `/discussions/${merchant.topic_slug}` };
}

// How often the badge's popup was opened and each link clicked, all time and in the last 7 days.
export async function badgeStats(supabase, merchantId, { now = Date.now() } = {}) {
  // Paged: one request would stop at the server's 1,000-row cap and under-count without a word.
  const { rows } = await fetchAll(() =>
    supabase.from("sync_events").select("event_type, created_at").eq("merchant_id", merchantId).in("event_type", BADGE_EVENTS).order("created_at", { ascending: true }).order("id", { ascending: true })
  );
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
  const stats = {};
  for (const type of BADGE_EVENTS) stats[type] = { total: 0, week: 0 };
  for (const event of rows) {
    const entry = stats[event.event_type];
    if (!entry) continue;
    entry.total += 1;
    if (new Date(event.created_at).getTime() >= weekAgo) entry.week += 1;
  }
  return stats;
}
