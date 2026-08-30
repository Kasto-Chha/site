"use client";

import Image from "next/image";

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

// The no-photo fallback: a brand-coloured gradient fading into near-black for
// legibility. Used as-is via inline style, since it is CSS, not an image —
// nothing here for next/image to optimize.
function fallbackStyle(color, fallback) {
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

  // A photo, if one was set, plus the text. The image and the darkening
  // overlay are both absolutely positioned behind the text (see
  // .bsplit-side's position:relative in globals.css) — previously this whole
  // stack was a single CSS background-image, which next/image cannot
  // optimize; `fill` is next/image's way of taking over exactly that same
  // absolutely-positioned-backdrop role.
  const renderSide = (image, color, fallback, title, desc, category, side) => (
    <div
      className={`bsplit-side ${side} ${image ? "has-photo" : ""}`}
      style={image ? undefined : fallbackStyle(color, fallback)}
    >
      {image ? (
        <Image
          src={image}
          alt=""
          fill
          sizes="(max-width: 720px) 100vw, 50vw"
          style={{ objectFit: "cover" }}
          // Every visible battle card is above the fold on a page with very
          // little else on it — this is exactly the kind of image `priority`
          // exists for, not a default to reach for everywhere.
          priority={index === 0}
        />
      ) : null}
      <div className="bsplit-side-content">
        <span className="bsplit-cat">{category}</span>
        <h3 className="bsplit-name">{title}</h3>
        {desc ? <p className="bsplit-desc">{desc}</p> : null}
        {sideButton(side === "left" ? "a" : "b", title)}
      </div>
    </div>
  );

  return (
    <article
      ref={revealRef}
      className={`bsplit bento-card ${delayClass(index)} ${revealed ? "show" : ""} ${
        index === 0 ? "is-hero" : ""
      }`}
    >
      <div className="bsplit-stage">
        {renderSide(
          battle.left_image,
          battle.left_color,
          "#c8102e",
          battle.left_title,
          battle.left_desc,
          battle.category,
          "left"
        )}
        {renderSide(
          battle.right_image,
          battle.right_color,
          "#1f5fae",
          battle.right_title,
          battle.right_desc,
          battle.category,
          "right"
        )}

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
