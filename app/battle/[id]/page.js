import { auth } from "@clerk/nextjs/server";

import SiteNav from "../../components/SiteNav";
import BattleSplit from "../../components/BattleSplit";
import SharePanel from "../../components/SharePanel";
import { getBattleById, getUserVotes } from "../../../lib/supabase/queries";
import { shareMetadata } from "../../../lib/share";

export const dynamic = "force-dynamic";

function pcts(b) {
  const total = (b.left_votes || 0) + (b.right_votes || 0);
  const left = total ? Math.round(((b.left_votes || 0) / total) * 100) : 50;
  return { left, right: 100 - left, total };
}

export async function generateMetadata({ params }) {
  const battle = await getBattleById(params.id);
  if (!battle) return { title: "Battle not found - KastoChha" };
  const { left, right } = pcts(battle);
  return shareMetadata({
    type: "battle",
    path: `/battle/${battle.id}`,
    title: `${battle.left_title} vs ${battle.right_title}`,
    description: `${battle.category} battle — vote and see what Nepal thinks.`,
    kicker: battle.category,
    stat: `${left}% ${battle.left_title} · ${right}% ${battle.right_title}`
  });
}

export default async function BattlePermalink({ params }) {
  const { userId } = await auth();
  const [battle, myVotes] = await Promise.all([
    getBattleById(params.id),
    getUserVotes(userId, "battle")
  ]);

  if (!battle) {
    return (
      <>
        <SiteNav />
        <div className="page-hero"><div className="page-shell"><h1 className="page-title">Battle not found</h1>
          <p className="page-sub">It may have been removed. <a href="/battle">Browse battles →</a></p></div></div>
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
              <h1 className="page-title">{battle.left_title} <em>vs</em> {battle.right_title}</h1>
              <p className="page-sub">Vote and decide — Nepal le decide garcha, by experience.</p>
            </div>
            <a className="sec-all" href="/battle">All battles -&gt;</a>
          </div>
        </div>
      </div>

      <section className="section">
        <div className="permalink-single" style={{ maxWidth: 900 }}>
          <BattleSplit battles={[battle]} myVotes={myVotes} />
          <SharePanel
            url={`/battle/${battle.id}`}
            text={`${battle.left_title} vs ${battle.right_title}`}
            heading="Share this battle"
          />
        </div>
      </section>
    </>
  );
}
