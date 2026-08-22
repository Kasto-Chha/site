"use client";

import ShareRow from "./ShareRow";
import useCardVotes from "./useCardVotes";
import useRevealOnce from "./useRevealOnce";
import { delayClass } from "./sectionHelpers";

// Head-to-head battles. `myVotes` ({ battleId: "a" | "b" }) comes from the
// server so a reload shows the side the user already backed; clicking that side
// again withdraws the vote, clicking the other side switches it.
const VOTE_CONFIG = {
  endpoint: "/api/votes/battle",
  resultKey: "battle",
  columns: { a: "left_votes", b: "right_votes" }
};

const fmt = (n) => (n || 0).toLocaleString("en-US");

// Build the full-bleed background for one side: a product photo if provided,
// otherwise a brand-coloured gradient fading into near-black for legibility.
function sideStyle(image, color, fallback) {
  if (image) {
    return {
      backgroundImage: `linear-gradient(180deg, rgba(8,6,5,.18) 0%, rgba(8,6,5,.66) 100%), url(${image})`
    };
  }
  const c = color || fallback;
  return { backgroundImage: `linear-gradient(150deg, ${c} 0%, rgba(10,8,7,.74) 118%)` };
}

// One battle, so it can own its reveal state — see useRevealOnce.
function BattleCard({ battle, index, myVote, busy, error, onVote }) {
  const [revealRef, revealed] = useRevealOnce();

  const left = battle.left_votes || 0;
  const right = battle.right_votes || 0;
  const total = left + right;
  const leftPct = total ? Math.round((left / total) * 100) : 50;
  const rightPct = total ? 100 - leftPct : 50;
  const leader =
    total === 0 ? "Even" : left === right ? "Dead heat" : left > right ? battle.left_title : battle.right_title;

  const voteLabel = (side, title) =>
    myVote === side ? `Voted ${title} ✓` : `Vote ${title} →`;

  const sideButton = (side, title) => (
    <button
      type="button"
      className={`bsplit-btn ${myVote === side ? "voted" : ""}`}
      aria-pressed={myVote === side}
      title={myVote === side ? "Click again to remove your vote" : undefined}
      disabled={busy}
      onClick={() => onVote(battle.id, side)}
    >
      {voteLabel(side, title)}
    </button>
  );

  return (
    <article
      ref={revealRef}
      className={`bsplit bento-card ${delayClass(index)} ${revealed ? "show" : ""} ${
        index === 0 ? "is-hero" : ""
      }`}
    >
      <div className="bsplit-stage">
        <div className="bsplit-side left" style={sideStyle(battle.left_image, battle.left_color, "#c8102e")}>
          <span className="bsplit-cat">{battle.category}</span>
          <h3 className="bsplit-name">{battle.left_title}</h3>
          {battle.left_desc ? <p className="bsplit-desc">{battle.left_desc}</p> : null}
          {sideButton("a", battle.left_title)}
        </div>

        <div className="bsplit-side right" style={sideStyle(battle.right_image, battle.right_color, "#1f5fae")}>
          <span className="bsplit-cat">{battle.category}</span>
          <h3 className="bsplit-name">{battle.right_title}</h3>
          {battle.right_desc ? <p className="bsplit-desc">{battle.right_desc}</p> : null}
          {sideButton("b", battle.right_title)}
        </div>

        <span className="bsplit-pct left">{leftPct}%</span>
        <span className="bsplit-pct right">{rightPct}%</span>
        <div className="bsplit-vs" aria-hidden>VS</div>
      </div>

      <div className="bsplit-bar">
        <div className="bsplit-fill a" style={{ width: `${leftPct}%` }} />
        <div className="bsplit-fill b" style={{ width: `${rightPct}%` }} />
      </div>

      <div className="bsplit-foot">
        <div className="bsplit-tally">
          <span>{fmt(total)} total votes</span>
          <span className="bsplit-leader"> · {leader} leading</span>
        </div>
        <ShareRow
          text={`${battle.left_title} vs ${battle.right_title}`}
          url={`/battle/${battle.slug || battle.id}`}
          label="Share"
        />
      </div>

      {error ? <p className="vote-error" role="status">{error}</p> : null}
    </article>
  );
}

export default function BattleSplit({ battles = [], myVotes = {} }) {
  const { rows, cast, voteOf, isPending, errorFor } = useCardVotes(
    battles,
    myVotes,
    VOTE_CONFIG
  );

  if (rows.length === 0) {
    return (
      <div className="bsplit-list">
        <div className="bsplit empty-card" style={{ padding: 28 }}>
          <div className="tcard-title">No battles yet</div>
          <p className="tcard-quote">Add rows to <strong>battles</strong> in Supabase to start collecting votes.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bsplit-list">
      {rows.map((battle, index) => (
        <BattleCard
          key={battle.id}
          battle={battle}
          index={index}
          myVote={voteOf(battle.id)}
          busy={isPending(battle.id)}
          error={errorFor(battle.id)}
          onVote={cast}
        />
      ))}
    </div>
  );
}
