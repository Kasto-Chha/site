import { auth } from "@clerk/nextjs/server";
import { permanentRedirect } from "next/navigation";

import SiteNav from "../../components/SiteNav";
import BattleSplit from "../../components/BattleSplit";
import SharePanel from "../../components/SharePanel";
import { getBattleById, getBattleBySlug, getUserVotes } from "../../../lib/supabase/queries";
import { shareMetadata } from "../../../lib/share";
import { NOINDEX_FOLLOW } from "../../../lib/seo/indexable";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Accepts either shape. Links shared before slugs existed carry a uuid: look
// the row up by id, then 301 to its slug URL so the old link keeps working.
async function resolveBattle(param) {
  const raw = decodeURIComponent(param || "");
  if (!UUID_RE.test(raw)) {
    return { row: await getBattleBySlug(raw), redirect: false };
  }
  const row = await getBattleById(raw);
  return { row, redirect: Boolean(row?.slug) };
}


function pcts(b) {
  const total = (b.left_votes || 0) + (b.right_votes || 0);
  const left = total ? Math.round(((b.left_votes || 0) / total) * 100) : 50;
  return { left, right: 100 - left, total };
}

export async function generateMetadata({ params }) {
  const { row: battle } = await resolveBattle(params.slug);
  if (!battle) return { title: "Battle not found - KastoChha" };
  const { left, right } = pcts(battle);
  // Noindexed for the same reason as the section index: these rotate out
  // within days. The share card metadata below still matters — that is how
  // these travel on TikTok and Facebook, which is their actual channel.
  return {
    ...shareMetadata({
      type: "battle",
      path: `/battle/${battle.slug || battle.id}`,
      title: `${battle.left_title} vs ${battle.right_title}`,
      description: `${battle.category} battle — vote and see what Nepal thinks.`,
      kicker: battle.category,
      stat: `${left}% ${battle.left_title} · ${right}% ${battle.right_title}`
    }),
    robots: NOINDEX_FOLLOW
  };
}

export default async function BattlePermalink({ params }) {
  const { row: battle, redirect } = await resolveBattle(params.slug);

  // 301 so an old uuid link hands its credit — and anyone following it — to the
  // readable URL rather than living alongside it.
  if (redirect && battle?.slug) permanentRedirect(`/battle/${battle.slug}`);

  const { userId } = await auth();
  const myVotes = await getUserVotes(userId, "battle");

  if (!battle) {
    return (
      <>
        <SiteNav />
        <div className="page-hero">
          <div className="page-shell">
            <h1 className="page-title">Battle not found</h1>
            <p className="page-sub">
              It may have been removed. <a href="/battle">Browse battles →</a>
            </p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <SiteNav />
      <div className="page-hero">
        <div className="page-glow"></div>
        <div className="page-shell">
          <div className="page-head">
            <div>
              <div className="page-kicker">{battle.category} battle</div>
              <h1 className="page-title">
                {battle.left_title} <em>vs</em> {battle.right_title}
              </h1>
              <p className="page-sub">
                Vote and decide — Nepal le decide garcha, by experience.
              </p>
            </div>
            <a className="sec-all" href="/battle">
              All battles -&gt;
            </a>
          </div>
        </div>
      </div>

      <section className="section">
        <div className="permalink-single" style={{ maxWidth: 900 }}>
          <BattleSplit battles={[battle]} myVotes={myVotes} />
          <SharePanel
            url={`/battle/${battle.slug || battle.id}`}
            text={`${battle.left_title} vs ${battle.right_title}`}
            heading="Share this battle"
          />
        </div>
      </section>
    </>
  );
}
