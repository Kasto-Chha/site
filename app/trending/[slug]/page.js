import { auth } from "@clerk/nextjs/server";
import { permanentRedirect } from "next/navigation";

import SiteNav from "../../components/SiteNav";
import TrendingCards from "../../components/TrendingCards";
import SharePanel from "../../components/SharePanel";
import {
  getTrendingTopicById,
  getTrendingTopicBySlug,
  getUserVotes,
} from "../../../lib/supabase/queries";
import { shareMetadata } from "../../../lib/share";
import { NOINDEX_FOLLOW } from "../../../lib/seo/indexable";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Accepts either shape. Links shared before slugs existed carry a uuid: look
// the row up by id, then 301 to its slug URL so the old link keeps working.
async function resolveTopic(param) {
  const raw = decodeURIComponent(param || "");
  if (!UUID_RE.test(raw)) {
    return { row: await getTrendingTopicBySlug(raw), redirect: false };
  }
  const row = await getTrendingTopicById(raw);
  return { row, redirect: Boolean(row?.slug) };
}


function voteStat(t) {
  const total = (t.votes_yes || 0) + (t.votes_mid || 0) + (t.votes_no || 0);
  return `${total.toLocaleString("en-US")} votes`;
}

export async function generateMetadata({ params }) {
  const { row: topic } = await resolveTopic(params.slug);
  if (!topic) return { title: "Topic not found - KastoChha" };
  // Noindexed for the same reason as the section index: these rotate out
  // within days. The share card metadata below still matters — that is how
  // these travel on TikTok and Facebook, which is their actual channel.
  return {
    ...shareMetadata({
      type: "trending",
      path: `/trending/${topic.slug || topic.id}`,
      title: topic.title,
      description: topic.description,
      kicker: topic.category,
      stat: voteStat(topic)
    }),
    robots: NOINDEX_FOLLOW
  };
}

export default async function TrendingPermalink({ params }) {
  const { row: topic, redirect } = await resolveTopic(params.slug);

  // 301 so an old uuid link hands its credit — and anyone following it — to the
  // readable URL rather than living alongside it.
  if (redirect && topic?.slug) permanentRedirect(`/trending/${topic.slug}`);

  const { userId } = await auth();
  const myVotes = await getUserVotes(userId, "trending");

  if (!topic) {
    return (
      <>
        <SiteNav />
        <div className="page-hero">
          <div className="page-shell">
            <h1 className="page-title">Topic not found</h1>
            <p className="page-sub">
              It may have been removed.{" "}
              <a href="/trending">Browse trending →</a>
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
              <div className="page-kicker">{topic.category}</div>
              <h1 className="page-title">{topic.title}</h1>
              {topic.description ? (
                <p className="page-sub">{topic.description}</p>
              ) : null}
            </div>
            <a className="sec-all" href="/trending">
              All trending -&gt;
            </a>
          </div>
        </div>
      </div>

      <section className="section">
        <div className="permalink-single" style={{ maxWidth: 560 }}>
          <TrendingCards topics={[topic]} myVotes={myVotes} />
          <SharePanel
            url={`/trending/${topic.slug || topic.id}`}
            text={topic.title}
            heading="Share this poll"
          />
        </div>
      </section>
    </>
  );
}
