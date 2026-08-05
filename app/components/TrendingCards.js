"use client";

import ShareRow from "./ShareRow";
import useCardVotes from "./useCardVotes";
import useRevealOnce from "./useRevealOnce";
import { catTone, delayClass, formatTimeAgo } from "./sectionHelpers";
import { IconMeh, IconThumb, IconThumbDown } from "./icons";

// Trending poll grid. Each card asks a "kasto chha?" question and collects a
// three-way verdict: Thik Chha / Thikai Chha / Thik Chhaina.
//
// `myVotes` is the signed-in user's existing votes ({ topicId: side }), read on
// the server, so a reload shows which option they already picked instead of
// offering three fresh-looking buttons that all bounce off a duplicate check.
// Clicking the picked option again withdraws the vote.
const VOTE_CONFIG = {
  endpoint: "/api/votes/trending",
  resultKey: "topic",
  columns: { yes: "votes_yes", mid: "votes_mid", no: "votes_no" }
};

const fmt = (n) => (n || 0).toLocaleString("en-US");

// One card, so it can own its own reveal state (see useRevealOnce for why that
// can't be a class added from outside once the card re-renders).
function TrendingCard({ topic, index, myVote, busy, error, onVote }) {
  const [revealRef, revealed] = useRevealOnce();

  const yes = topic.votes_yes || 0;
  const mid = topic.votes_mid || 0;
  const no = topic.votes_no || 0;
  const total = yes + mid + no;
  const time = formatTimeAgo(topic.created_at);
  const tone = catTone(topic.category);

  const option = (side, count, label, Icon) => (
    <button
      type="button"
      className={`tpoll ${side} ${myVote === side ? "voted" : ""}`}
      aria-pressed={myVote === side}
      title={myVote === side ? "Click again to remove your vote" : undefined}
      disabled={busy}
      onClick={() => onVote(topic.id, side)}
    >
      <span className="tpoll-ico"><Icon className="icon" /></span>
      {label}
      <b className="tpoll-n">{fmt(count)}</b>
    </button>
  );

  return (
    <article
      ref={revealRef}
      className={`tcard bento-card ${delayClass(index)} ${revealed ? "show" : ""} ${
        myVote ? "is-voted" : ""
      }`}
      id={`tr-${topic.id}`}
    >
      <div className="tcard-cat" style={{ color: tone }}>
        <span className="tcard-glyph" style={{ background: tone }} aria-hidden />
        {topic.category}
      </div>

      <h3 className="tcard-title">{topic.title}</h3>
      {topic.description ? <p className="tcard-quote">&ldquo;{topic.description}&rdquo;</p> : null}

      <div className="tcard-divider" />

      <div className="tcard-poll">
        <div className="tcard-polls">
          {option("yes", yes, topic.yes_label || "Thik Chha", IconThumb)}
          {option("mid", mid, topic.mid_label || "Thikai Chha", IconMeh)}
          {option("no", no, topic.no_label || "Thik Chhaina", IconThumbDown)}
        </div>
        <span className="tcard-meta">
          {fmt(total)} votes{time ? ` · ${time}` : ""}
        </span>
      </div>

      {error ? <p className="vote-error" role="status">{error}</p> : null}

      <ShareRow text={topic.title} url={`/trending/${topic.id}`} label="Share" />
    </article>
  );
}

export default function TrendingCards({ topics = [], myVotes = {} }) {
  const { rows, cast, voteOf, isPending, errorFor } = useCardVotes(
    topics,
    myVotes,
    VOTE_CONFIG
  );

  if (rows.length === 0) {
    return (
      <div className="tcard-grid">
        <article className="tcard empty-card">
          <h3 className="tcard-title">No trending topics yet</h3>
          <p className="tcard-quote">Add rows to <strong>trending_topics</strong> in Supabase to populate this section.</p>
        </article>
      </div>
    );
  }

  return (
    <div className="tcard-grid">
      {rows.map((topic, index) => (
        <TrendingCard
          key={topic.id}
          topic={topic}
          index={index}
          myVote={voteOf(topic.id)}
          busy={isPending(topic.id)}
          error={errorFor(topic.id)}
          onVote={cast}
        />
      ))}
    </div>
  );
}
