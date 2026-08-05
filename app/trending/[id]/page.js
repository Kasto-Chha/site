import { auth } from "@clerk/nextjs/server";

import SiteNav from "../../components/SiteNav";
import TrendingCards from "../../components/TrendingCards";
import SharePanel from "../../components/SharePanel";
import { getTrendingTopicById, getUserVotes } from "../../../lib/supabase/queries";
import { shareMetadata } from "../../../lib/share";

export const dynamic = "force-dynamic";

function voteStat(t) {
  const total = (t.votes_yes || 0) + (t.votes_mid || 0) + (t.votes_no || 0);
  return `${total.toLocaleString("en-US")} votes`;
}

export async function generateMetadata({ params }) {
  const topic = await getTrendingTopicById(params.id);
  if (!topic) return { title: "Topic not found - KastoChha" };
  return shareMetadata({
    type: "trending",
    path: `/trending/${topic.id}`,
    title: topic.title,
    description: topic.description,
    kicker: topic.category,
    stat: voteStat(topic)
  });
}

export default async function TrendingPermalink({ params }) {
  const { userId } = await auth();
  const [topic, myVotes] = await Promise.all([
    getTrendingTopicById(params.id),
    getUserVotes(userId, "trending")
  ]);

  if (!topic) {
    return (
      <>
        <SiteNav />
        <div className="page-hero"><div className="page-shell"><h1 className="page-title">Topic not found</h1>
          <p className="page-sub">It may have been removed. <a href="/trending">Browse trending →</a></p></div></div>
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
              <div className="page-kicker">{topic.category}</div>
              <h1 className="page-title">{topic.title}</h1>
              {topic.description ? <p className="page-sub">{topic.description}</p> : null}
            </div>
            <a className="sec-all" href="/trending">All trending -&gt;</a>
          </div>
        </div>
      </div>

      <section className="section">
        <div className="permalink-single" style={{ maxWidth: 560 }}>
          <TrendingCards topics={[topic]} myVotes={myVotes} />
          <SharePanel url={`/trending/${topic.id}`} text={topic.title} heading="Share this poll" />
        </div>
      </section>
    </>
  );
}
